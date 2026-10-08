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

test('offers list returns active offers', async () => {
  const result = await requestJson('GET', '/api/v1/offers');

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.offers), true);
});

test('offer creation accepts a valid offer payload', async () => {
  const result = await requestJson('POST', '/api/v1/offers', {
    provider: 'tapjoy',
    title: 'Quick Survey',
    description: 'Take a survey and earn coins',
    kind: 'survey',
    payoutCoins: 120,
    countryCode: 'IN',
    status: 'active',
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.offer.title, 'Quick Survey');
  assert.equal(result.body.offer.payoutCoins, 120);
});

test('install offer creation rejects non-Play-Store destinations', async () => {
  const result = await requestJson('POST', '/api/v1/offers', {
    provider: 'offerwall',
    title: 'Partner install',
    kind: 'install',
    payoutCoins: 200,
    landingUrl: 'https://example.com/download.apk',
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /Google Play Store/);
});

test('install offer creation accepts Play Store listings', async () => {
  const result = await requestJson('POST', '/api/v1/offers', {
    provider: 'offerwall',
    title: 'Partner install',
    kind: 'install',
    payoutCoins: 200,
    landingUrl: 'https://play.google.com/store/apps/details?id=com.example.partner',
  });

  assert.equal(result.status, 201);
  assert.match(result.body.offer.landingUrl, /^https:\/\/play\.google\.com\/store\/apps\//);
});
