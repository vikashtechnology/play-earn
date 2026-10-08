import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from './app.js';

async function getJSON(path) {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await response.json();

  await new Promise((resolve) => server.close(resolve));
  return { status: response.status, body };
}

test('root route returns service details', async () => {
  const result = await getJSON('/');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    name: 'Rewards Platform API',
    status: 'running',
    version: '0.1.0',
    authProvider: 'firebase',
  });
});

test('health route returns service status', async () => {
  const result = await getJSON('/api/health');

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.service, 'rewards-platform-api');
});

async function postJSON(path, body, headers = {}, app = createApp()) {
  await new Promise((resolve) => app.listen(0, resolve));

  try {
    const { port } = app.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return { status: response.status, body: parsed, app };
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
}

// Regression: app.js used to build its own payout dependencies and forgot
// verifyToken, so payouts.js called a missing function. Because that happens in
// an async request handler, the TypeError became an unhandled rejection and
// killed the whole API process — any Bearer token on /payouts was a denial of
// service. The route tests injected their own dependencies, so the default
// wiring was never exercised.
test('an authenticated payout request survives the default app wiring', async () => {
  const result = await postJSON(
    '/api/v1/payouts/user-1',
    { amount: 100, payoutType: 'upi', upiId: 'player@upi', idempotencyKey: 'smoke-1' },
    { Authorization: 'Bearer not.a.real.token' },
  );

  assert.equal(result.status, 401);
  assert.equal(typeof result.body.error, 'string');
});

test('a route that throws returns a 500 and the server keeps serving', async () => {
  const app = createApp({
    payoutDependencies: {
      verifyToken: () => {
        throw new Error('dependency exploded');
      },
      identityRepository: {},
    },
  });

  const crashed = await postJSON(
    '/api/v1/payouts/user-1',
    { amount: 100, payoutType: 'upi', upiId: 'player@upi', idempotencyKey: 'smoke-2' },
    { Authorization: 'Bearer a.b.c' },
    app,
  );
  assert.equal(crashed.status, 500);
  assert.equal(crashed.body.error, 'Internal server error');
  assert.equal(JSON.stringify(crashed.body).includes('exploded'), false, 'internals stay server-side');

  await new Promise((resolve) => app.listen(0, resolve));
  const { port } = app.address();
  const after = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(after.status, 200, 'the process is still serving after a throwing route');
  await new Promise((resolve) => app.close(resolve));
});
