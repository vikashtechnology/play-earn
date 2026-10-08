import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProduct,
  createOrder,
  isProductOrderAllowed,
} from './products.js';

test('product creation normalizes catalog values', () => {
  const product = createProduct({
    sku: 'sku-1',
    title: 'Bluetooth Speaker',
    priceCoins: 1200,
    cashAddon: 150,
    status: 'active',
  });

  assert.equal(product.title, 'Bluetooth Speaker');
  assert.equal(product.priceCoins, 1200);
  assert.equal(product.status, 'active');
});

test('order creation calculates the total for coin plus cash product purchase', () => {
  const order = createOrder({
    userId: 'user-1',
    productId: 'product-1',
    quantity: 2,
    coinsSpent: 400,
    cashSpent: 300,
  });

  assert.equal(order.totalAmount, 700);
  assert.equal(order.quantity, 2);
});

test('product order validation rejects invalid purchases', () => {
  const product = createProduct({
    sku: 'sku-2',
    title: 'Phone Case',
    priceCoins: 0,
    cashAddon: 0,
    status: 'active',
  });

  assert.equal(isProductOrderAllowed(product, 1), false);
});
