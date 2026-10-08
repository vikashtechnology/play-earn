import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../app.js';
import { config } from '../config.js';
import {
  AccountConflictError,
  AccountNotActiveError,
  ConsentRequiredError,
  IdentityError,
  IdentityRateLimitError,
  InvalidFirebaseTokenError,
  PhoneSignInNotAllowedError,
  PhoneVerificationRequiredError,
  StalePolicyVersionError,
  UnsupportedSignInProviderError,
} from '../domain/identity.js';
import { InvalidOtpError, OtpDeliveryError } from '../domain/otp.js';
import { issueAccessToken } from '../security/session.js';

const TEST_JWT_SECRET = 'auth-route-test-secret';

const enabledAuthConfig = {
  ...config,
  authProvider: 'firebase',
  firebaseAuthEnabled: true,
  firebaseProjectId: 'zivora-test-project',
  firebaseAllowedSignInProviders: ['google.com', 'phone.com', 'emailLink'],
  signupEnabled: true,
  googleSignInEnabled: true,
  minimumUserAge: 18,
  termsVersion: 'terms-2026-10-01',
  privacyVersion: 'privacy-2026-10-01',
  termsUrl: 'https://zivora.in/terms',
  privacyUrl: 'https://zivora.in/privacy',
  supportEmail: 'support@zivora.example',
  jwtSecret: TEST_JWT_SECRET,
  otpHashSecret: 'auth-route-hash-secret',
  otpDeliveryEnabled: false,
};

const disabledAuthConfig = { ...enabledAuthConfig, signupEnabled: false, firebaseAuthEnabled: false };

const validConsentBody = {
  adultConfirmed: true,
  termsAccepted: true,
  privacyAccepted: true,
  termsVersion: enabledAuthConfig.termsVersion,
  privacyVersion: enabledAuthConfig.privacyVersion,
  analyticsOptIn: false,
  personalizedOffersOptIn: false,
  fullName: 'Test Player',
};

function createIdentityStub(overrides = {}) {
  return {
    calls: [],
    async exchangeFirebaseSession(input) {
      this.calls.push({ method: 'exchangeFirebaseSession', input });
      if (overrides.exchangeError) {
        throw overrides.exchangeError;
      }
      return {
        accessToken: 'platform-api-token',
        tokenType: 'Bearer',
        expiresInSeconds: 900,
        isNewAccount: true,
        user: {
          id: 'user-1',
          firebaseUid: 'firebase-uid-1',
          email: 'player@example.com',
          fullName: 'Test Player',
          emailVerified: true,
          phoneVerified: false,
          minimumKycVerified: false,
          status: 'active',
        },
      };
    },
    async assertSessionUsable(input) {
      this.calls.push({ method: 'assertSessionUsable', input });
      if (overrides.sessionError) {
        throw overrides.sessionError;
      }
      return { status: 'active', minimumKycVerified: false, tokensRevokedBefore: null };
    },
    async loadProfile(input) {
      this.calls.push({ method: 'loadProfile', input });
      return overrides.profile ?? {
        id: input.userId,
        firebaseUid: 'firebase-uid-1',
        email: 'player@example.com',
        fullName: 'Test Player',
        phone: null,
        emailVerified: true,
        phoneVerified: false,
        minimumKycVerified: false,
        adultSelfDeclared: true,
        status: 'active',
        memberSince: new Date().toISOString(),
        preferences: { analyticsOptIn: false, personalizedOffersOptIn: false },
        consent: {
          termsVersion: enabledAuthConfig.termsVersion,
          privacyVersion: enabledAuthConfig.privacyVersion,
        },
        payoutEligibility: { minimumKycVerified: false, nextAction: 'verify_phone' },
      };
    },
    async revokeSessions(input) {
      this.calls.push({ method: 'revokeSessions', input });
      return { revoked: true };
    },
    async verifyWithdrawalPhone(input) {
      this.calls.push({ method: 'verifyWithdrawalPhone', input });
      if (overrides.phoneError) {
        throw overrides.phoneError;
      }
      return { minimumKycVerified: true, phone: input.phone ?? '+919876543210' };
    },
  };
}

async function requestJson(pathname, {
  method = 'POST',
  body,
  headers = {},
  authConfig = enabledAuthConfig,
  identityService = createIdentityStub(),
  authService,
} = {}) {
  const server = createApp({
    authConfig,
    identityService,
    ...(authService ? { authService } : {}),
  });
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, raw: text, identity: identityService };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function userToken(userId = 'user-1') {
  return issueAccessToken({ subject: userId, scope: 'user', secret: TEST_JWT_SECRET });
}

test('policies endpoint reports Firebase capabilities without leaking configuration', async () => {
  const enabled = await requestJson('/api/v1/auth/policies', { method: 'GET' });
  const disabled = await requestJson('/api/v1/auth/policies', { method: 'GET', authConfig: disabledAuthConfig });

  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.authProvider, 'firebase');
  assert.equal(enabled.body.firebaseSignInEnabled, true);
  assert.equal(enabled.body.googleSignInEnabled, true);
  assert.deepEqual(enabled.body.allowedSignInProviders, ['google.com', 'phone.com', 'emailLink']);
  assert.equal(enabled.body.termsVersion, 'terms-2026-10-01');
  assert.equal(enabled.body.minimumUserAge, 18);
  assert.equal(enabled.raw.includes('zivora-test-project'), false, 'project id must not be exposed');
  assert.equal(enabled.raw.includes(config.jwtSecret), false);

  assert.equal(disabled.body.firebaseSignInEnabled, false);
  assert.deepEqual(disabled.body.allowedSignInProviders, []);
});

test('Firebase session exchange is disabled until the project and policies are configured', async () => {
  const result = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'a.b.c', consent: validConsentBody },
    authConfig: disabledAuthConfig,
  });

  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'firebase_sign_in_disabled');
});

test('sign-in stays closed while policy pages or versions are placeholders', async () => {
  // The .env.example values look configured but point at pages nobody can read.
  // Recording consent against them would be meaningless, so the gate stays shut.
  const examplePolicies = {
    ...enabledAuthConfig,
    termsUrl: 'https://your-domain.example/terms',
    privacyUrl: 'https://your-domain.example/privacy',
  };

  const result = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'a.b.c', consent: validConsentBody },
    authConfig: examplePolicies,
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'firebase_sign_in_disabled');

  const policies = await requestJson('/api/v1/auth/policies', { method: 'GET', authConfig: examplePolicies });
  assert.equal(policies.body.firebaseSignInEnabled, false);

  const unpublishedVersion = { ...enabledAuthConfig, termsVersion: 'publish-reviewed-terms-version' };
  const versionResult = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'a.b.c', consent: validConsentBody },
    authConfig: unpublishedVersion,
  });
  assert.equal(versionResult.status, 503);
  assert.equal(versionResult.body.code, 'firebase_sign_in_disabled');

  // Phone Minimum KYC needs the Firebase project but not the policy pages.
  const phoneOnly = await requestJson('/api/v1/auth/withdrawal/phone/verify', {
    method: 'POST',
    body: { idToken: 'a.b.c' },
    authConfig: { ...examplePolicies, signupEnabled: false },
  });
  assert.notEqual(phoneOnly.body.code, 'firebase_phone_disabled');
});

test('Firebase session exchange provisions a session and hashes request fingerprints', async () => {
  const result = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'header.payload.signature', consent: validConsentBody },
    headers: { 'user-agent': 'PlayEarnAndroid/0.1.0' },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.accessToken, 'platform-api-token');
  assert.equal(result.body.expiresInSeconds, 900);
  assert.equal(result.body.user.firebaseUid, 'firebase-uid-1');
  assert.equal(result.body.isNewAccount, true);

  const call = result.identity.calls[0].input;
  assert.equal(call.idToken, 'header.payload.signature');
  assert.equal(call.consent.fullName, 'Test Player');
  assert.match(call.requestIpHash, /^[0-9a-f]{64}$/, 'the raw IP must never reach the domain layer');
  assert.match(call.userAgentHash, /^[0-9a-f]{64}$/);
  assert.equal(result.raw.includes('127.0.0.1'), false);
});

test('Firebase session exchange maps identity errors to stable client codes', async () => {
  const cases = [
    [new InvalidFirebaseTokenError(), 401, 'invalid_firebase_token'],
    [new ConsentRequiredError(), 400, 'consent_required'],
    [new StalePolicyVersionError(), 400, 'stale_policy_version'],
    [new UnsupportedSignInProviderError(), 403, 'unsupported_sign_in_provider'],
    [new AccountConflictError(), 409, 'account_conflict'],
    [new IdentityRateLimitError(), 429, 'identity_rate_limited'],
    [new AccountNotActiveError(), 403, 'account_not_active'],
    [new PhoneVerificationRequiredError(), 400, 'phone_verification_required'],
    [new PhoneSignInNotAllowedError(), 403, 'phone_sign_in_not_allowed'],
    [new IdentityError('Firebase Auth is temporarily unavailable. Please try again.', 'firebase_unavailable'), 503, 'firebase_unavailable'],
  ];

  for (const [error, status, code] of cases) {
    const result = await requestJson('/api/v1/auth/firebase/session', {
      body: { idToken: 'a.b.c', consent: validConsentBody },
      identityService: createIdentityStub({ exchangeError: error }),
    });

    assert.equal(result.status, status, `${code} status`);
    assert.equal(result.body.code, code);
    assert.equal(typeof result.body.error, 'string');
  }
});

test('Firebase session exchange rejects malformed and unexpected request bodies', async () => {
  const missingToken = await requestJson('/api/v1/auth/firebase/session', { body: { consent: validConsentBody } });
  const notAToken = await requestJson('/api/v1/auth/firebase/session', { body: { idToken: 'nope' } });
  const unknownField = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'a.b.c', userId: 'attacker-chosen-id' },
  });
  const badConsent = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'a.b.c', consent: { ...validConsentBody, adultConfirmed: false } },
  });

  assert.equal(missingToken.status, 400);
  assert.equal(notAToken.status, 400);
  assert.equal(unknownField.status, 400);
  assert.equal(badConsent.status, 400);
});

test('unexpected identity failures return a generic 500 without internals', async () => {
  const result = await requestJson('/api/v1/auth/firebase/session', {
    body: { idToken: 'a.b.c', consent: validConsentBody },
    identityService: createIdentityStub({ exchangeError: new Error('connection string: postgres://user:pass@host') }),
  });

  assert.equal(result.status, 500);
  assert.equal(result.raw.includes('postgres://'), false);
  assert.equal(result.raw.includes('pass'), false);
});

test('session route returns the Neon-backed profile only for a valid bearer token', async () => {
  const anonymous = await requestJson('/api/v1/auth/session', { method: 'GET' });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.code, 'session_required');

  const authorized = await requestJson('/api/v1/auth/session', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userToken('user-42')}` },
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.user.id, 'user-42');
  assert.equal(authorized.body.user.minimumKycVerified, false);
  assert.deepEqual(authorized.identity.calls.map((call) => call.method), ['assertSessionUsable', 'loadProfile']);

  const revoked = await requestJson('/api/v1/auth/session', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userToken()}` },
    identityService: createIdentityStub({ sessionError: new InvalidFirebaseTokenError('Your session was signed out. Please sign in again.') }),
  });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.code, 'invalid_firebase_token');
});

test('session revocation signs out every issued API token', async () => {
  const result = await requestJson('/api/v1/auth/session/revoke', {
    headers: { Authorization: `Bearer ${userToken('user-7')}` },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, revoked: true });
  assert.equal(result.identity.calls[0].input.userId, 'user-7');

  const anonymous = await requestJson('/api/v1/auth/session/revoke');
  assert.equal(anonymous.status, 401);
});

test('withdrawal phone verification needs a session plus a Firebase phone token', async () => {
  const anonymous = await requestJson('/api/v1/auth/withdrawal/phone/verify', {
    body: { idToken: 'a.b.c' },
  });
  assert.equal(anonymous.status, 401);

  const verified = await requestJson('/api/v1/auth/withdrawal/phone/verify', {
    body: { idToken: 'a.b.c', phone: '98765 43210' },
    headers: { Authorization: `Bearer ${userToken('user-9')}` },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.minimumKycVerified, true);
  assert.equal(verified.body.phone, '+919876543210');
  assert.equal(verified.identity.calls.at(-1).input.userId, 'user-9');

  const noPhoneClaim = await requestJson('/api/v1/auth/withdrawal/phone/verify', {
    body: { idToken: 'a.b.c' },
    headers: { Authorization: `Bearer ${userToken('user-9')}` },
    identityService: createIdentityStub({ phoneError: new PhoneVerificationRequiredError() }),
  });
  assert.equal(noPhoneClaim.status, 400);
  assert.equal(noPhoneClaim.body.code, 'phone_verification_required');

  const mismatchedAccount = await requestJson('/api/v1/auth/withdrawal/phone/verify', {
    body: { idToken: 'a.b.c' },
    headers: { Authorization: `Bearer ${userToken('user-9')}` },
    identityService: createIdentityStub({ phoneError: new AccountNotActiveError('Sign in with the same Firebase account that owns this wallet.') }),
  });
  assert.equal(mismatchedAccount.status, 403);

  const disabled = await requestJson('/api/v1/auth/withdrawal/phone/verify', {
    body: { idToken: 'a.b.c' },
    headers: { Authorization: `Bearer ${userToken()}` },
    authConfig: disabledAuthConfig,
  });
  assert.equal(disabled.status, 503);
  assert.equal(disabled.body.code, 'firebase_phone_disabled');
});

test('legacy self-hosted OTP stays disabled unless delivery is configured', async () => {
  const gated = await requestJson('/api/v1/auth/otp/request', { body: { phone: '9876543210' } });
  assert.equal(gated.status, 503);
  assert.equal(gated.body.code, 'otp_delivery_disabled');

  let requestedPhone;
  const enabled = await requestJson('/api/v1/auth/otp/request', {
    body: { phone: '98765 43210' },
    authConfig: { ...enabledAuthConfig, otpDeliveryEnabled: true },
    authService: {
      async requestOtp(phone) {
        requestedPhone = phone;
        return { expiresInSeconds: 300, resendInSeconds: 60 };
      },
    },
  });

  assert.equal(enabled.status, 200);
  assert.equal(requestedPhone, '+919876543210');
  assert.deepEqual(enabled.body, { ok: true, expiresInSeconds: 300, resendInSeconds: 60 });
  assert.equal(enabled.raw.includes('43210'), false, 'an OTP or full phone must never be echoed back');
});

test('legacy OTP verification still validates input and maps failures', async () => {
  const service = { async verifyOtp() { throw new InvalidOtpError('invalid'); } };

  const malformed = await requestJson('/api/v1/auth/otp/verify', {
    body: { phone: '+919876543210', code: '123' },
    authService: service,
  });
  const invalid = await requestJson('/api/v1/auth/otp/verify', {
    body: { phone: '+919876543210', code: '123456' },
    authService: service,
  });

  assert.equal(malformed.status, 400);
  assert.equal(invalid.status, 401);

  const deliveryFailure = await requestJson('/api/v1/auth/otp/request', {
    body: { phone: '9876543210' },
    authConfig: { ...enabledAuthConfig, otpDeliveryEnabled: true },
    authService: { async requestOtp() { throw new OtpDeliveryError('provider down'); } },
  });
  assert.equal(deliveryFailure.status, 503);
});

test('unknown auth routes return 404', async () => {
  const result = await requestJson('/api/v1/auth/email/signup', { body: {} });
  assert.equal(result.status, 404);
});
