import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as signData } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertSupportedSignInProvider,
  createFirebaseAuthRestClient,
  createFirebaseTokenVerifier,
  FirebaseAuthError,
  FIREBASE_CERTS_URL,
  normalizeFirebaseIdentity,
  normalizeSignInProvider,
  SUPPORTED_SIGN_IN_PROVIDERS,
} from './firebaseAuth.js';

const PROJECT_ID = 'play-earn-test-project';

const hasOpenSsl = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const OTHER_KEY_PAIR = generateKeyPairSync('rsa', { modulusLength: 2048 });

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createIdToken(claims = {}, { key = privateKey, kid = 'test-kid-1', alg = 'RS256' } = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = encode({ alg, typ: 'JWT', kid });
  const payload = encode({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: 'firebase-uid-1',
    user_id: 'firebase-uid-1',
    auth_time: nowSeconds - 10,
    iat: nowSeconds - 10,
    exp: nowSeconds + 3600,
    email: 'player@example.com',
    email_verified: true,
    name: 'Test Player',
    firebase: { sign_in_provider: 'google.com' },
    ...claims,
  });

  if (alg === 'none') {
    return `${header}.${payload}.`;
  }

  const signature = signData('RSA-SHA256', Buffer.from(`${header}.${payload}`), key).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function toJwk(key) {
  if (typeof key === 'string') {
    return createPublicKey(key).export({ format: 'jwk' });
  }
  // Node's createPublicKey rejects an already-public KeyObject, so export directly.
  return key.type === 'public' ? key.export({ format: 'jwk' }) : createPublicKey(key).export({ format: 'jwk' });
}

function createCertsFetch({ key = publicKey, kid = 'test-kid-1', calls = [] } = {}) {
  const jwk = toJwk(key);

  return async (url) => {
    calls.push(url);
    return {
      ok: true,
      headers: { get: () => 'public, max-age=600' },
      json: async () => ({ keys: [{ ...jwk, kid, kty: jwk.kty ?? 'RSA' }] }),
    };
  };
}

function createVerifier(overrides = {}) {
  const calls = [];
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    fetchImpl: createCertsFetch({ calls, ...overrides.certs }),
    ...overrides,
  });

  return { verifier, calls };
}

test('verifies a Firebase ID token and normalizes identity claims', async () => {
  const { verifier, calls } = createVerifier();
  const token = createIdToken({
    phone_number: '+919876543210',
    picture: 'https://example.test/photo.png',
    firebase: { sign_in_provider: 'phone.com', sign_in_second_factor: 'phone.com' },
  });

  const identity = await verifier.verifyIdToken(token);

  assert.equal(identity.uid, 'firebase-uid-1');
  assert.equal(identity.email, 'player@example.com');
  assert.equal(identity.emailVerified, true);
  assert.equal(identity.phoneNumber, '+919876543210');
  assert.equal(identity.displayName, 'Test Player');
  assert.equal(identity.photoUrl, 'https://example.test/photo.png');
  assert.equal(identity.signInProvider, 'phone.com');
  assert.equal(identity.signInSecondFactor, 'phone.com');
  assert.equal(Number.isInteger(identity.authTime), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], FIREBASE_CERTS_URL);
});

test('caches Google signing certificates within the published max-age', async () => {
  const { verifier, calls } = createVerifier();

  await verifier.verifyIdToken(createIdToken());
  await verifier.verifyIdToken(createIdToken({ sub: 'uid-2', user_id: 'uid-2' }));

  assert.equal(calls.length, 1);
});

test('rejects tokens signed with an unknown key after one certificate refresh', async () => {
  const { verifier, calls } = createVerifier();

  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({}, { kid: 'rotated-kid' })),
    (error) => error instanceof FirebaseAuthError && error.code === 'unknown_signing_key',
  );
  assert.equal(calls.length, 2, 'a rotated key must trigger exactly one refresh');
});

test('rejects tokens from another Firebase project', async () => {
  const { verifier } = createVerifier();

  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ aud: 'some-other-project' })),
    (error) => error.code === 'invalid_audience',
  );
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ iss: 'https://securetoken.google.com/some-other-project' })),
    (error) => error.code === 'invalid_issuer',
  );
});

test('rejects expired tokens, future issue times, and missing auth_time', async () => {
  const { verifier } = createVerifier();
  const nowSeconds = Math.floor(Date.now() / 1000);

  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ exp: nowSeconds - 5 })),
    (error) => error.code === 'token_expired',
  );
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ iat: nowSeconds + 5000 })),
    (error) => error.code === 'invalid_issued_at',
  );
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ auth_time: undefined })),
    (error) => error.code === 'invalid_auth_time',
  );
});

test('rejects algorithm confusion, unsigned tokens, and tampered signatures', async () => {
  const { verifier } = createVerifier();
  const validToken = createIdToken();

  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({}, { alg: 'none' })),
    (error) => error.code === 'invalid_algorithm',
  );
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({}, { alg: 'HS256' })),
    (error) => error.code === 'invalid_algorithm',
  );
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({}, { key: OTHER_KEY_PAIR.privateKey })),
    (error) => error.code === 'invalid_signature',
  );

  const [header, payload, signature] = validToken.split('.');
  const flipped = signature.slice(0, -2) + (signature.endsWith('A') ? 'BA' : 'AA');
  await assert.rejects(
    () => verifier.verifyIdToken(`${header}.${payload}.${flipped}`),
    (error) => error instanceof FirebaseAuthError,
  );
});

test('rejects malformed tokens and inconsistent subjects', async () => {
  const { verifier } = createVerifier();

  await assert.rejects(() => verifier.verifyIdToken(''), (error) => error.code === 'malformed_token');
  await assert.rejects(() => verifier.verifyIdToken('not-a-token'), (error) => error.code === 'malformed_token');
  await assert.rejects(() => verifier.verifyIdToken('a.b'), (error) => error.code === 'malformed_token');
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ user_id: 'someone-else' })),
    (error) => error.code === 'invalid_subject',
  );
  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({ sub: '' })),
    (error) => error.code === 'invalid_subject',
  );
});

test('reports 503 when Google certificate distribution is unavailable', async () => {
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) }),
  });

  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken()),
    (error) => error instanceof FirebaseAuthError && error.status === 503 && error.code === 'certs_unreachable',
  );

  const networkFailure = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    fetchImpl: async () => { throw new Error('offline'); },
  });

  await assert.rejects(
    () => networkFailure.verifyIdToken(createIdToken()),
    (error) => error.status === 503,
  );
});

// The production securetoken endpoint returns a { kid: "-----BEGIN CERTIFICATE-----" }
// map rather than a JWKS document. Generating a certificate needs openssl, so
// this case skips itself where openssl is unavailable.
function createSelfSignedCertificate() {
  const directory = mkdtempSync(join(tmpdir(), 'firebase-certs-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');

  const result = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-subj', '/CN=firebase-token-test',
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    return null;
  }

  return {
    certificate: readFileSync(certPath, 'utf8'),
    privateKey: createPrivateKey(readFileSync(keyPath, 'utf8')),
  };
}

test('accepts the x509 certificate map published by the securetoken endpoint', { skip: !hasOpenSsl }, async () => {
  const fixture = createSelfSignedCertificate();
  assert.ok(fixture, 'openssl could not generate a test certificate');

  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'public, max-age=300' },
      // Exactly the shape Google serves: a kid -> PEM certificate object.
      json: async () => ({ 'secure-key-1': fixture.certificate }),
    }),
  });

  const token = createIdToken({}, { key: fixture.privateKey, kid: 'secure-key-1' });
  const identity = await verifier.verifyIdToken(token);

  assert.equal(identity.uid, 'firebase-uid-1');
  assert.equal(identity.signInProvider, 'google.com');
});

test('requires a Firebase project id before any verification', () => {
  assert.throws(() => createFirebaseTokenVerifier({ projectId: '' }), TypeError);
});

test('maps the phone_number_verified claim so Minimum KYC can rely on it', () => {
  const verified = normalizeFirebaseIdentity({
    sub: 'firebase-uid-1',
    phone_number: '+919876543210',
    phone_number_verified: true,
    firebase: { sign_in_provider: 'phone' },
  });
  assert.equal(verified.phoneNumber, '+919876543210');
  assert.equal(verified.phoneVerified, true);

  const unverified = normalizeFirebaseIdentity({
    sub: 'firebase-uid-1',
    phone_number: '+919876543210',
    firebase: { sign_in_provider: 'phone' },
  });
  assert.equal(unverified.phoneVerified, false, 'a missing claim must never count as verified');

  const explicitlyFalse = normalizeFirebaseIdentity({
    sub: 'firebase-uid-1',
    phone_number: '+919876543210',
    phone_number_verified: false,
    firebase: { sign_in_provider: 'phone' },
  });
  assert.equal(explicitlyFalse.phoneVerified, false);

  const emailOnly = normalizeFirebaseIdentity({
    sub: 'firebase-uid-1',
    email: 'Player@Example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  assert.equal(emailOnly.email, 'player@example.com');
  assert.equal(emailOnly.emailVerified, true);
  assert.equal(emailOnly.phoneVerified, false);
});

test('normalizes Firebase sign-in provider spellings', () => {
  // Firebase ID tokens report "phone"; the provider ID used everywhere else is
  // "phone.com". Both must be accepted by the allowlist.
  assert.equal(normalizeSignInProvider('phone'), 'phone.com');
  assert.equal(normalizeSignInProvider('phone.com'), 'phone.com');
  assert.equal(normalizeSignInProvider('email'), 'password');
  assert.equal(normalizeSignInProvider('google.com'), 'google.com');
  assert.equal(normalizeSignInProvider('anonymous'), 'anonymous');
  assert.equal(normalizeSignInProvider(null), null);
  assert.equal(normalizeSignInProvider(undefined), null);

  const phoneIdentity = normalizeFirebaseIdentity({
    sub: 'firebase-uid-1',
    phone_number: '+919876543210',
    phone_number_verified: true,
    firebase: { sign_in_provider: 'phone' },
  });
  assert.equal(phoneIdentity.signInProvider, 'phone.com');
  assert.equal(assertSupportedSignInProvider(phoneIdentity, ['emailLink', 'password', 'google.com', 'phone.com']), 'phone.com');

  // An operator may also configure the raw Firebase spelling.
  assert.equal(assertSupportedSignInProvider(phoneIdentity, ['phone']), 'phone.com');

  assert.ok(SUPPORTED_SIGN_IN_PROVIDERS.includes('phone.com'));
  assert.ok(!SUPPORTED_SIGN_IN_PROVIDERS.includes('anonymous'));
  assert.ok(!SUPPORTED_SIGN_IN_PROVIDERS.includes('custom'));
});

test('blocks anonymous and custom-token sign-ins from holding wallets', () => {
  const googleIdentity = { signInProvider: 'google.com' };
  const anonymousIdentity = { signInProvider: 'anonymous' };
  const customIdentity = { signInProvider: 'custom' };

  assert.equal(assertSupportedSignInProvider(googleIdentity, ['google.com', 'phone.com']), 'google.com');
  assert.throws(
    () => assertSupportedSignInProvider(anonymousIdentity, ['google.com', 'phone.com']),
    (error) => error.code === 'unsupported_sign_in_provider',
  );
  assert.throws(
    () => assertSupportedSignInProvider(customIdentity, ['google.com']),
    (error) => error instanceof FirebaseAuthError,
  );
});

test('Identity Toolkit account lookup normalizes providers and hides provider errors', async () => {
  const requests = [];
  const client = createFirebaseAuthRestClient({
    apiKey: 'public-web-api-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          users: [{
            localId: 'firebase-uid-1',
            email: 'Player@Example.com',
            emailVerified: true,
            phoneNumber: '+919876543210',
            providerUserInfo: [{ providerId: 'google.com' }, { providerId: 'phone', rawId: '+919876543210' }],
          }],
        }),
      };
    },
  });

  const account = await client.getAccountInfo('user-id-token');

  assert.equal(requests[0].url, 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=public-web-api-key');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer user-id-token');
  assert.equal(account.uid, 'firebase-uid-1');
  assert.equal(account.email, 'player@example.com');
  assert.equal(account.phoneNumber, '+919876543210');
  assert.deepEqual(account.providers, ['google.com', 'phone']);

  const failingClient = createFirebaseAuthRestClient({
    apiKey: 'public-web-api-key',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'INVALID_ID_TOKEN', detail: 'internal detail' } }),
    }),
  });

  await assert.rejects(
    () => failingClient.getAccountInfo('bad-token'),
    (error) => error instanceof FirebaseAuthError
      && error.status === 401
      && !error.message.includes('INVALID_ID_TOKEN'),
  );

  const unconfigured = createFirebaseAuthRestClient({ apiKey: '' });
  await assert.rejects(
    () => unconfigured.getAccountInfo('token'),
    (error) => error.status === 503 && error.code === 'rest_unconfigured',
  );
});

test('verifier never leaks raw private key material into error messages', async () => {
  const { verifier } = createVerifier();

  await assert.rejects(
    () => verifier.verifyIdToken(createIdToken({}, { key: OTHER_KEY_PAIR.privateKey })),
    (error) => {
      assert.ok(!error.message.includes('PRIVATE KEY'));
      assert.ok(error.message.length < 200);
      return true;
    },
  );
});
