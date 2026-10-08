import { randomUUID } from 'node:crypto';

// Identity persistence for Firebase Auth accounts in Neon PostgreSQL.
//
// Firebase owns authentication. This repository owns the business identity:
// the local user row, wallet, versioned consent, Minimum-KYC state, and the
// append-only authentication audit trail used for fraud review.
export function createIdentityRepository(pool) {
  function toBuffer(hexValue) {
    return typeof hexValue === 'string' && hexValue.length > 0 ? Buffer.from(hexValue, 'hex') : null;
  }

  async function saveConsent(client, userId, consent) {
    if (!consent) {
      return;
    }

    const entries = [
      ['terms', consent.termsVersion, true],
      ['privacy_notice', consent.privacyVersion, true],
      ['adult_self_declaration', consent.termsVersion, consent.adultConfirmed === true],
      ['analytics', consent.termsVersion, consent.analyticsOptIn === true],
      ['personalized_offers', consent.termsVersion, consent.personalizedOffersOptIn === true],
    ];

    for (const [consentType, policyVersion, granted] of entries) {
      if (!policyVersion) {
        continue;
      }

      await client.query(`
        INSERT INTO user_consents (user_id, consent_type, policy_version, granted)
        SELECT $1, $2::VARCHAR(64), $3::VARCHAR(64), $4
        WHERE NOT EXISTS (
          SELECT 1 FROM user_consents
          WHERE user_id = $1
            AND consent_type = $2::VARCHAR(64)
            AND policy_version = $3::VARCHAR(64)
        )
      `, [userId, consentType, policyVersion, granted]);
    }
  }

  async function provisionUser(client, identity, consent) {
    const fullName = identity.fullName?.trim() || identity.displayName?.trim()
      || (identity.email ? identity.email.split('@')[0] : 'Zivora user');

    const result = await client.query(`
      INSERT INTO users (
        id, email, phone, full_name, status,
        firebase_uid, sign_in_provider, photo_url,
        email_verified_at, phone_verified_at, adult_self_declared_at, last_sign_in_at
      ) VALUES (
        $1, $2, $3, $4, 'active',
        $5, $6, $7,
        CASE WHEN $8::BOOLEAN THEN NOW() ELSE NULL END,
        CASE WHEN $9::BOOLEAN THEN NOW() ELSE NULL END,
        CASE WHEN $10::BOOLEAN THEN NOW() ELSE NULL END,
        NOW()
      )
      RETURNING id, email, full_name, firebase_uid, phone, status,
                email_verified_at, phone_verified_at, minimum_kyc_verified_at,
                adult_self_declared_at
    `, [
      randomUUID(),
      identity.email,
      identity.phoneNumber ?? null,
      fullName,
      identity.uid,
      identity.signInProvider,
      identity.photoUrl ?? null,
      identity.emailVerified === true,
      identity.phoneVerified === true,
      consent?.adultConfirmed === true,
    ]);

    const user = result.rows[0];
    if (!user) {
      return null;
    }

    await client.query(`
      INSERT INTO wallets (user_id, balance, currency_code, status)
      VALUES ($1, 0, 'INR', 'active')
      ON CONFLICT (user_id) DO NOTHING
    `, [user.id]);

    await saveConsent(client, user.id, consent);

    await client.query(`
      INSERT INTO audit_logs (user_id, entity_type, entity_id, action, actor_type, actor_id, details)
      VALUES ($1, 'user', $1, 'user_provisioned', 'system', $2, $3::jsonb)
    `, [user.id, identity.uid, JSON.stringify({
      signInProvider: identity.signInProvider,
      emailVerified: identity.emailVerified === true,
      termsVersion: consent?.termsVersion ?? null,
      privacyVersion: consent?.privacyVersion ?? null,
    })]);

    return { ...user, created: true };
  }

  return {
    // Signs a Firebase identity into the platform. Existing accounts are
    // refreshed; new accounts require a consent snapshot captured against the
    // currently published policy versions.
    // Creates or refreshes the Neon-backed account for a verified Firebase
    // identity. Email and phone are unique per person, so ownership is checked
    // before any write: a refresh, a legacy adoption, and a new signup are all
    // guarded, and a UNIQUE violation can never surface as a 500.
    async upsertFirebaseUser(identity, consent) {
      if (!identity?.uid) {
        throw new TypeError('Firebase identity requires a uid');
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identity.uid]);

        const existing = await client.query(`
          SELECT id, email, full_name, firebase_uid, phone, status,
                 email_verified_at, phone_verified_at, minimum_kyc_verified_at,
                 tokens_revoked_before, sign_in_provider
          FROM users
          WHERE firebase_uid = $1
          LIMIT 1
          FOR UPDATE
        `, [identity.uid]);
        const currentUser = existing.rows[0] ?? null;

        // A row sharing this email but with no Firebase UID predates Firebase
        // Auth and may be adopted below. A row owned by a different Firebase UID
        // is an account-takeover attempt and is refused.
        let adoptableRow = null;

        if (identity.email) {
          const owner = await client.query(`
            SELECT id, firebase_uid
            FROM users
            WHERE lower(email) = lower($1)
            LIMIT 1
            FOR UPDATE
          `, [identity.email]);
          const ownerRow = owner.rows[0] ?? null;

          if (ownerRow?.firebase_uid && ownerRow.firebase_uid !== identity.uid) {
            await client.query('ROLLBACK');
            return { conflict: 'email_already_linked', created: false };
          }
          if (ownerRow && !ownerRow.firebase_uid && !currentUser) {
            adoptableRow = ownerRow;
          }
        }

        if (identity.phoneNumber) {
          const owner = await client.query(`
            SELECT id, firebase_uid
            FROM users
            WHERE phone = $1
            LIMIT 1
            FOR UPDATE
          `, [identity.phoneNumber]);
          const ownerRow = owner.rows[0] ?? null;

          if (ownerRow && ownerRow.firebase_uid !== identity.uid) {
            await client.query('ROLLBACK');
            return { conflict: 'phone_already_linked', created: false };
          }
        }

        // Only a phone Firebase actually verified may set phone_verified_at.
        const phoneVerified = identity.phoneVerified === true;

        if (currentUser) {
          // A Firebase account can add providers over time (email link first,
          // Google later). Only fill in values that are still unknown, and only
          // promote verification timestamps forward.
          const refreshed = await client.query(`
            UPDATE users
            SET email = COALESCE(users.email, $2),
                full_name = CASE
                  WHEN users.full_name IS NULL OR users.full_name = ''
                    THEN COALESCE($6::TEXT, users.full_name)
                  WHEN $6::TEXT IS NOT NULL AND users.full_name = split_part(COALESCE(users.email, ''), '@', 1)
                    THEN $6::TEXT
                  ELSE users.full_name
                END,
                phone = COALESCE(users.phone, $3),
                sign_in_provider = COALESCE($4, users.sign_in_provider),
                photo_url = COALESCE($5, users.photo_url),
                email_verified_at = CASE
                  WHEN $7::BOOLEAN AND users.email_verified_at IS NULL THEN NOW()
                  ELSE users.email_verified_at
                END,
                phone_verified_at = CASE
                  WHEN $9::BOOLEAN AND users.phone_verified_at IS NULL THEN NOW()
                  ELSE users.phone_verified_at
                END,
                adult_self_declared_at = CASE
                  WHEN $8::BOOLEAN AND users.adult_self_declared_at IS NULL THEN NOW()
                  ELSE users.adult_self_declared_at
                END,
                last_sign_in_at = NOW(),
                updated_at = NOW()
            WHERE users.id = $1
            RETURNING id, email, full_name, firebase_uid, phone, status,
                      email_verified_at, phone_verified_at, minimum_kyc_verified_at
          `, [
            currentUser.id,
            identity.email,
            identity.phoneNumber ?? null,
            identity.signInProvider ?? null,
            identity.photoUrl ?? null,
            identity.displayName?.trim() || null,
            identity.emailVerified === true,
            consent?.adultConfirmed === true,
            phoneVerified,
          ]);

          if (consent) {
            await saveConsent(client, currentUser.id, consent);
          }

          await client.query('COMMIT');
          return { ...refreshed.rows[0], created: false };
        }

        if (adoptableRow) {
          const adopted = await client.query(`
            UPDATE users
            SET firebase_uid = $2,
                sign_in_provider = $3,
                photo_url = COALESCE($4, photo_url),
                full_name = CASE WHEN $5::TEXT IS NOT NULL THEN $5::TEXT ELSE full_name END,
                phone = COALESCE(phone, $6),
                email_verified_at = COALESCE(
                  email_verified_at,
                  CASE WHEN $7::BOOLEAN THEN NOW() ELSE NULL END
                ),
                phone_verified_at = COALESCE(
                  phone_verified_at,
                  CASE WHEN $9::BOOLEAN THEN NOW() ELSE NULL END
                ),
                adult_self_declared_at = COALESCE(
                  adult_self_declared_at,
                  CASE WHEN $8::BOOLEAN THEN NOW() ELSE NULL END
                ),
                last_sign_in_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, email, full_name, firebase_uid, phone, status,
                      email_verified_at, phone_verified_at, minimum_kyc_verified_at
          `, [
            adoptableRow.id,
            identity.uid,
            identity.signInProvider ?? null,
            identity.photoUrl ?? null,
            identity.displayName?.trim() || null,
            identity.phoneNumber ?? null,
            identity.emailVerified === true,
            consent?.adultConfirmed === true,
            phoneVerified,
          ]);

          if (consent) {
            await saveConsent(client, adoptableRow.id, consent);
          }

          await client.query(`
            INSERT INTO wallets (user_id, balance, currency_code, status)
            VALUES ($1, 0, 'INR', 'active')
            ON CONFLICT (user_id) DO NOTHING
          `, [adoptableRow.id]);

          await client.query(`
            INSERT INTO audit_logs (user_id, entity_type, entity_id, action, actor_type, actor_id, details)
            VALUES ($1, 'user', $1, 'firebase_account_adopted', 'system', $2, $3::jsonb)
          `, [adoptableRow.id, identity.uid, JSON.stringify({
            signInProvider: identity.signInProvider ?? null,
            phoneVerified,
          })]);

          await client.query('COMMIT');
          return { ...adopted.rows[0], created: false, adopted: true };
        }

        if (!consent) {
          await client.query('ROLLBACK');
          return { conflict: 'consent_required', created: false };
        }

        const user = await provisionUser(client, identity, consent);
        if (!user) {
          await client.query('ROLLBACK');
          return { conflict: 'provisioning_failed', created: false };
        }

        await client.query('COMMIT');
        return { ...user, created: true };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async findByFirebaseUid(firebaseUid) {
      const result = await pool.query(`
        SELECT id, email, full_name, phone, status, firebase_uid, sign_in_provider,
               email_verified_at, phone_verified_at, minimum_kyc_verified_at,
               adult_self_declared_at, tokens_revoked_before, last_sign_in_at, created_at
        FROM users
        WHERE firebase_uid = $1
        LIMIT 1
      `, [firebaseUid]);
      return result.rows[0] ?? null;
    },

    async findUserById(userId) {
      const result = await pool.query(`
        SELECT id, email, full_name, phone, status, firebase_uid, sign_in_provider,
               email_verified_at, phone_verified_at, minimum_kyc_verified_at,
               adult_self_declared_at, tokens_revoked_before, last_sign_in_at, created_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `, [userId]);
      return result.rows[0] ?? null;
    },

    async findLatestConsent(userId) {
      const result = await pool.query(`
        SELECT consent_type, policy_version, granted, granted_at
        FROM user_consents
        WHERE user_id = $1
        ORDER BY granted_at DESC
      `, [userId]);
      return result.rows;
    },

    // Payout gate: Minimum KYC plus an active, non-revoked account.
    async findPayoutEligibility(userId) {
      const result = await pool.query(`
        SELECT status,
               phone_verified_at IS NOT NULL AS phone_verified,
               minimum_kyc_verified_at IS NOT NULL AS minimum_kyc_verified,
               minimum_kyc_verified_at,
               tokens_revoked_before,
               adult_self_declared_at IS NOT NULL AS adult_self_declared
        FROM users
        WHERE id = $1
      `, [userId]);

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        status: row.status,
        phoneVerified: row.phone_verified === true,
        minimumKycVerified: row.minimum_kyc_verified === true,
        minimumKycVerifiedAt: row.minimum_kyc_verified_at ?? null,
        tokensRevokedBefore: row.tokens_revoked_before ?? null,
        adultSelfDeclared: row.adult_self_declared === true,
      };
    },

    // Minimum KYC for cash payouts: binds a Firebase-verified phone to one
    // account. The advisory lock serializes concurrent attempts on the same
    // phone, and the UNIQUE constraint on users.phone stays as the backstop.
    async markMinimumKycVerified(userId, phone, firebaseUid) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);

        const conflict = await client.query(`
          SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1
        `, [phone, userId]);

        if (conflict.rows[0]) {
          await client.query('ROLLBACK');
          return false;
        }

        const result = await client.query(`
          UPDATE users
          SET phone = $2,
              firebase_uid = COALESCE(firebase_uid, $3),
              phone_verified_at = COALESCE(phone_verified_at, NOW()),
              minimum_kyc_verified_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
            AND status = 'active'
          RETURNING id
        `, [userId, phone, firebaseUid ?? null]);

        if (result.rowCount !== 1) {
          await client.query('ROLLBACK');
          return false;
        }

        await client.query(`
          INSERT INTO audit_logs (user_id, entity_type, entity_id, action, actor_type, actor_id, details)
          VALUES ($1, 'user', $1, 'minimum_kyc_verified', 'user', $2, $3::jsonb)
        `, [userId, firebaseUid ?? null, JSON.stringify({ method: 'firebase_phone_otp' })]);

        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        // 23505 = unique violation: another account claimed the phone first.
        if (error?.code === '23505') {
          return false;
        }
        throw error;
      } finally {
        client.release();
      }
    },

    // Invalidates every API access token issued before this moment. Firebase
    // tokens themselves are revoked in the Firebase console/Admin SDK; this is
    // the platform-side kill switch for our own short-lived session tokens.
    async revokeSessionsBefore(userId, revokedBefore = new Date()) {
      const result = await pool.query(`
        UPDATE users
        SET tokens_revoked_before = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [userId, revokedBefore]);
      return result.rowCount === 1;
    },

    async recordAuthEvent(event) {
      await pool.query(`
        INSERT INTO firebase_auth_events (
          user_id, firebase_uid, event_type, sign_in_provider, auth_time,
          outcome, reason, request_ip_hash, user_agent_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        event.userId ?? null,
        event.firebaseUid ?? null,
        event.eventType,
        event.signInProvider ?? null,
        event.authTime ? new Date(event.authTime * 1000) : null,
        event.outcome ?? 'success',
        event.reason ?? null,
        toBuffer(event.requestIpHash),
        toBuffer(event.userAgentHash),
      ]);
    },

    // Sliding-window counters used to throttle repeated token exchanges.
    async countRecentAuthEvents({ firebaseUid, requestIpHash, minutes = 15, outcome = null, userId = null }) {
      const conditions = [`created_at > NOW() - ($1::text || ' minutes')::interval`];
      const params = [minutes];

      if (firebaseUid) {
        params.push(firebaseUid);
        conditions.push(`firebase_uid = $${params.length}`);
      }
      if (userId) {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }
      if (requestIpHash) {
        params.push(toBuffer(requestIpHash));
        conditions.push(`request_ip_hash = $${params.length}`);
      }
      if (outcome) {
        params.push(outcome);
        conditions.push(`outcome = $${params.length}`);
      }

      const result = await pool.query(
        `SELECT COUNT(*)::int AS count FROM firebase_auth_events WHERE ${conditions.join(' AND ')}`,
        params,
      );
      return result.rows[0]?.count ?? 0;
    },

    async pruneAuthEvents(olderThanDays = 540) {
      const result = await pool.query(
        `DELETE FROM firebase_auth_events WHERE created_at < NOW() - ($1::text || ' days')::interval`,
        [olderThanDays],
      );
      return result.rowCount ?? 0;
    },
  };
}
