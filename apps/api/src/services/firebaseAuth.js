import { createPublicKey, verify as verifySignature } from 'node:crypto';

// Firebase Auth ID tokens are RS256 JWTs signed by Google's securetoken service
// account. The public certificates are published here and cached per
// `Cache-Control: max-age`.
export const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const MAX_TOKEN_LENGTH = 8192;
const DEFAULT_CLOCK_SKEW_SECONDS = 300;
const MIN_CERT_CACHE_SECONDS = 60;
const MAX_CERT_CACHE_SECONDS = 3600;

// Sign-in providers this platform accepts. Anonymous and custom tokens are
// deliberately excluded: every account must be a real, verifiable identity
// before it can hold a coin balance or request a payout.
export const SUPPORTED_SIGN_IN_PROVIDERS = [
  'password',
  'emailLink',
  'google.com',
  'phone.com',
  'facebook.com',
  'apple.com',
];

export class FirebaseAuthError extends Error {
  constructor(status, message, code = 'firebase_auth_error') {
    super(message);
    this.name = 'FirebaseAuthError';
    this.status = status;
    this.code = code;
  }
}

function decodeSegment(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function readCacheSeconds(response, fallback = 300) {
  const header = response.headers?.get?.('cache-control') ?? '';
  const maxAge = Number(String(header).match(/max-age=(\d+)/)?.[1] ?? fallback);
  if (!Number.isFinite(maxAge)) {
    return fallback;
  }
  return Math.max(MIN_CERT_CACHE_SECONDS, Math.min(maxAge, MAX_CERT_CACHE_SECONDS));
}

// Google publishes the securetoken certificates as a kid -> PEM certificate
// map. A standard JWKS document is also accepted so the verifier can run
// against a local test issuer.
function normalizeKeySet(payload) {
  if (Array.isArray(payload?.keys)) {
    return payload.keys
      .filter((key) => typeof key.kid === 'string')
      .map((key) => ({ kid: key.kid, key }));
  }

  return Object.entries(payload ?? {})
    .filter(([, certificate]) => typeof certificate === 'string' && certificate.includes('BEGIN CERTIFICATE'))
    .map(([kid, certificate]) => ({ kid, key: certificate }));
}

function publicKeyFor(entry) {
  return typeof entry.key === 'string'
    ? createPublicKey(entry.key)
    : createPublicKey({ key: entry.key, format: 'jwk' });
}

export function createFirebaseTokenVerifier({
  projectId,
  fetchImpl = fetch,
  now = Date.now,
  certsUrl = FIREBASE_CERTS_URL,
  clockSkewSeconds = DEFAULT_CLOCK_SKEW_SECONDS,
} = {}) {
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new TypeError('Firebase token verification requires FIREBASE_PROJECT_ID');
  }

  let cachedKeys = null;
  let cachedKeysExpireAt = 0;

  async function loadKeys({ force = false } = {}) {
    if (!force && cachedKeys && cachedKeysExpireAt > now()) {
      return cachedKeys;
    }

    let response;
    try {
      response = await fetchImpl(certsUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new FirebaseAuthError(503, 'Firebase signing certificates are unavailable', 'certs_unreachable');
    }

    if (!response.ok) {
      throw new FirebaseAuthError(503, 'Firebase signing certificates are unavailable', 'certs_unreachable');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new FirebaseAuthError(503, 'Firebase signing certificates are unavailable', 'certs_invalid');
    }

    const keys = normalizeKeySet(payload);
    if (keys.length === 0) {
      throw new FirebaseAuthError(503, 'Firebase signing certificates are unavailable', 'certs_invalid');
    }

    cachedKeys = keys;
    cachedKeysExpireAt = now() + readCacheSeconds(response) * 1000;
    return cachedKeys;
  }

  function assertClaims(claims) {
    const nowSeconds = Math.floor(now() / 1000);
    const expectedIssuer = `https://securetoken.google.com/${projectId}`;

    if (claims.iss !== expectedIssuer) {
      throw new FirebaseAuthError(401, 'Firebase ID token issuer is invalid', 'invalid_issuer');
    }
    if (claims.aud !== projectId) {
      throw new FirebaseAuthError(401, 'Firebase ID token audience is invalid', 'invalid_audience');
    }
    if (!Number.isInteger(claims.exp) || claims.exp <= nowSeconds) {
      throw new FirebaseAuthError(401, 'Firebase ID token has expired', 'token_expired');
    }
    if (!Number.isInteger(claims.iat) || claims.iat > nowSeconds + clockSkewSeconds) {
      throw new FirebaseAuthError(401, 'Firebase ID token was issued in the future', 'invalid_issued_at');
    }
    if (!Number.isInteger(claims.auth_time) || claims.auth_time > nowSeconds + clockSkewSeconds) {
      throw new FirebaseAuthError(401, 'Firebase ID token is missing an authentication time', 'invalid_auth_time');
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new FirebaseAuthError(401, 'Firebase ID token is missing a subject', 'invalid_subject');
    }
    // Firebase mirrors `sub` into `user_id`; a mismatch means the token was
    // reissued or tampered with.
    if (claims.user_id !== undefined && claims.user_id !== claims.sub) {
      throw new FirebaseAuthError(401, 'Firebase ID token subject is inconsistent', 'invalid_subject');
    }
    if (claims.firebase?.tenant !== undefined && typeof claims.firebase.tenant !== 'string') {
      throw new FirebaseAuthError(401, 'Firebase ID token tenant claim is invalid', 'invalid_tenant');
    }
  }

  async function verifyIdToken(idToken) {
    if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > MAX_TOKEN_LENGTH) {
      throw new FirebaseAuthError(401, 'Firebase ID token is missing or malformed', 'malformed_token');
    }

    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new FirebaseAuthError(401, 'Firebase ID token is missing or malformed', 'malformed_token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    let header;
    let claims;
    try {
      header = decodeSegment(encodedHeader);
      claims = decodeSegment(encodedPayload);
    } catch {
      throw new FirebaseAuthError(401, 'Firebase ID token is missing or malformed', 'malformed_token');
    }

    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
      throw new FirebaseAuthError(401, 'Firebase ID token signing algorithm is not accepted', 'invalid_algorithm');
    }

    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`);
    const signature = Buffer.from(encodedSignature, 'base64url');
    if (signature.length === 0) {
      throw new FirebaseAuthError(401, 'Firebase ID token signature is missing', 'invalid_signature');
    }

    let keys = await loadKeys();
    let entry = keys.find((candidate) => candidate.kid === header.kid);

    if (!entry) {
      // Google rotates keys; a fresh certificate fetch is allowed once before
      // the token is rejected.
      keys = await loadKeys({ force: true });
      entry = keys.find((candidate) => candidate.kid === header.kid);
    }
    if (!entry) {
      throw new FirebaseAuthError(401, 'Firebase ID token was signed by an unknown key', 'unknown_signing_key');
    }

    let signatureIsValid = false;
    try {
      signatureIsValid = verifySignature('RSA-SHA256', signingInput, publicKeyFor(entry), signature);
    } catch {
      signatureIsValid = false;
    }
    if (!signatureIsValid) {
      throw new FirebaseAuthError(401, 'Firebase ID token signature is invalid', 'invalid_signature');
    }

    assertClaims(claims);

    return normalizeFirebaseIdentity(claims);
  }

  return { verifyIdToken, loadKeys };
}

// Firebase ID tokens report the sign-in provider with slightly different names
// than the provider IDs used elsewhere ("phone" rather than "phone.com",
// "email" for legacy email/password accounts). Normalize so configuration and
// comparisons can use either spelling.
const SIGN_IN_PROVIDER_ALIASES = {
  phone: 'phone.com',
  email: 'password',
};

export function normalizeSignInProvider(provider) {
  if (typeof provider !== 'string' || provider.length === 0) {
    return null;
  }
  return SIGN_IN_PROVIDER_ALIASES[provider] ?? provider;
}

export function normalizeFirebaseIdentity(claims) {
  const provider = normalizeSignInProvider(claims.firebase?.sign_in_provider);

  return {
    uid: claims.sub,
    email: typeof claims.email === 'string' && claims.email.length > 0 ? claims.email.toLowerCase() : null,
    emailVerified: claims.email_verified === true,
    phoneNumber: typeof claims.phone_number === 'string' && claims.phone_number.length > 0
      ? claims.phone_number
      : null,
    // Minimum KYC depends on this: a phone number Firebase has not verified is
    // treated exactly like no phone number at all.
    phoneVerified: claims.phone_number_verified === true,
    displayName: typeof claims.name === 'string' && claims.name.length > 0
      ? claims.name
      : (typeof claims.display_name === 'string' ? claims.display_name : null),
    photoUrl: typeof claims.picture === 'string' && claims.picture.length > 0 ? claims.picture : null,
    signInProvider: provider,
    signInSecondFactor: typeof claims.firebase?.sign_in_second_factor === 'string'
      ? claims.firebase.sign_in_second_factor
      : null,
    tenant: typeof claims.firebase?.tenant === 'string' ? claims.firebase.tenant : null,
    nonce: typeof claims.nonce === 'string' && claims.nonce.length > 0 ? claims.nonce : null,
    authTime: Number.isInteger(claims.auth_time) ? claims.auth_time : null,
    issuedAt: Number.isInteger(claims.iat) ? claims.iat : null,
    expiresAt: Number.isInteger(claims.exp) ? claims.exp : null,
  };
}

export function assertSupportedSignInProvider(identity, allowedProviders) {
  const configured = Array.isArray(allowedProviders) && allowedProviders.length > 0
    ? allowedProviders
    : SUPPORTED_SIGN_IN_PROVIDERS;
  const allowed = configured.map(normalizeSignInProvider);

  if (!identity.signInProvider || !allowed.includes(identity.signInProvider)) {
    throw new FirebaseAuthError(
      403,
      'This sign-in method is not accepted for Play & Earn accounts',
      'unsupported_sign_in_provider',
    );
  }

  return identity.signInProvider;
}

// Server-side Identity Toolkit client. Used only for read-only account lookups
// with a user's own ID token. The web API key is a public Firebase identifier,
// never a service-account secret, and it is still kept server-side only.
export function createFirebaseAuthRestClient({ apiKey, fetchImpl = fetch } = {}) {
  async function request(path, { body, idToken } = {}) {
    if (!apiKey) {
      throw new FirebaseAuthError(503, 'Firebase Auth REST access is not configured', 'rest_unconfigured');
    }

    let response;
    try {
      response = await fetchImpl(`${IDENTITY_TOOLKIT_URL}/${path}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new FirebaseAuthError(503, 'Firebase Auth is unavailable', 'rest_unreachable');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      // Provider error details are never forwarded to clients.
      throw new FirebaseAuthError(
        response.status === 401 || response.status === 400 ? 401 : 503,
        'Firebase Auth rejected the request',
        'rest_rejected',
      );
    }

    return payload;
  }

  return {
    async getAccountInfo(idToken) {
      const payload = await request('accounts:lookup', { idToken });
      const account = payload.users?.[0];
      if (!account?.localId) {
        throw new FirebaseAuthError(401, 'Firebase account could not be loaded', 'account_missing');
      }

      const phoneEntry = account.providerUserInfo?.find((entry) => entry.providerId === 'phone');
      return {
        uid: account.localId,
        email: typeof account.email === 'string' ? account.email.toLowerCase() : null,
        emailVerified: account.emailVerified === true,
        phoneNumber: typeof account.phoneNumber === 'string' && account.phoneNumber.length > 0
          ? account.phoneNumber
          : (phoneEntry?.rawId ?? null),
        displayName: account.displayName ?? null,
        photoUrl: account.photoUrl ?? null,
        providers: (account.providerUserInfo ?? [])
          .map((entry) => entry.providerId)
          .filter((providerId) => typeof providerId === 'string'),
        createdAt: account.createdAt ?? null,
        lastLoginAt: account.lastLoginAt ?? null,
      };
    },
  };
}
