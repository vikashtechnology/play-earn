import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateOfferReward,
  createOffer,
  isOfferEligible,
  normalizeOffer,
} from './offers.js';

test('offer creation normalizes values and reward amount', () => {
  const offer = createOffer({
    provider: 'tapjoy',
    title: 'Survey',
    description: 'Take a survey',
    kind: 'survey',
    payoutCoins: 150,
    countryCode: 'IN',
    status: 'active',
  });

  assert.equal(offer.provider, 'tapjoy');
  assert.equal(offer.payoutCoins, 150);
  assert.equal(offer.status, 'active');
});

test('offer reward calculation is based on configured payout', () => {
  const offer = createOffer({
    provider: 'offerwall',
    title: 'Install app',
    payoutCoins: 300,
    status: 'active',
  });

  assert.equal(calculateOfferReward(offer), 300);
});

test('offer eligibility rejects inactive or invalid offers', () => {
  const inactive = createOffer({ title: 'Old offer', payoutCoins: 10, status: 'draft' });
  const missing = createOffer({ title: 'Missing', payoutCoins: 0, status: 'active' });

  assert.equal(isOfferEligible(inactive), false);
  assert.equal(isOfferEligible(missing), false);
});

test('normalize offer trims strings and uses defaults', () => {
  const normalized = normalizeOffer({
    provider: '  tapjoy  ',
    title: '  Quick Task  ',
    kind: '  referral  ',
    payoutCoins: '120',
    countryCode: ' in ',
  });

  assert.equal(normalized.provider, 'tapjoy');
  assert.equal(normalized.title, 'Quick Task');
  assert.equal(normalized.kind, 'referral');
  assert.equal(normalized.payoutCoins, 120);
  assert.equal(normalized.countryCode, 'IN');
});
