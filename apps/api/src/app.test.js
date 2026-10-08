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
