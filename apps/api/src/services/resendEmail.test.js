import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerificationEmailSenders, EmailDeliveryError } from './resendEmail.js';

test('email sender places code and one-time verification link in transactional message', async () => {
  let request;
  const senders = createVerificationEmailSenders({
    primaryApiKey: 'primary-test-key',
    fallbackApiKey: 'fallback-test-key',
    from: 'Play & Earn <verify@example.com>',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    },
  });

  await senders.sendCode({
    email: 'person@example.com',
    fullName: 'Person',
    code: '123456',
    verificationUrl: 'playearnrealcash://auth/verify-email?token=single-use',
  });

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.authorization, 'Bearer primary-test-key');
  const message = JSON.parse(request.options.body);
  assert.deepEqual(message.to, ['person@example.com']);
  assert.match(message.text, /123456/);
  assert.match(message.text, /playearnrealcash:\/\/auth\/verify-email/);
});

test('fallback link uses the independent fallback sender and safely errors when unconfigured', async () => {
  const authorizations = [];
  const senders = createVerificationEmailSenders({
    primaryApiKey: 'primary-test-key',
    fallbackApiKey: 'fallback-test-key',
    from: 'Play & Earn <verify@example.com>',
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.authorization);
      return { ok: true };
    },
  });

  await senders.sendFallbackLink({
    email: 'person@example.com',
    fullName: 'Person',
    verificationUrl: 'playearnrealcash://auth/verify-email?token=single-use',
  });
  assert.equal(authorizations[0], 'Bearer fallback-test-key');

  const missing = createVerificationEmailSenders({ from: 'verify@example.com' });
  await assert.rejects(() => missing.sendFallbackLink({
    email: 'person@example.com',
    fullName: 'Person',
    verificationUrl: 'playearnrealcash://auth/verify-email?token=single-use',
  }), EmailDeliveryError);
});
