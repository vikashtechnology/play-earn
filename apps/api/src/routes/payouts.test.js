import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../app.js';
import { issueAccessToken, verifyAccessToken } from '../security/session.js';

const testJwtSecret = 'payout-route-test-secret';

async function requestJson(method, path, body, { userId = 'user-1', minimumKyc = true, authenticated = true } = {}) {
  const server = createApp({
    payoutDependencies: {
      verifyToken: (token) => verifyAccessToken(token, testJwtSecret, { scope: 'user' }),
      hasMinimumKyc: async () => minimumKyc,
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authenticated ? {
        Authorization: `Bearer ${issueAccessToken({ subject: userId, scope: 'user', secret: testJwtSecret })}`,
      } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();
  await new Promise((resolve) => server.close(resolve));

  return { status: response.status, body: json };
}

test('payout route returns pending requests for a user', async () => {
  const result = await requestJson('GET', '/api/v1/payouts/user-1');

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.payouts), true);
});

test('payout route accepts a valid payout request', async () => {
  const result = await requestJson('POST', '/api/v1/payouts/user-1', {
    amount: 300,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_test_0001',
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.payout.amount, 300);
  assert.equal(result.body.payout.status, 'pending');
});

test('cash withdrawal requires a signed-in user and matching path identity', async () => {
  const unauthenticated = await requestJson('POST', '/api/v1/payouts/user-1', {
    amount: 100,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_test_0002',
  }, { authenticated: false });
  const spoofed = await requestJson('POST', '/api/v1/payouts/user-2', {
    amount: 100,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_test_0003',
  });

  assert.equal(unauthenticated.status, 401);
  assert.equal(spoofed.status, 403);
});

test('cash withdrawal is blocked until phone Minimum KYC is verified', async () => {
  const result = await requestJson('POST', '/api/v1/payouts/user-1', {
    amount: 100,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_test_0004',
  }, { minimumKyc: false });

  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'MINIMUM_KYC_REQUIRED');
  assert.equal(result.body.nextAction, 'verify_phone');
});

test('withdrawal rejects client-controlled status and identity fields', async () => {
  const result = await requestJson('POST', '/api/v1/payouts/user-1', {
    amount: 100,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_test_0005',
    status: 'approved',
    userId: 'user-2',
  });

  assert.equal(result.status, 400);
});
