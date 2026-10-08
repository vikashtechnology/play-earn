// Neon smoke test for the Firebase-backed identity layer.
//
// It writes synthetic records to the configured Neon database, asserts the
// guarantees the platform depends on (unique Firebase UID, wallet creation,
// versioned consent, phone uniqueness for Minimum KYC including refresh and
// adoption paths, verified-contact rules, session revocation, and the auth
// event trail), then deletes everything it created.
//
// Requires: POSTGRES_URL / MIGRATIONS_DATABASE_URL pointing at Neon with
// migration 005 applied. Run: npm --workspace @rewards-platform/api run smoke:identity
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';

import { pool } from '../src/db.js';
import { createIdentityRepository } from '../src/db/identityRepository.js';
import { createOtpRepository } from '../src/db/otpRepository.js';

const identity = createIdentityRepository(pool);
const otp = createOtpRepository(pool);

const runId = randomUUID();
const secret = randomBytes(32);
const hash = (value) => createHmac('sha256', secret).update(value).digest('hex');

const primaryUid = `smoke-uid-${runId}`;
const secondUid = `smoke-uid-second-${runId}`;
const email = `smoke-${runId}@example.invalid`;
const phone = `+916${randomInt(100000000, 1000000000)}`;
const secondPhone = `+917${randomInt(100000000, 1000000000)}`;

const consent = {
  adultConfirmed: true,
  termsAccepted: true,
  privacyAccepted: true,
  analyticsOptIn: false,
  personalizedOffersOptIn: false,
  termsVersion: 'smoke-terms',
  privacyVersion: 'smoke-privacy',
};

function firebaseIdentity(overrides = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    uid: primaryUid,
    email,
    emailVerified: true,
    phoneNumber: null,
    phoneVerified: false,
    displayName: 'Synthetic Smoke User',
    photoUrl: null,
    signInProvider: 'google.com',
    signInSecondFactor: null,
    tenant: null,
    nonce: null,
    authTime: nowSeconds - 5,
    issuedAt: nowSeconds - 5,
    expiresAt: nowSeconds + 3600,
    ...overrides,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const createdUserIds = [];

try {
  // 1. First sign-in provisions the account, wallet, and consent rows.
  const created = await identity.upsertFirebaseUser(firebaseIdentity(), consent);
  assert(created?.created === true, 'Firebase sign-up did not create a Neon user');
  assert(typeof created.id === 'string', 'user id was not returned');
  createdUserIds.push(created.id);

  const wallet = await pool.query('SELECT balance, currency_code, status FROM wallets WHERE user_id = $1', [created.id]);
  assert(wallet.rowCount === 1, 'a wallet was not created alongside the account');
  assert(Number(wallet.rows[0].balance) === 0, 'a new wallet must start at zero');

  const consentRows = await pool.query(
    "SELECT consent_type, policy_version, granted FROM user_consents WHERE user_id = $1 ORDER BY consent_type",
    [created.id],
  );
  const consentTypes = consentRows.rows.map((row) => row.consent_type);
  for (const expected of ['adult_self_declaration', 'analytics', 'personalized_offers', 'privacy_notice', 'terms']) {
    assert(consentTypes.includes(expected), `missing consent row: ${expected}`);
  }
  assert(
    consentRows.rows.find((row) => row.consent_type === 'analytics')?.granted === false,
    'analytics consent must be stored as denied when the user opted out',
  );

  // 2. A returning Firebase UID must not create a second account.
  const returning = await identity.upsertFirebaseUser(firebaseIdentity());
  assert(returning.created === false, 'returning sign-in created a duplicate account');
  assert(returning.id === created.id, 'returning sign-in resolved to a different user');
  const userCount = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [email]);
  assert(userCount.rows[0].count === 1, 'duplicate users exist for one email');

  // 3. A different Firebase UID cannot take over an existing email.
  const takeover = await identity.upsertFirebaseUser(firebaseIdentity({ uid: secondUid }));
  assert(takeover.conflict === 'email_already_linked', 'email takeover protection failed');

  // 4. New accounts without consent are refused.
  const noConsent = await identity.upsertFirebaseUser(firebaseIdentity({
    uid: `${secondUid}-noconsent`,
    email: `smoke-noconsent-${runId}@example.invalid`,
  }));
  assert(noConsent.conflict === 'consent_required', 'account creation without consent was allowed');

  // 5. Minimum KYC binds a unique verified phone to the account.
  const kycVerified = await identity.markMinimumKycVerified(created.id, phone, primaryUid);
  assert(kycVerified === true, 'Minimum KYC verification failed');

  const eligibility = await identity.findPayoutEligibility(created.id);
  assert(eligibility.minimumKycVerified === true, 'payout eligibility did not report Minimum KYC');
  assert(eligibility.status === 'active', 'account status is not active');

  const phoneTakeover = await identity.upsertFirebaseUser(firebaseIdentity({
    uid: `${secondUid}-phone`,
    email: `smoke-phone-${runId}@example.invalid`,
    phoneNumber: phone,
    phoneVerified: true,
    signInProvider: 'phone.com',
  }), consent);
  assert(phoneTakeover.conflict === 'phone_already_linked', 'a second account adopted an already-linked phone');
  if (phoneTakeover.id) {
    createdUserIds.push(phoneTakeover.id);
  }

  // 5b. A returning sign-in must not adopt a phone another account owns. This
  //     is the path that a UNIQUE violation would otherwise turn into a 500.
  const refreshTakeover = await identity.upsertFirebaseUser(firebaseIdentity({
    phoneNumber: phone,
    phoneVerified: true,
  }));
  assert(refreshTakeover.conflict === 'phone_already_linked', 'a refresh adopted an already-linked phone');

  // 5c. PostgreSQL allows many NULLs in a UNIQUE column, so accounts without a
  //     phone must coexist. The in-memory emulator used in unit tests cannot
  //     verify this, which is why it belongs here.
  const nullPhoneUser = await identity.upsertFirebaseUser(firebaseIdentity({
    uid: `${secondUid}-nullphone`,
    email: `smoke-nullphone-${runId}@example.invalid`,
    phoneNumber: null,
  }), consent);
  assert(nullPhoneUser.created === true, 'a second account without a phone could not be created');
  if (nullPhoneUser.id) {
    createdUserIds.push(nullPhoneUser.id);
  }

  // 5d. Only a Firebase-verified claim may set phone_verified_at.
  const unverifiedPhoneUser = await identity.upsertFirebaseUser(firebaseIdentity({
    uid: `${secondUid}-unverified`,
    email: `smoke-unverified-${runId}@example.invalid`,
    phoneNumber: secondPhone,
    phoneVerified: false,
    signInProvider: 'phone.com',
  }), consent);
  assert(unverifiedPhoneUser.created === true, 'an account with an unverified phone could not be created');
  assert(
    unverifiedPhoneUser.phone_verified_at === null,
    'an unverified phone claim was recorded as verified',
  );
  if (unverifiedPhoneUser.id) {
    createdUserIds.push(unverifiedPhoneUser.id);
  }

  // 5e. Minimum KYC refuses a phone that belongs to a different account.
  const kycRejected = await identity.markMinimumKycVerified(nullPhoneUser.id, phone, `${secondUid}-nullphone`);
  assert(kycRejected === false, 'Minimum KYC accepted a phone owned by another account');

  // 6. Session revocation persists a watermark for API tokens.
  const revoked = await identity.revokeSessionsBefore(created.id, new Date());
  assert(revoked === true, 'session revocation was not persisted');
  const revokedRow = await pool.query('SELECT tokens_revoked_before FROM users WHERE id = $1', [created.id]);
  assert(revokedRow.rows[0]?.tokens_revoked_before instanceof Date, 'tokens_revoked_before was not stored');

  // 7. The authentication audit trail accepts events and supports fraud counters.
  await identity.recordAuthEvent({
    userId: created.id,
    firebaseUid: primaryUid,
    eventType: 'session_exchange',
    signInProvider: 'google.com',
    authTime: Math.floor(Date.now() / 1000),
    outcome: 'success',
    requestIpHash: hash('203.0.113.7'),
    userAgentHash: hash('smoke-agent'),
  });
  await identity.recordAuthEvent({
    firebaseUid: primaryUid,
    eventType: 'session_exchange',
    outcome: 'rejected',
    reason: 'unsupported_provider',
    requestIpHash: hash('203.0.113.7'),
  });

  const perUser = await identity.countRecentAuthEvents({ firebaseUid: primaryUid, minutes: 15 });
  assert(perUser === 2, `expected 2 auth events, found ${perUser}`);
  const rejectedPerIp = await identity.countRecentAuthEvents({
    requestIpHash: hash('203.0.113.7'),
    minutes: 15,
    outcome: 'rejected',
  });
  assert(rejectedPerIp === 1, 'rejected sign-in counter did not work');

  // 8. The legacy self-hosted OTP tables still function as a fallback path.
  const phoneHash = hash(`phone:${phone}`);
  const codeHash = hash(`${phone}:654321`);
  await otp.createChallenge({
    id: randomUUID(),
    phoneHash,
    codeHash,
    requestIpHash: null,
    userId: created.id,
    purpose: 'withdrawal',
    expiresAt: new Date(Date.now() + 300000),
  });
  const otpVerified = await otp.verifyChallenge(phoneHash, codeHash, new Date(), {
    userId: created.id,
    purpose: 'withdrawal',
    phone,
  });
  assert(otpVerified, 'legacy withdrawal OTP verification failed');

  // Retention pruning must never touch recent events.
  const pruned = await identity.pruneAuthEvents(540);
  assert(pruned === 0, 'retention pruning removed recent authentication events');

  console.log('IDENTITY_NEON_SMOKE_OK (firebase identity, wallet, consent, contact uniqueness, Minimum KYC, revocation, audit trail)');
} catch (error) {
  console.error('IDENTITY_NEON_SMOKE_FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  for (const userId of createdUserIds) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
  await pool.query('DELETE FROM firebase_auth_events WHERE firebase_uid LIKE $1', [`smoke-uid-%${runId}%`]).catch(() => {});
  await pool.end();
}
