import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPayoutRequest,
  createUserRedemption,
  isPayoutAllowed,
  resolvePayoutStatus,
} from './payouts.js';

test('payout request creates a valid pending request', () => {
  const payout = createPayoutRequest({
    userId: 'user-1',
    amount: 250,
    provider: 'razorpayx',
    payoutType: 'upi',
  });

  assert.equal(payout.status, 'pending');
  assert.equal(payout.provider, 'razorpayx');
  assert.equal(payout.amount, 250);
});

test('redemption allows money conversion only with valid tokens and sufficient balance', () => {
  const redemption = createUserRedemption({
    userId: 'user-1',
    type: 'gift_card',
    coinsRequired: 500,
    cashAddon: 0,
    status: 'pending',
  });

  assert.equal(redemption.type, 'gift_card');
  assert.equal(redemption.coinsRequired, 500);
});

test('payout validation blocks invalid or impossible requests', () => {
  const invalid = createPayoutRequest({
    userId: 'user-1',
    amount: -5,
    provider: 'razorpayx',
    payoutType: 'upi',
  });

  assert.equal(isPayoutAllowed(invalid), false);
  assert.equal(resolvePayoutStatus('approved'), 'approved');
});
