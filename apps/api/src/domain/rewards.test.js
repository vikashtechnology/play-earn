import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReferralReward,
  createRewardEvent,
  processRewardEvent,
  resolveRewardStatus,
} from './rewards.js';

test('reward event uses offer reward amount and pending status', () => {
  const reward = createRewardEvent({
    userId: 'user-1',
    offerId: 'offer-1',
    rewardCoins: 150,
  });

  assert.equal(reward.status, 'pending');
  assert.equal(reward.rewardCoins, 150);
});

test('referral reward creates a valid reward payload', () => {
  const reward = createReferralReward({
    referrerUserId: 'user-1',
    referredUserId: 'user-2',
    rewardCoins: 50,
  });

  assert.equal(reward.status, 'pending');
  assert.equal(reward.rewardCoins, 50);
});

test('process reward marks approved reward as credit and unlocks balance delta', () => {
  const processed = processRewardEvent({
    userId: 'user-1',
    offerId: 'offer-1',
    rewardCoins: 200,
    status: 'approved',
  });

  assert.equal(processed.status, 'approved');
  assert.equal(processed.balanceDelta, 200);
  assert.equal(processed.direction, 'credit');
});

test('reward statuses map to valid final states', () => {
  assert.equal(resolveRewardStatus('approved'), 'approved');
  assert.equal(resolveRewardStatus('reversed'), 'reversed');
  assert.equal(resolveRewardStatus('pending'), 'pending');
});
