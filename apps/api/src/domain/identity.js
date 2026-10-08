import { issueAccessToken } from '../security/session.js';
import { assertSupportedSignInProvider, FirebaseAuthError } from '../services/firebaseAuth.js';

export class IdentityError extends Error {
  constructor(message, code = 'identity_error') {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
  }
}

export class InvalidFirebaseTokenError extends IdentityError {
  constructor(message = 'Firebase sign-in could not be verified. Please sign in again.') {
    super(message, 'invalid_firebase_token');
  }
}

export class UnsupportedSignInProviderError extends IdentityError {
  constructor(message = 'This sign-in method is not accepted for Zivora accounts.') {
    super(message, 'unsupported_sign_in_provider');
  }
}

export class ConsentRequiredError extends IdentityError {
  constructor(message = 'Accept the current Terms and Privacy Notice to create an account.') {
    super(message, 'consent_required');
  }
}

export class StalePolicyVersionError extends IdentityError {
  constructor(message = 'The policy version you accepted is out of date. Please review and accept again.') {
    super(message, 'stale_policy_version');
  }
}

export class AccountConflictError extends IdentityError {
  constructor(message = 'That email or phone number is already linked to another account.', code = 'account_conflict') {
    super(message, code);
  }
}

export class IdentityRateLimitError extends IdentityError {
  constructor(message = 'Too many sign-in attempts. Please wait and try again.') {
    super(message, 'identity_rate_limited');
  }
}

export class PhoneVerificationRequiredError extends IdentityError {
  constructor(message = 'Verify a phone number with Firebase before requesting a cash payout.') {
    super(message, 'phone_verification_required');
  }
}

export class ContactVerificationRequiredError extends IdentityError {
  constructor(message = 'Verify your email address or phone number before creating an account.') {
    super(message, 'contact_verification_required');
  }
}

export class AccountNotActiveError extends IdentityError {
  constructor(message = 'This account cannot complete that action right now.') {
    super(message, 'account_not_active');
  }
}

const DEFAULT_SESSION_TTL_SECONDS = 900;
const SIGN_IN_WINDOW_MINUTES = 15;
const MAX_SIGN_INS_PER_USER_WINDOW = 30;
const MAX_REJECTED_SIGN_INS_PER_IP_WINDOW = 25;

function hashOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Compares phone numbers by their digits so +91 98123 45678 and 919812345678
// are treated as the same number.
function digitsOf(value) {
  return String(value ?? '').replace(/\D/g, '');
}

// Accepts JWT `iat` (epoch seconds), a Date, or an ISO timestamp.
function toEpochSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  return null;
}

function buildConsentSnapshot(input, { termsVersion, privacyVersion }) {
  return {
    adultConfirmed: input.adultConfirmed === true,
    termsAccepted: input.termsAccepted === true,
    privacyAccepted: input.privacyAccepted === true,
    analyticsOptIn: input.analyticsOptIn === true,
    personalizedOffersOptIn: input.personalizedOffersOptIn === true,
    termsVersion,
    privacyVersion,
    acceptedTermsVersion: input.termsVersion ?? null,
    acceptedPrivacyVersion: input.privacyVersion ?? null,
  };
}

function assertConsentIsValid(consent) {
  if (!consent.adultConfirmed || !consent.termsAccepted || !consent.privacyAccepted) {
    throw new ConsentRequiredError();
  }
  if (!consent.termsVersion || !consent.privacyVersion) {
    throw new ConsentRequiredError('Terms and Privacy Notice versions are not published yet.');
  }
  // The client must echo the versions it actually displayed, so a stale consent
  // screen cannot be replayed after the policies change.
  if (consent.acceptedTermsVersion !== consent.termsVersion
    || consent.acceptedPrivacyVersion !== consent.privacyVersion) {
    throw new StalePolicyVersionError();
  }
}

export function createIdentityService({
  repository,
  firebaseAuth,
  jwtSecret,
  termsVersion,
  privacyVersion,
  allowedSignInProviders,
  minimumUserAge = 18,
  sessionTtlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  now = Date.now,
}) {
  if (!repository || !jwtSecret) {
    throw new TypeError('Identity service requires a repository and a JWT signing secret');
  }
  if (!firebaseAuth || typeof firebaseAuth.verifyIdToken !== 'function') {
    throw new TypeError('Identity service requires a Firebase ID token verifier');
  }

  async function verifyFirebaseToken(idToken) {
    try {
      return await firebaseAuth.verifyIdToken(idToken);
    } catch (error) {
      if (error instanceof FirebaseAuthError) {
        if (error.status === 503) {
          throw new IdentityError('Firebase Auth is temporarily unavailable. Please try again.', 'firebase_unavailable');
        }
        throw new InvalidFirebaseTokenError();
      }
      throw new InvalidFirebaseTokenError();
    }
  }

  function issueSession(user, firebaseIdentity, { isNewAccount }) {
    return {
      accessToken: issueAccessToken({
        subject: user.id,
        scope: 'user',
        secret: jwtSecret,
        now,
        claims: {
          fuid: firebaseIdentity.uid,
          email: user.email ?? null,
          email_verified: Boolean(user.email_verified_at ?? firebaseIdentity.emailVerified),
          phone: user.phone ?? null,
          phone_verified: Boolean(user.phone_verified_at),
          minimum_kyc: Boolean(user.minimum_kyc_verified_at),
          provider: firebaseIdentity.signInProvider,
        },
      }),
      tokenType: 'Bearer',
      expiresInSeconds: sessionTtlSeconds,
      isNewAccount: isNewAccount === true,
      user: {
        id: user.id,
        firebaseUid: firebaseIdentity.uid,
        email: user.email ?? null,
        fullName: user.full_name ?? null,
        phone: user.phone ?? null,
        emailVerified: Boolean(user.email_verified_at ?? firebaseIdentity.emailVerified),
        phoneVerified: Boolean(user.phone_verified_at),
        minimumKycVerified: Boolean(user.minimum_kyc_verified_at),
        signInProvider: firebaseIdentity.signInProvider,
        status: user.status ?? 'active',
      },
    };
  }

  async function enforceSignInThrottle({ uid, requestIpHash }) {
    const [perUser, rejectedPerIp] = await Promise.all([
      repository.countRecentAuthEvents({
        firebaseUid: uid,
        minutes: SIGN_IN_WINDOW_MINUTES,
      }),
      requestIpHash
        ? repository.countRecentAuthEvents({
          requestIpHash,
          minutes: SIGN_IN_WINDOW_MINUTES,
          outcome: 'rejected',
        })
        : Promise.resolve(0),
    ]);

    if (perUser >= MAX_SIGN_INS_PER_USER_WINDOW || rejectedPerIp >= MAX_REJECTED_SIGN_INS_PER_IP_WINDOW) {
      throw new IdentityRateLimitError();
    }
  }

  return {
    minimumUserAge,
    sessionTtlSeconds,

    // Exchanges a Firebase ID token for a short-lived platform API session and
    // provisions or refreshes the Neon-backed account.
    async exchangeFirebaseSession({ idToken, consent, requestIpHash = null, userAgentHash = null }) {
      const firebaseIdentity = await verifyFirebaseToken(idToken);
      const ipHash = hashOf(requestIpHash);
      const agentHash = hashOf(userAgentHash);

      try {
        assertSupportedSignInProvider(firebaseIdentity, allowedSignInProviders);
      } catch (error) {
        await repository.recordAuthEvent({
          firebaseUid: firebaseIdentity.uid,
          eventType: 'session_exchange',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason: 'unsupported_provider',
          requestIpHash: ipHash,
          userAgentHash: agentHash,
        });
        throw new UnsupportedSignInProviderError();
      }

      await enforceSignInThrottle({ uid: firebaseIdentity.uid, requestIpHash: ipHash });

      const existing = await repository.findByFirebaseUid(firebaseIdentity.uid);
      const consentSnapshot = consent ? buildConsentSnapshot(consent, { termsVersion, privacyVersion }) : null;

      if (!existing) {
        if (!consentSnapshot) {
          await repository.recordAuthEvent({
            firebaseUid: firebaseIdentity.uid,
            eventType: 'session_exchange',
            signInProvider: firebaseIdentity.signInProvider,
            authTime: firebaseIdentity.authTime,
            outcome: 'rejected',
            reason: 'consent_required',
            requestIpHash: ipHash,
            userAgentHash: agentHash,
          });
          throw new ConsentRequiredError();
        }
        assertConsentIsValid(consentSnapshot);
      }

      // A verified contact point is mandatory: coins and payouts must belong to a
      // real, reachable identity. An email or phone that Firebase has not
      // verified (for example an unfinished password sign-up) is not enough.
      const hasVerifiedContact = Boolean(
        (firebaseIdentity.email && firebaseIdentity.emailVerified)
        || (firebaseIdentity.phoneNumber && firebaseIdentity.phoneVerified),
      );

      if (!hasVerifiedContact) {
        await repository.recordAuthEvent({
          firebaseUid: firebaseIdentity.uid,
          eventType: 'session_exchange',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason: 'no_verified_contact',
          requestIpHash: ipHash,
          userAgentHash: agentHash,
        });
        throw new ContactVerificationRequiredError();
      }

      let result;
      try {
        result = await repository.upsertFirebaseUser(firebaseIdentity, consentSnapshot);
      } catch (error) {
        await repository.recordAuthEvent({
          firebaseUid: firebaseIdentity.uid,
          eventType: 'session_exchange',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason: 'provisioning_error',
          requestIpHash: ipHash,
          userAgentHash: agentHash,
        });
        throw error;
      }

      if (result?.conflict) {
        const reason = result.conflict;
        await repository.recordAuthEvent({
          firebaseUid: firebaseIdentity.uid,
          eventType: 'session_exchange',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason,
          requestIpHash: ipHash,
          userAgentHash: agentHash,
        });

        if (reason === 'consent_required') {
          throw new ConsentRequiredError();
        }
        if (reason === 'phone_already_linked') {
          throw new AccountConflictError('That phone number is already linked to another account.');
        }
        throw new AccountConflictError();
      }

      const user = result;
      if (user.status && user.status !== 'active') {
        await repository.recordAuthEvent({
          userId: user.id,
          firebaseUid: firebaseIdentity.uid,
          eventType: 'session_exchange',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason: `account_${user.status}`,
          requestIpHash: ipHash,
          userAgentHash: agentHash,
        });
        throw new AccountNotActiveError();
      }

      await repository.recordAuthEvent({
        userId: user.id,
        firebaseUid: firebaseIdentity.uid,
        eventType: user.created ? 'account_created' : 'session_exchange',
        signInProvider: firebaseIdentity.signInProvider,
        authTime: firebaseIdentity.authTime,
        outcome: 'success',
        requestIpHash: ipHash,
        userAgentHash: agentHash,
      });

      return issueSession(user, firebaseIdentity, { isNewAccount: user.created === true });
    },

    // Phone Minimum KYC for cash payouts. Firebase performs the OTP challenge on
    // the device; the server only trusts a Firebase ID token that carries a
    // verified phone_number claim for the same account.
    async verifyWithdrawalPhone({ userId, idToken, phone = null }) {
      const firebaseIdentity = await verifyFirebaseToken(idToken);

      async function rejectMinimumKyc(reason, error) {
        await repository.recordAuthEvent({
          userId,
          firebaseUid: firebaseIdentity.uid,
          eventType: 'minimum_kyc',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason,
        });
        throw error;
      }

      // Minimum KYC unlocks cash payouts, so the phone must be attested by
      // Firebase itself. A phone number supplied by the client is never trusted:
      // it is only accepted as a cross-check against the verified token claim.
      const tokenPhone = firebaseIdentity.phoneNumber;
      if (!tokenPhone || firebaseIdentity.phoneVerified !== true) {
        await rejectMinimumKyc(
          tokenPhone ? 'phone_not_verified' : 'no_phone_claim',
          new PhoneVerificationRequiredError(),
        );
      }
      if (phone && digitsOf(phone) !== digitsOf(tokenPhone)) {
        await rejectMinimumKyc(
          'phone_mismatch',
          new PhoneVerificationRequiredError('That phone number does not match the one verified by Firebase.'),
        );
      }

      const verifiedPhone = tokenPhone;

      const account = await repository.findUserById(userId);
      if (!account) {
        throw new AccountNotActiveError('This account no longer exists.');
      }
      if (account.firebase_uid && account.firebase_uid !== firebaseIdentity.uid) {
        await repository.recordAuthEvent({
          userId,
          firebaseUid: firebaseIdentity.uid,
          eventType: 'minimum_kyc',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason: 'uid_mismatch',
        });
        throw new AccountNotActiveError('Sign in with the same Firebase account that owns this wallet.');
      }
      if (account.status !== 'active') {
        throw new AccountNotActiveError();
      }

      const verified = await repository.markMinimumKycVerified(userId, verifiedPhone, firebaseIdentity.uid);
      if (!verified) {
        await repository.recordAuthEvent({
          userId,
          firebaseUid: firebaseIdentity.uid,
          eventType: 'minimum_kyc',
          signInProvider: firebaseIdentity.signInProvider,
          authTime: firebaseIdentity.authTime,
          outcome: 'rejected',
          reason: 'phone_already_linked',
        });
        throw new AccountConflictError('That phone number is already linked to another account.');
      }

      await repository.recordAuthEvent({
        userId,
        firebaseUid: firebaseIdentity.uid,
        eventType: 'minimum_kyc',
        signInProvider: firebaseIdentity.signInProvider,
        authTime: firebaseIdentity.authTime,
        outcome: 'success',
      });

      return { minimumKycVerified: true, phone: verifiedPhone };
    },

    async revokeSessions({ userId, reason = 'user_sign_out' }) {
      const revokedBefore = new Date(now());
      const revoked = await repository.revokeSessionsBefore(userId, revokedBefore);

      if (revoked) {
        await repository.recordAuthEvent({
          userId,
          eventType: 'session_revoked',
          outcome: 'success',
          reason,
        });
      }

      return { revoked };
    },

    // Payout and profile gates must reject API tokens issued before the last
    // revocation, and must reject accounts that are not active.
    async assertSessionUsable({ userId, issuedAt }) {
      const eligibility = await repository.findPayoutEligibility(userId);
      if (!eligibility) {
        throw new AccountNotActiveError('This account no longer exists.');
      }
      if (eligibility.status !== 'active') {
        throw new AccountNotActiveError();
      }
      if (eligibility.tokensRevokedBefore) {
        const revokedBeforeSeconds = Math.floor(new Date(eligibility.tokensRevokedBefore).getTime() / 1000);
        const issuedAtSeconds = toEpochSeconds(issuedAt);

        // Fail closed: a session whose issue time cannot be determined is
        // treated as issued before the revocation watermark.
        // Second-level granularity is coarse, so tokens issued in the same
        // second as the revocation are rejected too. Sign in again to recover.
        if (issuedAtSeconds === null || issuedAtSeconds <= revokedBeforeSeconds) {
          throw new InvalidFirebaseTokenError('Your session was signed out. Please sign in again.');
        }
      }
      return eligibility;
    },

    async loadProfile({ userId }) {
      const user = await repository.findUserById(userId);
      if (!user) {
        return null;
      }

      const [consents, eligibility] = await Promise.all([
        repository.findLatestConsent(userId),
        repository.findPayoutEligibility(userId),
      ]);

      const consentByType = new Map();
      for (const entry of consents) {
        if (!consentByType.has(entry.consent_type)) {
          consentByType.set(entry.consent_type, entry);
        }
      }

      return {
        id: user.id,
        firebaseUid: user.firebase_uid,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        emailVerified: Boolean(user.email_verified_at),
        phoneVerified: Boolean(user.phone_verified_at),
        minimumKycVerified: Boolean(user.minimum_kyc_verified_at),
        adultSelfDeclared: Boolean(user.adult_self_declared_at),
        signInProvider: user.sign_in_provider,
        status: user.status,
        memberSince: user.created_at,
        preferences: {
          analyticsOptIn: consentByType.get('analytics')?.granted === true,
          personalizedOffersOptIn: consentByType.get('personalized_offers')?.granted === true,
        },
        consent: {
          termsVersion: consentByType.get('terms')?.policy_version ?? null,
          privacyVersion: consentByType.get('privacy_notice')?.policy_version ?? null,
        },
        payoutEligibility: eligibility ? {
          minimumKycVerified: eligibility.minimumKycVerified,
          nextAction: eligibility.minimumKycVerified ? null : 'verify_phone',
        } : null,
      };
    },
  };
}
