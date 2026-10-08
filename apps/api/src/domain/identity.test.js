import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  AccountConflictError,
  AccountNotActiveError,
  ConsentRequiredError,
  ContactVerificationRequiredError,
  createIdentityService,
  IdentityError,
  IdentityRateLimitError,
  InvalidFirebaseTokenError,
  PhoneSignInNotAllowedError,
  PhoneVerificationRequiredError,
  StalePolicyVersionError,
  UnsupportedSignInProviderError,
} from './identity.js';
import { FirebaseAuthError } from '../services/firebaseAuth.js';
import { verifyAccessToken } from '../security/session.js';

const JWT_SECRET = 'identity-test-secret';
const TERMS_VERSION = 'terms-2026-10-01';
const PRIVACY_VERSION = 'privacy-2026-10-01';

const GOOGLE_IDENTITY = {
  uid: 'firebase-uid-google',
  email: 'player@example.com',
  emailVerified: true,
  phoneNumber: null,
  phoneVerified: false,
  displayName: 'Test Player',
  photoUrl: null,
  signInProvider: 'google.com',
  signInSecondFactor: null,
  tenant: null,
  nonce: null,
  authTime: Math.floor(Date.now() / 1000) - 5,
  issuedAt: Math.floor(Date.now() / 1000) - 5,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

const PHONE_IDENTITY = {
  ...GOOGLE_IDENTITY,
  uid: 'firebase-uid-phone',
  email: null,
  phoneNumber: '+919876543210',
  phoneVerified: true,
  signInProvider: 'phone.com',
};

function validConsent() {
  return {
    adultConfirmed: true,
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    analyticsOptIn: false,
    personalizedOffersOptIn: false,
    fullName: 'Test Player',
  };
}

// In-memory stand-in for the Neon identity repository. It mirrors the
// guarantees the SQL implementation provides: uniqueness on firebase_uid and
// email, wallet creation, consent rows, and append-only auth events.
function createFakeRepository(seed = {}) {
  const users = new Map(seed.users ?? []);
  const wallets = new Set(seed.wallets ?? []);
  const consents = new Map(seed.consents ?? []);
  const events = [];
  const revocations = new Map();
  const kyc = new Map(seed.kyc ?? []);

  function insertUser(identity, consent) {
    const id = randomUUID();
    const user = {
      id,
      email: identity.email,
      full_name: consent?.fullName ?? identity.displayName ?? 'player',
      phone: identity.phoneNumber ?? null,
      status: 'active',
      firebase_uid: identity.uid,
      sign_in_provider: identity.signInProvider,
      email_verified_at: identity.emailVerified ? new Date() : null,
      phone_verified_at: identity.phoneNumber ? new Date() : null,
      minimum_kyc_verified_at: null,
      adult_self_declared_at: consent?.adultConfirmed ? new Date() : null,
      tokens_revoked_before: null,
      created_at: new Date(),
    };

    users.set(identity.uid, user);
    wallets.add(id);

    if (consent) {
      for (const [type, version, granted] of [
        ['terms', consent.termsVersion, true],
        ['privacy_notice', consent.privacyVersion, true],
        ['adult_self_declaration', consent.termsVersion, consent.adultConfirmed === true],
        ['analytics', consent.termsVersion, consent.analyticsOptIn === true],
        ['personalized_offers', consent.termsVersion, consent.personalizedOffersOptIn === true],
      ]) {
        consents.set(`${id}:${type}`, { consent_type: type, policy_version: version, granted });
      }
    }

    return { ...user, created: true };
  }

  // Returns the live object so mutations persist, unlike the copies the real
  // repository hands back from SQL.
  function mutableUserById(id) {
    for (const user of users.values()) {
      if (user.id === id) {
        return user;
      }
    }
    return null;
  }

  return {
    users,
    wallets,
    consents,
    events,
    revocations,

    async findByFirebaseUid(uid) {
      const user = users.get(uid);
      return user ? { ...user } : null;
    },

    async findUserById(id) {
      for (const user of users.values()) {
        if (user.id === id) {
          return { ...user };
        }
      }
      return null;
    },

    async upsertFirebaseUser(identity, consent) {
      const existing = users.get(identity.uid);

      if (existing) {
        existing.last_sign_in_at = new Date();
        existing.email = existing.email ?? identity.email;
        existing.phone = existing.phone ?? identity.phoneNumber;
        if (consent) {
          for (const [type, version] of [['terms', consent.termsVersion], ['privacy_notice', consent.privacyVersion]]) {
            consents.set(`${existing.id}:${type}`, { consent_type: type, policy_version: version, granted: true });
          }
        }
        return { ...existing, created: false };
      }

      if (identity.email) {
        for (const user of users.values()) {
          if (user.email?.toLowerCase() === identity.email.toLowerCase()) {
            if (user.firebase_uid && user.firebase_uid !== identity.uid) {
              return { conflict: 'email_already_linked', created: false };
            }
            user.firebase_uid = identity.uid;
            return { ...user, created: false, adopted: true };
          }
        }
      }

      if (identity.phoneNumber) {
        for (const user of users.values()) {
          if (user.phone === identity.phoneNumber && user.firebase_uid !== identity.uid) {
            return { conflict: 'phone_already_linked', created: false };
          }
        }
      }

      if (!consent) {
        return { conflict: 'consent_required', created: false };
      }

      return insertUser(identity, consent);
    },

    async findLatestConsent(userId) {
      return [...consents.values()]
        .filter((entry) => consents.get(`${userId}:${entry.consent_type}`) === entry)
        .map((entry) => ({ ...entry, granted_at: new Date() }));
    },

    async findPayoutEligibility(userId) {
      const user = mutableUserById(userId);
      if (!user) {
        return null;
      }

      return {
        status: user.status,
        phoneVerified: Boolean(user.phone_verified_at),
        minimumKycVerified: kyc.get(userId) === true,
        minimumKycVerifiedAt: kyc.get(userId) ? new Date() : null,
        tokensRevokedBefore: user.tokens_revoked_before,
        adultSelfDeclared: Boolean(user.adult_self_declared_at),
      };
    },

    async markMinimumKycVerified(userId, phone, firebaseUid) {
      const user = mutableUserById(userId);
      if (!user || user.status !== 'active') {
        return false;
      }
      for (const other of users.values()) {
        if (other.phone === phone && other.id !== userId) {
          return false;
        }
      }

      user.phone = phone;
      user.phone_verified_at = user.phone_verified_at ?? new Date();
      user.firebase_uid = user.firebase_uid ?? firebaseUid;
      kyc.set(userId, true);
      user.minimum_kyc_verified_at = new Date();
      return true;
    },

    async revokeSessionsBefore(userId, revokedBefore) {
      const user = mutableUserById(userId);
      if (!user) {
        return false;
      }
      user.tokens_revoked_before = revokedBefore;
      revocations.set(userId, revokedBefore);
      return true;
    },

    async recordAuthEvent(event) {
      events.push({ ...event, createdAt: new Date() });
    },

    async countRecentAuthEvents({ firebaseUid, requestIpHash, outcome, userId }) {
      return events.filter((event) => {
        if (firebaseUid && event.firebaseUid !== firebaseUid) return false;
        if (requestIpHash && event.requestIpHash !== requestIpHash) return false;
        if (outcome && event.outcome !== outcome) return false;
        if (userId && event.userId !== userId) return false;
        return true;
      }).length;
    },

    kyc,
  };
}

function createFirebaseAuthStub(identityOrError) {
  return {
    async verifyIdToken() {
      if (identityOrError instanceof Error) {
        throw identityOrError;
      }
      return identityOrError;
    },
  };
}

function createService({ repository, firebaseIdentity = GOOGLE_IDENTITY, tokenError = null, ...overrides } = {}) {
  return createIdentityService({
    repository: repository ?? createFakeRepository(),
    firebaseAuth: createFirebaseAuthStub(tokenError ?? firebaseIdentity),
    jwtSecret: JWT_SECRET,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    allowedSignInProviders: ['google.com', 'phone.com', 'emailLink', 'password'],
    ...overrides,
  });
}

test('first Firebase sign-in provisions a Neon account, wallet, consent, and API session', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });

  const session = await service.exchangeFirebaseSession({
    idToken: 'valid.firebase.token',
    consent: validConsent(),
    requestIpHash: 'a'.repeat(64),
  });

  assert.equal(session.isNewAccount, true);
  assert.equal(session.tokenType, 'Bearer');
  assert.equal(session.expiresInSeconds, 900);
  assert.equal(session.user.email, 'player@example.com');
  assert.equal(session.user.firebaseUid, 'firebase-uid-google');
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.minimumKycVerified, false);

  // The API session is our own short-lived token, not a Firebase token.
  const claims = verifyAccessToken(session.accessToken, JWT_SECRET, { scope: 'user' });
  assert.equal(claims.sub, session.user.id);
  assert.equal(claims.fuid, 'firebase-uid-google');
  assert.equal(claims.provider, 'google.com');
  assert.equal(claims.exp - claims.iat, 900);

  assert.equal(repository.wallets.has(session.user.id), true, 'a wallet must be created with the account');
  assert.deepEqual(
    [...repository.consents.keys()].filter((key) => key.endsWith(':terms')).length,
    1,
  );
  assert.equal(repository.consents.get(`${session.user.id}:terms`).policy_version, TERMS_VERSION);
  assert.equal(repository.events[0].eventType, 'account_created');
  assert.equal(repository.events[0].outcome, 'success');
});

test('a returning Firebase user signs in again without re-accepting policies', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });

  const first = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });
  const second = await service.exchangeFirebaseSession({ idToken: 'token' });

  assert.equal(first.isNewAccount, true);
  assert.equal(second.isNewAccount, false);
  assert.equal(second.user.id, first.user.id);
  assert.equal(repository.events.at(-1).eventType, 'session_exchange');
});

test('new accounts are refused without consent, and stale consent versions are refused', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token' }),
    ConsentRequiredError,
  );

  await assert.rejects(
    () => service.exchangeFirebaseSession({
      idToken: 'token',
      consent: { ...validConsent(), termsVersion: 'terms-2020-01-01' },
    }),
    StalePolicyVersionError,
  );

  await assert.rejects(
    () => service.exchangeFirebaseSession({
      idToken: 'token',
      consent: { ...validConsent(), adultConfirmed: false },
    }),
    ConsentRequiredError,
  );

  assert.equal(repository.users.size, 0, 'no account may exist without valid consent');
  assert.equal(repository.events.filter((event) => event.reason === 'consent_required').length, 1);
});

test('unsupported Firebase providers cannot create wallets', async () => {
  const repository = createFakeRepository();
  const service = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, signInProvider: 'anonymous' },
  });

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    UnsupportedSignInProviderError,
  );
  assert.equal(repository.users.size, 0);
  assert.equal(repository.events.at(-1).reason, 'unsupported_provider');
});

test('Firebase accounts without a verified email or phone are refused', async () => {
  const service = createService({
    firebaseIdentity: { ...GOOGLE_IDENTITY, email: null, emailVerified: false, phoneNumber: null },
  });

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    ContactVerificationRequiredError,
  );
});

test('an unverified Firebase email cannot create an account', async () => {
  const repository = createFakeRepository();
  const service = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, emailVerified: false },
  });

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    (error) => error instanceof ContactVerificationRequiredError
      && error.code === 'contact_verification_required',
  );
  assert.equal(repository.users.size, 0, 'no wallet may be provisioned for an unverified identity');
  assert.equal(repository.events.at(-1).reason, 'no_verified_contact');
});

test('invalid and unavailable Firebase tokens fail closed with distinct errors', async () => {
  const invalidService = createService({ tokenError: new FirebaseAuthError(401, 'bad token', 'invalid_signature') });
  await assert.rejects(
    () => invalidService.exchangeFirebaseSession({ idToken: 'tampered', consent: validConsent() }),
    InvalidFirebaseTokenError,
  );

  const unavailableService = createService({ tokenError: new FirebaseAuthError(503, 'certs down', 'certs_unreachable') });
  await assert.rejects(
    () => unavailableService.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    (error) => error instanceof IdentityError && error.code === 'firebase_unavailable',
  );

  const unexpectedService = createService({ tokenError: new Error('boom') });
  await assert.rejects(
    () => unexpectedService.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    InvalidFirebaseTokenError,
  );
});

test('two Firebase accounts cannot share one email address', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });

  await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  const secondService = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, uid: 'firebase-uid-second' },
  });

  await assert.rejects(
    () => secondService.exchangeFirebaseSession({ idToken: 'token2', consent: validConsent() }),
    AccountConflictError,
  );
  assert.equal(repository.users.size, 1);
});

test('phone OTP cannot create or sign in to an account', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository, firebaseIdentity: PHONE_IDENTITY });

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    PhoneSignInNotAllowedError,
  );
  assert.equal(repository.users.size, 0, 'an SMS OTP never provisions a wallet');

  const event = repository.events.at(-1);
  assert.equal(event.eventType, 'session_exchange');
  assert.equal(event.outcome, 'rejected');
  assert.equal(event.reason, 'phone_sign_in_not_allowed', 'the refusal is auditable');
});

test('phone OTP stays blocked even when the provider allowlist includes phone.com', async () => {
  const repository = createFakeRepository();
  const service = createService({
    repository,
    firebaseIdentity: PHONE_IDENTITY,
    allowedSignInProviders: ['emailLink', 'google.com', 'phone.com'],
  });

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() }),
    PhoneSignInNotAllowedError,
    'the rule lives in code so a configuration edit cannot reopen SMS signup',
  );
});

test('a phone linked to an email or Google account still signs in, without Minimum KYC', async () => {
  const repository = createFakeRepository();
  const service = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, phoneNumber: '+919876543210', phoneVerified: true },
  });

  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  assert.equal(session.user.phone, '+919876543210');
  assert.equal(session.user.phoneVerified, true);
  assert.equal(session.user.minimumKycVerified, false, 'Minimum KYC needs the explicit payout flow');
});

test('repeated sign-ins are throttled per Firebase account', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });

  for (let index = 0; index < 30; index += 1) {
    await service.exchangeFirebaseSession({ idToken: 'token', consent: index === 0 ? validConsent() : undefined });
  }

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token' }),
    IdentityRateLimitError,
  );
});

test('suspended accounts cannot exchange Firebase tokens for API sessions', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  repository.users.get('firebase-uid-google').status = 'suspended';

  await assert.rejects(
    () => service.exchangeFirebaseSession({ idToken: 'token' }),
    AccountNotActiveError,
  );
  await assert.rejects(
    () => service.assertSessionUsable({ userId: session.user.id, issuedAt: Math.floor(Date.now() / 1000) }),
    AccountNotActiveError,
  );
});

test('withdrawal Minimum KYC requires a Firebase-verified phone on the same account', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository, firebaseIdentity: GOOGLE_IDENTITY });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  // Google-only identity has no phone claim.
  await assert.rejects(
    () => service.verifyWithdrawalPhone({ userId: session.user.id, idToken: 'token' }),
    PhoneVerificationRequiredError,
  );

  const phoneService = createService({ repository, firebaseIdentity: PHONE_IDENTITY });
  await assert.rejects(
    () => phoneService.verifyWithdrawalPhone({ userId: session.user.id, idToken: 'phone-token' }),
    AccountNotActiveError,
    'a different Firebase UID must not be able to attach its phone to this wallet',
  );

  // Same account, now with a verified phone from Firebase phone auth.
  const linkedIdentity = {
    ...GOOGLE_IDENTITY, phoneNumber: '+919876543210', phoneVerified: true, signInProvider: 'phone.com',
  };
  const linkedService = createService({ repository, firebaseIdentity: linkedIdentity });
  const result = await linkedService.verifyWithdrawalPhone({ userId: session.user.id, idToken: 'phone-token' });

  assert.deepEqual(result, { minimumKycVerified: true, phone: '+919876543210' });
  assert.equal(repository.kyc.get(session.user.id), true);
  assert.equal(repository.events.at(-1).eventType, 'minimum_kyc');

  const eligibility = await repository.findPayoutEligibility(session.user.id);
  assert.equal(eligibility.minimumKycVerified, true);
});

test('a phone already linked to another account cannot be reused for payouts', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  // The competing account signs in with Google and already holds that phone.
  const otherService = createService({
    repository,
    firebaseIdentity: {
      ...GOOGLE_IDENTITY,
      uid: 'firebase-uid-other',
      email: 'other@example.com',
      phoneNumber: '+919876543210',
      phoneVerified: true,
    },
  });
  await otherService.exchangeFirebaseSession({ idToken: 'other', consent: validConsent() });

  const linkedService = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, phoneNumber: '+919876543210', phoneVerified: true },
  });

  await assert.rejects(
    () => linkedService.verifyWithdrawalPhone({ userId: session.user.id, idToken: 'token' }),
    AccountConflictError,
  );
});

test('Minimum KYC never trusts a client-supplied phone number', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository, firebaseIdentity: GOOGLE_IDENTITY });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  // No phone claim in the Firebase token: a body-supplied phone must not help.
  await assert.rejects(
    () => service.verifyWithdrawalPhone({
      userId: session.user.id, idToken: 'token', phone: '+919876543210',
    }),
    PhoneVerificationRequiredError,
  );
  assert.equal(repository.kyc.get(session.user.id), undefined, 'payout KYC must not be granted');

  // A token phone that Firebase has not verified is rejected too.
  const unverifiedService = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, phoneNumber: '+919876543210', phoneVerified: false },
  });
  await assert.rejects(
    () => unverifiedService.verifyWithdrawalPhone({ userId: session.user.id, idToken: 'token' }),
    PhoneVerificationRequiredError,
  );
  assert.equal(repository.events.at(-1).reason, 'phone_not_verified');
});

test('a client phone that disagrees with the verified token claim is rejected', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository, firebaseIdentity: GOOGLE_IDENTITY });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  // Same Firebase account as the wallet owner, now with a verified phone claim.
  const linkedService = createService({
    repository,
    firebaseIdentity: { ...GOOGLE_IDENTITY, phoneNumber: '+919876543210', phoneVerified: true },
  });

  await assert.rejects(
    () => linkedService.verifyWithdrawalPhone({
      userId: session.user.id, idToken: 'phone-token', phone: '+919000000000',
    }),
    PhoneVerificationRequiredError,
  );
  assert.equal(repository.kyc.get(session.user.id), undefined);
  assert.equal(repository.events.at(-1).reason, 'phone_mismatch');

  // Formatting differences are fine: only the digits are compared.
  const result = await linkedService.verifyWithdrawalPhone({
    userId: session.user.id, idToken: 'phone-token', phone: '+91 98765 43210',
  });
  assert.equal(result.minimumKycVerified, true);
  assert.equal(result.phone, '+919876543210');
});

test('session revocation fails closed when the issue time is undeterminable', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  await service.revokeSessions({ userId: session.user.id });

  for (const issuedAt of [undefined, null, 'garbage', {}]) {
    await assert.rejects(
      () => service.assertSessionUsable({ userId: session.user.id, issuedAt }),
      InvalidFirebaseTokenError,
      `issuedAt=${JSON.stringify(issuedAt) ?? String(issuedAt)} must not pass a revocation check`,
    );
  }

  // A session issued after the revocation is still accepted.
  const future = Math.floor(Date.now() / 1000) + 5;
  const eligibility = await service.assertSessionUsable({ userId: session.user.id, issuedAt: future });
  assert.equal(eligibility.status, 'active');
});

test('session revocation invalidates API tokens issued before the watermark', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });
  const issuedAt = Math.floor(Date.now() / 1000);

  await assert.doesNotReject(() => service.assertSessionUsable({ userId: session.user.id, issuedAt }));

  const revoked = await service.revokeSessions({ userId: session.user.id });
  assert.equal(revoked.revoked, true);

  await assert.rejects(
    () => service.assertSessionUsable({ userId: session.user.id, issuedAt }),
    InvalidFirebaseTokenError,
  );
  assert.equal(repository.events.at(-1).eventType, 'session_revoked');

  // A token minted after the revocation is still usable.
  const later = await service.exchangeFirebaseSession({ idToken: 'token' });
  await assert.doesNotReject(() => service.assertSessionUsable({
    userId: later.user.id,
    issuedAt: Math.floor(Date.now() / 1000) + 5,
  }));
});

test('profile loads Neon identity, consent versions, and payout state', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });
  const session = await service.exchangeFirebaseSession({ idToken: 'token', consent: validConsent() });

  const profile = await service.loadProfile({ userId: session.user.id });

  assert.equal(profile.email, 'player@example.com');
  assert.equal(profile.fullName, 'Test Player');
  assert.equal(profile.minimumKycVerified, false);
  assert.equal(profile.adultSelfDeclared, true);
  assert.equal(profile.consent.termsVersion, TERMS_VERSION);
  assert.equal(profile.consent.privacyVersion, PRIVACY_VERSION);
  assert.equal(profile.preferences.analyticsOptIn, false);
  assert.deepEqual(profile.payoutEligibility, { minimumKycVerified: false, nextAction: 'verify_phone' });

  assert.equal(await service.loadProfile({ userId: randomUUID() }), null);
});

test('consent analytics and personalization opt-ins are stored as declared', async () => {
  const repository = createFakeRepository();
  const service = createService({ repository });

  const session = await service.exchangeFirebaseSession({
    idToken: 'token',
    consent: { ...validConsent(), analyticsOptIn: true, personalizedOffersOptIn: false },
  });

  const profile = await service.loadProfile({ userId: session.user.id });
  assert.equal(profile.preferences.analyticsOptIn, true);
  assert.equal(profile.preferences.personalizedOffersOptIn, false);
});

test('identity service refuses to start without a Firebase verifier or signing secret', () => {
  assert.throws(
    () => createIdentityService({ repository: createFakeRepository(), jwtSecret: JWT_SECRET }),
    TypeError,
  );
  assert.throws(
    () => createIdentityService({
      repository: createFakeRepository(),
      firebaseAuth: createFirebaseAuthStub(GOOGLE_IDENTITY),
    }),
    TypeError,
  );
});
