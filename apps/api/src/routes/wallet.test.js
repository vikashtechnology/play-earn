import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../app.js';

async function requestJson(method, path, body) {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();
  await new Promise((resolve) => server.close(resolve));

  return { status: response.status, body: json };
}

test('wallet route returns zero-balance wallet for a user', async () => {
  const result = await requestJson('GET', '/api/v1/wallet/user-123');

  assert.equal(result.status, 200);
  assert.equal(result.body.balance, 0);
  assert.equal(result.body.currencyCode, 'INR');
});

test('wallet route credits rewards and updates balance', async () => {
  const result = await requestJson('POST', '/api/v1/wallet/user-123/transactions', {
    direction: 'credit',
    amount: 250,
    type: 'reward',
    reason: 'offer_completion',
    sourceType: 'offer',
    sourceId: 'offer-1',
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.balance, 250);
  assert.equal(result.body.transactions.length, 1);
});

test('wallet route rejects insufficient debit', async () => {
  const result = await requestJson('POST', '/api/v1/wallet/user-123/transactions', {
    direction: 'debit',
    amount: 999,
    type: 'withdrawal',
    reason: 'payout_request',
    sourceType: 'withdrawal',
    sourceId: 'withdrawal-1',
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /insufficient funds/i);
});
