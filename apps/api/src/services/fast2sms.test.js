import test from 'node:test';
import assert from 'node:assert/strict';

import { createFast2SmsSender } from './fast2sms.js';
import { OtpDeliveryError } from '../domain/otp.js';

test('Fast2SMS sends only to validated Indian numbers using its OTP route', async () => {
  let request;
  const sender = createFast2SmsSender({
    apiKey: 'test-api-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ return: true }) };
    },
  });

  await sender('+919876543210', '123456');

  assert.equal(request.url, 'https://www.fast2sms.com/dev/bulkV2');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'test-api-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    route: 'otp',
    variables_values: '123456',
    numbers: '9876543210',
  });
});

test('Fast2SMS sender rejects missing credentials, invalid phones, and provider errors', async () => {
  const missingKeySender = createFast2SmsSender({ apiKey: '' });
  await assert.rejects(() => missingKeySender('+919876543210', '123456'), OtpDeliveryError);

  const sender = createFast2SmsSender({
    apiKey: 'test-api-key',
    fetchImpl: async () => ({ ok: false, json: async () => ({ return: false }) }),
  });
  await assert.rejects(() => sender('+12025550123', '123456'), OtpDeliveryError);
  await assert.rejects(() => sender('+919876543210', '123456'), OtpDeliveryError);
});