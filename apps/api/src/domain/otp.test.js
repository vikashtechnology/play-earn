import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOtpService,
  InvalidOtpError,
  OtpDeliveryError,
  OtpRateLimitError,
} from './otp.js';

function createMemoryRepository() {
  const challenges = new Map();
  const latestByPhone = new Map();
  const minimumKycUsers = new Set();

  return {
    challenges,
    async createChallenge(challenge) {
      if (latestByPhone.has(challenge.phoneHash)) {
        const latest = latestByPhone.get(challenge.phoneHash);
        if (challenge.createdAt < latest) {
          throw new Error('OTP_RATE_LIMITED');
        }
      }
      challenges.set(challenge.id, { ...challenge, attempts: 0, consumed: false });
      latestByPhone.set(challenge.phoneHash, challenge.createdAt);
    },
    async invalidateChallenge(id) {
      const challenge = challenges.get(id);
      if (challenge) challenge.consumed = true;
    },
    async verifyChallenge(phoneHash, candidateHash, now, { userId = null, purpose = 'account' } = {}) {
      const challenge = [...challenges.values()].find((item) => item.phoneHash === phoneHash
        && item.userId === userId && item.purpose === purpose && !item.consumed);
      if (!challenge || challenge.expiresAt <= now || challenge.attempts >= 5) return false;
      challenge.attempts += 1;
      const matches = challenge.codeHash === candidateHash;
      if (matches || challenge.attempts >= 5) challenge.consumed = true;
      if (matches && purpose === 'withdrawal') minimumKycUsers.add(userId);
      return matches;
    },
    minimumKycUsers,
  };
}

function setup(sendOtp = async () => {}) {
  let currentTime = Date.parse('2026-10-06T12:00:00.000Z');
  const repository = createMemoryRepository();
  const deliveredCodes = [];
  const service = createOtpService({
    repository,
    sendOtp: async (phone, code) => {
      deliveredCodes.push({ phone, code });
      await sendOtp(phone, code);
    },
    otpHashSecret: 'test-otp-hash-secret',
    jwtSecret: 'test-jwt-signing-secret',
    now: () => currentTime,
  });

  return {
    service,
    repository,
    deliveredCodes,
    setTime: (value) => { currentTime = value; },
  };
}

test('OTP request returns timing only and verification issues a short-lived token', async () => {
  const context = setup();
  const response = await context.service.requestOtp('+919876543210', 'hashed-ip');

  assert.deepEqual(response, { expiresInSeconds: 300, resendInSeconds: 60 });
  assert.equal(JSON.stringify(response).includes(context.deliveredCodes[0].code), false);
  assert.equal(context.deliveredCodes[0].phone, '+919876543210');

  const verified = await context.service.verifyOtp('+919876543210', context.deliveredCodes[0].code);
  const tokenPayload = JSON.parse(Buffer.from(verified.accessToken.split('.')[1], 'base64url').toString('utf8'));

  assert.equal(verified.tokenType, 'Bearer');
  assert.equal(verified.expiresInSeconds, 300);
  assert.equal(tokenPayload.phone_verified, true);
  assert.equal(tokenPayload.scope, 'phone_verified');
  assert.equal(tokenPayload.aud, 'onboarding');
  assert.notEqual(tokenPayload.sub, '+919876543210');
  await assert.rejects(() => context.service.verifyOtp('+919876543210', context.deliveredCodes[0].code), InvalidOtpError);
});

test('OTP verification rejects expired and incorrect codes', async () => {
  const context = setup();
  await context.service.requestOtp('+919876543210', null);
  await assert.rejects(() => context.service.verifyOtp('+919876543210', '000000'), InvalidOtpError);

  context.setTime(Date.parse('2026-10-06T12:06:00.000Z'));
  await assert.rejects(() => context.service.verifyOtp('+919876543210', context.deliveredCodes[0].code), InvalidOtpError);
});

test('OTP delivery failure invalidates the stored challenge', async () => {
  const context = setup(async () => { throw new Error('provider unavailable'); });

  await assert.rejects(() => context.service.requestOtp('+919876543210', null), OtpDeliveryError);
  assert.equal([...context.repository.challenges.values()][0].consumed, true);
});

test('OTP service maps repository cooldown to a rate-limit error', async () => {
  const context = setup();
  context.repository.createChallenge = async () => { throw new Error('OTP_RATE_LIMITED'); };

  await assert.rejects(() => context.service.requestOtp('+919876543210', null), OtpRateLimitError);
});

test('disabled OTP delivery does not persist a challenge', async () => {
  const context = setup();
  const disabledService = createOtpService({
    repository: context.repository,
    sendOtp: async () => {},
    otpHashSecret: 'test-otp-hash-secret',
    jwtSecret: 'test-jwt-signing-secret',
    deliveryEnabled: false,
  });

  await assert.rejects(() => disabledService.requestOtp('+919876543210', 'hashed-ip'), OtpDeliveryError);
  assert.equal(context.repository.challenges.size, 0);
});

test('withdrawal OTP is bound to the user and purpose and marks Minimum KYC', async () => {
  const context = setup();
  const userId = 'user-for-minimum-kyc';
  await context.service.requestOtp('+919876543210', null, { userId, purpose: 'withdrawal' });
  const code = context.deliveredCodes[0].code;
  const result = await context.service.verifyOtp('+919876543210', code, { userId, purpose: 'withdrawal' });

  assert.deepEqual(result, { minimumKycVerified: true });
  assert.equal(context.repository.minimumKycUsers.has(userId), true);
  await assert.rejects(
    () => context.service.verifyOtp('+919876543210', code, { userId: 'another-user', purpose: 'withdrawal' }),
    InvalidOtpError,
  );
});
