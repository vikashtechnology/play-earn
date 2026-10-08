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

test('products route returns catalog items', async () => {
  const result = await requestJson('GET', '/api/v1/products');

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.products), true);
});

test('products route accepts a valid product', async () => {
  const result = await requestJson('POST', '/api/v1/products', {
    sku: 'sku-1',
    title: 'Bluetooth Speaker',
    priceCoins: 1500,
    cashAddon: 200,
    status: 'active',
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.product.title, 'Bluetooth Speaker');
});

test('orders calculate coin and cash totals from catalog prices', async () => {
  const result = await requestJson('POST', '/api/v1/orders', {
    productSku: 'sku-1',
    quantity: 2,
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.order.coinsSpent, 3000);
  assert.equal(result.body.order.cashSpent, 400);
  assert.equal(result.body.order.totalAmount, 3400);
});

test('orders reject client-supplied prices and identity fields', async () => {
  const result = await requestJson('POST', '/api/v1/orders', {
    productSku: 'sku-1',
    quantity: 1,
    coinsSpent: 1,
    cashSpent: 0,
    userId: 'attacker-user',
  });

  assert.equal(result.status, 400);
});
