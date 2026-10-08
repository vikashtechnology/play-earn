import { createHmac } from 'node:crypto';

import {
  parseFirebasePhoneVerificationRequest,
  parseFirebaseSessionRequest,
  parseOtpRequest,
  parseOtpVerificationRequest,
} from '@rewards-platform/validation';
import { createIdentityRepository } from '../db/identityRepository.js';
import { pool } from '../db.js';
import { config, isFirebaseAuthConfigured, isPlaceholderValue, isPublishedPolicyUrl } from '../config.js';
import { createFirebaseTokenVerifier } from '../services/firebaseAuth.js';
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
} from '../domain/identity.js';
import { verifyAccessToken } from '../security/session.js';
import { isDatabaseUnavailableError } from '../db.js';

// Legacy self-hosted phone OTP (Fast2SMS). Firebase phone auth is the primary
// Minimum-KYC path; this stays available as a configured fallback only.
import { createOtpRepository } from '../db/otpRepository.js';
import { createFast2SmsSender } from '../services/fast2sms.js';
import {
  createOtpService,
  InvalidOtpError,
  OtpDeliveryError,
  OtpRateLimitError,
} from '../domain/otp.js';

const otpService = createOtpService({
  repository: createOtpRepository(pool),
  otpHashSecret: config.otpHashSecret,
  jwtSecret: config.jwtSecret,
  deliveryEnabled: config.otpDeliveryEnabled && Boolean(config.otpProviderApiKey),
  sendOtp: createFast2SmsSender({ apiKey: config.otpProviderApiKey }),
});

function buildFirebaseVerifier(authConfig = config) {
  if (!authConfig.firebaseProjectId) {
    return null;
  }

  return createFirebaseTokenVerifier({
    projectId: authConfig.firebaseProjectId,
    ...(authConfig.firebaseCertsUrl ? { certsUrl: authConfig.firebaseCertsUrl } : {}),
  });
}

function buildIdentityService(authConfig = config) {
  const firebaseAuth = buildFirebaseVerifier(authConfig);
  if (!firebaseAuth) {
    return null;
  }

  return createIdentityService({
    repository: createIdentityRepository(pool),
    firebaseAuth,
    jwtSecret: authConfig.jwtSecret,
    termsVersion: authConfig.termsVersion,
    privacyVersion: authConfig.privacyVersion,
    allowedSignInProviders: authConfig.firebaseAllowedSignInProviders,
    minimumUserAge: authConfig.minimumUserAge,
  });
}

const identityService = buildIdentityService(config);

// Sign-in stays closed until the versions AND real published pages exist. An
// .env.example URL such as https://your-domain.example/terms does not count:
// recording consent against a page nobody can read is not consent.
function hasPublishedPolicies(authConfig = config) {
  return Boolean(
    !isPlaceholderValue(authConfig.termsVersion)
    && !isPlaceholderValue(authConfig.privacyVersion)
    && isPublishedPolicyUrl(authConfig.termsUrl)
    && isPublishedPolicyUrl(authConfig.privacyUrl),
  );
}

// Firebase sign-in also creates accounts, so it stays fail-closed until the
// project is configured, published policy URLs/versions exist, and the operator
// flips SIGNUP_ENABLED.
function isFirebaseSignInEnabled(authConfig = config) {
  return isFirebaseAuthConfigured(authConfig)
    && authConfig.signupEnabled === true
    && hasPublishedPolicies(authConfig);
}

function isFirebasePhoneVerificationEnabled(authConfig = config) {
  return isFirebaseAuthConfigured(authConfig);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new TypeError('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function hashWithSecret(value, secret) {
  if (!value) {
    return null;
  }
  return createHmac('sha256', secret).update(value).digest('hex');
}

function requestFingerprints(req, authConfig = config) {
  return {
    requestIpHash: hashWithSecret(req.socket?.remoteAddress, authConfig.otpHashSecret),
    userAgentHash: hashWithSecret(req.headers?.['user-agent'], authConfig.otpHashSecret),
  };
}

function getUserSession(req, authConfig = config) {
  const authorization = req.headers.authorization ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? verifyAccessToken(match[1], authConfig.jwtSecret, { scope: 'user' }) : null;
}

function identityErrorStatus(error) {
  if (error instanceof InvalidFirebaseTokenError) return 401;
  if (error instanceof IdentityRateLimitError) return 429;
  if (error instanceof AccountConflictError) return 409;
  if (error instanceof UnsupportedSignInProviderError) return 403;
  if (error instanceof PhoneSignInNotAllowedError) return 403;
  if (error instanceof AccountNotActiveError) return 403;
  if (error instanceof ConsentRequiredError || error instanceof StalePolicyVersionError) return 400;
  if (error instanceof PhoneVerificationRequiredError) return 400;
  if (error instanceof ContactVerificationRequiredError) return 400;
  if (error instanceof IdentityError && error.code === 'firebase_unavailable') return 503;
  return null;
}

function sendIdentityError(res, error, fallbackMessage) {
  const status = identityErrorStatus(error);

  if (status) {
    sendJson(res, status, { error: error.message, code: error.code ?? 'identity_error' });
    return;
  }

  if (error instanceof IdentityRateLimitError || (error instanceof Error && error.message === 'OTP_RATE_LIMITED')) {
    sendJson(res, 429, { error: 'Too many verification attempts. Please wait and try again.' });
    return;
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  // A database that cannot be reached is retryable, not a server bug, and the
  // driver's message must never reach a client.
  if (isDatabaseUnavailableError(error)) {
    sendJson(res, 503, {
      error: 'The service is temporarily unavailable. Please try again shortly.',
      code: 'database_unavailable',
    });
    return;
  }

  // Unexpected failures never leak internals.
  sendJson(res, 500, { error: fallbackMessage });
}

export async function handleAuthRoute(
  req,
  res,
  pathname,
  service = otpService,
  identity = identityService,
  authConfig = config,
) {
  if (req.method === 'GET' && pathname === '/api/v1/auth/policies') {
    sendJson(res, 200, {
      authProvider: 'firebase',
      firebaseSignInEnabled: isFirebaseSignInEnabled(authConfig),
      // Alias kept for existing clients.
      signupEnabled: isFirebaseSignInEnabled(authConfig),
      emailSignupEnabled: isFirebaseSignInEnabled(authConfig),
      googleSignInEnabled: isFirebaseSignInEnabled(authConfig) && authConfig.googleSignInEnabled === true,
      phoneVerificationEnabled: isFirebasePhoneVerificationEnabled(authConfig),
      allowedSignInProviders: isFirebaseSignInEnabled(authConfig)
        ? authConfig.firebaseAllowedSignInProviders
        : [],
      minimumUserAge: authConfig.minimumUserAge ?? 18,
      termsUrl: authConfig.termsUrl || null,
      privacyUrl: authConfig.privacyUrl || null,
      termsVersion: authConfig.termsVersion || null,
      privacyVersion: authConfig.privacyVersion || null,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/firebase/session') {
    if (!isFirebaseSignInEnabled(authConfig)) {
      sendJson(res, 503, {
        error: 'Firebase sign-in is unavailable until the Firebase project and published policies are configured.',
        code: 'firebase_sign_in_disabled',
      });
      return;
    }
    if (!identity) {
      sendJson(res, 503, { error: 'Firebase sign-in is not configured on this server.', code: 'firebase_unconfigured' });
      return;
    }

    try {
      const input = parseFirebaseSessionRequest(await readBody(req));
      const session = await identity.exchangeFirebaseSession({
        idToken: input.idToken,
        consent: input.consent,
        ...requestFingerprints(req, authConfig),
      });
      sendJson(res, 200, { ok: true, ...session });
    } catch (error) {
      sendIdentityError(res, error, 'Unable to start your session.');
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/v1/auth/session') {
    const session = getUserSession(req, authConfig);
    if (!session) {
      sendJson(res, 401, { error: 'Sign in is required.', code: 'session_required' });
      return;
    }
    if (!identity) {
      sendJson(res, 503, { error: 'Firebase sign-in is not configured on this server.', code: 'firebase_unconfigured' });
      return;
    }

    try {
      await identity.assertSessionUsable({ userId: session.sub, issuedAt: session.iat });
      const profile = await identity.loadProfile({ userId: session.sub });
      if (!profile) {
        sendJson(res, 404, { error: 'This account no longer exists.', code: 'account_missing' });
        return;
      }
      sendJson(res, 200, { ok: true, user: profile });
    } catch (error) {
      sendIdentityError(res, error, 'Unable to load your session.');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/session/revoke') {
    const session = getUserSession(req, authConfig);
    if (!session) {
      sendJson(res, 401, { error: 'Sign in is required.', code: 'session_required' });
      return;
    }
    if (!identity) {
      sendJson(res, 503, { error: 'Firebase sign-in is not configured on this server.', code: 'firebase_unconfigured' });
      return;
    }

    try {
      const result = await identity.revokeSessions({ userId: session.sub });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendIdentityError(res, error, 'Unable to sign out.');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/withdrawal/phone/verify') {
    if (!isFirebasePhoneVerificationEnabled(authConfig)) {
      sendJson(res, 503, {
        error: 'Firebase phone verification is unavailable until configured.',
        code: 'firebase_phone_disabled',
      });
      return;
    }

    const session = getUserSession(req, authConfig);
    if (!session) {
      sendJson(res, 401, { error: 'Sign in is required before verifying a payout phone.', code: 'session_required' });
      return;
    }
    if (!identity) {
      sendJson(res, 503, { error: 'Firebase sign-in is not configured on this server.', code: 'firebase_unconfigured' });
      return;
    }

    try {
      const input = parseFirebasePhoneVerificationRequest(await readBody(req));
      await identity.assertSessionUsable({ userId: session.sub, issuedAt: session.iat });
      const result = await identity.verifyWithdrawalPhone({
        userId: session.sub,
        idToken: input.idToken,
        phone: input.phone,
      });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof InvalidOtpError) {
        sendJson(res, 401, { error: 'OTP is invalid or expired.', code: 'invalid_otp' });
        return;
      }
      sendIdentityError(res, error, 'Unable to verify payout phone.');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/otp/request') {
    if (authConfig.otpDeliveryEnabled !== true) {
      sendJson(res, 503, {
        error: 'Self-hosted OTP delivery is disabled. Use Firebase phone verification.',
        code: 'otp_delivery_disabled',
      });
      return;
    }

    try {
      const { phone } = parseOtpRequest(await readBody(req));
      const result = await service.requestOtp(phone, requestFingerprints(req, authConfig).requestIpHash);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof OtpRateLimitError || (error instanceof Error && error.message === 'OTP_RATE_LIMITED')) {
        sendJson(res, 429, { error: 'Too many OTP requests. Please wait and try again.' });
      } else if (error instanceof OtpDeliveryError) {
        sendJson(res, 503, { error: 'OTP delivery is unavailable. Please try again later.' });
      } else if (error instanceof TypeError || error instanceof RangeError) {
        sendJson(res, 400, { error: error.message });
      } else {
        sendJson(res, 500, { error: 'Unable to request OTP.' });
      }
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/auth/otp/verify') {
    try {
      const { phone, code } = parseOtpVerificationRequest(await readBody(req));
      const result = await service.verifyOtp(phone, code);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof InvalidOtpError) {
        sendJson(res, 401, { error: 'OTP is invalid or expired.' });
      } else if (error instanceof TypeError || error instanceof RangeError) {
        sendJson(res, 400, { error: error.message });
      } else {
        sendJson(res, 500, { error: 'Unable to verify OTP.' });
      }
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'authentication route not found' });
}

export {
  otpService,
  identityService,
  buildFirebaseVerifier,
  buildIdentityService,
  isFirebaseSignInEnabled,
  isFirebasePhoneVerificationEnabled,
  hasPublishedPolicies,
};
