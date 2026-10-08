import { timingSafeEqual } from 'node:crypto';

export function createOtpRepository(pool) {
  return {
    async createChallenge({ id, phoneHash, codeHash, requestIpHash, userId, purpose, expiresAt }) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query("DELETE FROM otp_challenges WHERE created_at < NOW() - INTERVAL '1 day'");
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phoneHash]);

        const phoneLimit = await client.query(`
          SELECT COUNT(*)::int AS count, MAX(created_at) AS latest
          FROM otp_challenges
          WHERE phone_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'
        `, [phoneHash]);

        const phoneStats = phoneLimit.rows[0];
        if (phoneStats.count >= 5 || (phoneStats.latest && Date.now() - new Date(phoneStats.latest).getTime() < 60_000)) {
          throw new Error('OTP_RATE_LIMITED');
        }

        if (requestIpHash) {
          const ipLimit = await client.query(`
            SELECT COUNT(*)::int AS count
            FROM otp_challenges
            WHERE request_ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'
          `, [requestIpHash]);

          if (ipLimit.rows[0].count >= 10) {
            throw new Error('OTP_RATE_LIMITED');
          }
        }

        await client.query(`
          UPDATE otp_challenges
          SET consumed_at = NOW()
          WHERE phone_hash = $1 AND consumed_at IS NULL
        `, [phoneHash]);

        await client.query(`
          INSERT INTO otp_challenges (id, phone_hash, code_hash, request_ip_hash, user_id, purpose, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          id,
          Buffer.from(phoneHash, 'hex'),
          Buffer.from(codeHash, 'hex'),
          requestIpHash ? Buffer.from(requestIpHash, 'hex') : null,
          userId ?? null,
          purpose,
          expiresAt,
        ]);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof Error && error.message === 'OTP_RATE_LIMITED') {
          throw error;
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async invalidateChallenge(id) {
      await pool.query('UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1', [id]);
    },

    async verifyChallenge(phoneHash, candidateHash, now, { userId = null, purpose = 'account', phone = null } = {}) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const result = await client.query(`
          SELECT id, code_hash, expires_at, attempts
          FROM otp_challenges
          WHERE phone_hash = $1
            AND purpose = $2
            AND ($3::UUID IS NULL OR user_id = $3::UUID)
            AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `, [Buffer.from(phoneHash, 'hex'), purpose, userId]);

        const challenge = result.rows[0];
        if (!challenge || new Date(challenge.expires_at) <= now || challenge.attempts >= 5) {
          if (challenge) {
            await client.query('UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
          }
          await client.query('COMMIT');
          return false;
        }

        const expectedHash = Buffer.from(challenge.code_hash);
        const providedHash = Buffer.from(candidateHash, 'hex');
        let matches = expectedHash.length === providedHash.length && timingSafeEqual(expectedHash, providedHash);
        if (matches && purpose === 'withdrawal') {
          const userResult = await client.query(`
            UPDATE users AS target
            SET phone = $2,
                phone_verified_at = COALESCE(target.phone_verified_at, NOW()),
                minimum_kyc_verified_at = NOW(),
                updated_at = NOW()
            WHERE target.id = $1
              AND NOT EXISTS (
                SELECT 1 FROM users AS other
                WHERE other.phone = $2 AND other.id <> target.id
              )
            RETURNING id
          `, [userId, phone]);
          matches = userResult.rowCount === 1;
        }
        const attempts = challenge.attempts + 1;

        await client.query(`
          UPDATE otp_challenges
          SET attempts = $2::SMALLINT, consumed_at = CASE WHEN $3 OR $2::SMALLINT >= 5 THEN NOW() ELSE consumed_at END
          WHERE id = $1
        `, [challenge.id, attempts, matches]);
        await client.query('COMMIT');

        return matches;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}