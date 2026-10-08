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

test('reward route returns pending reward summary for a user', async () => {
  const result = await requestJson('GET', '/api/v1/rewards/user-123');

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.rewards), true);
});

test('reward route accepts a valid reward event', async () => {
  const result = await requestJson('POST', '/api/v1/rewards/user-123', {
    offerId: 'offer-1',
    rewardCoins: 180,
    status: 'approved',
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.reward.rewardCoins, 180);
  assert.equal(result.body.reward.status, 'approved');
});
