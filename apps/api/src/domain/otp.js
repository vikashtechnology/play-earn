import { createHmac, randomInt, randomUUID } from 'node:crypto';

const otpLifetimeSeconds = 300;
const resendDelaySeconds = 60;

export class OtpRateLimitError extends Error {}
export class OtpDeliveryError extends Error {}
export class InvalidOtpError extends Error {}

function hashOtp(phone, code, secret) {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

function signAccessToken(phoneHash, secret, issuedAtSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: phoneHash,
    phone_verified: true,
    scope: 'phone_verified',
    aud: 'onboarding',
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + 300,
  })).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');

  return `${unsignedToken}.${signature}`;
}

export function createOtpService({
  repository,
  sendOtp,
  otpHashSecret,
  jwtSecret,
  deliveryEnabled = true,
  now = Date.now,
}) {
  if (!repository || typeof sendOtp !== 'function' || !otpHashSecret || !jwtSecret) {
    throw new TypeError('OTP service requires a repository, SMS sender, OTP hash secret, and token secret');
  }

  return {
    async requestOtp(phone, requestIpHash, { userId = null, purpose = 'account' } = {}) {
      if (!deliveryEnabled) {
        throw new OtpDeliveryError('OTP delivery is not enabled');
      }

      const code = String(randomInt(100_000, 1_000_000));
      const phoneHash = hashOtp('phone', phone, otpHashSecret);
      const challenge = {
        id: randomUUID(),
        phoneHash,
        codeHash: hashOtp(phone, code, otpHashSecret),
        requestIpHash,
        userId,
        purpose,
        expiresAt: new Date(now() + otpLifetimeSeconds * 1000),
      };

      try {
        await repository.createChallenge(challenge);
      } catch (error) {
        if (error instanceof Error && error.message === 'OTP_RATE_LIMITED') {
          throw new OtpRateLimitError('Please wait before requesting another OTP');
        }
        throw error;
      }

      try {
        await sendOtp(phone, code);
      } catch {
        await repository.invalidateChallenge(challenge.id);
        throw new OtpDeliveryError('OTP delivery is currently unavailable');
      }

      return {
        expiresInSeconds: otpLifetimeSeconds,
        resendInSeconds: resendDelaySeconds,
      };
    },

    async verifyOtp(phone, code, { userId = null, purpose = 'account' } = {}) {
      const phoneHash = hashOtp('phone', phone, otpHashSecret);
      const candidateHash = hashOtp(phone, code, otpHashSecret);
      const verified = await repository.verifyChallenge(phoneHash, candidateHash, new Date(now()), {
        userId,
        purpose,
        phone,
      });

      if (!verified) {
        throw new InvalidOtpError('OTP is invalid or expired');
      }

      if (purpose === 'withdrawal') {
        return { minimumKycVerified: true };
      }

      const issuedAt = Math.floor(now() / 1000);

      return {
        accessToken: signAccessToken(phoneHash, jwtSecret, issuedAt),
        tokenType: 'Bearer',
        expiresInSeconds: 300,
      };
    },
  };
}