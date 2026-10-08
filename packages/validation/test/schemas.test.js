import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCashWithdrawalRequest,
  parseConsentInput,
  parseFirebasePhoneVerificationRequest,
  parseFirebaseSessionRequest,
  parseOfferCreateInput,
  parseOtpRequest,
  parseOtpVerificationRequest,
  parsePayoutRequestInput,
  parseProductCreateInput,
  parseProductOrderRequest,
  parseRewardEventInput,
  parseWalletTransactionInput,
} from '../index.js';

test('offer and product schemas normalize defaults and reject invalid values', () => {
  assert.equal(parseOfferCreateInput({ title: 'Survey' }).countryCode, 'IN');
  assert.equal(parseProductCreateInput({ sku: 'sku-1', title: 'Speaker' }).status, 'draft');
  assert.throws(() => parseProductCreateInput({ sku: '', title: 'Speaker' }));
});

test('install offers only accept Google Play Store destinations', () => {
  const offer = parseOfferCreateInput({
    title: 'Partner app install',
    kind: 'install',
    landingUrl: 'https://play.google.com/store/apps/details?id=com.example.partner',
  });

  assert.equal(offer.kind, 'install');
  assert.throws(() => parseOfferCreateInput({
    title: 'External APK',
    kind: 'install',
    landingUrl: 'https://example.com/app.apk',
  }));
  assert.throws(() => parseOfferCreateInput({ title: 'Missing destination', kind: 'install' }));
});

test('wallet and reward schemas reject unsafe amounts', () => {
  assert.equal(parseWalletTransactionInput({ direction: 'credit', amount: 12 }).amount, 12);
  assert.throws(() => parseWalletTransactionInput({ direction: 'credit', amount: 1.5 }));
  assert.throws(() => parseRewardEventInput({ offerId: 'offer-1', rewardCoins: -1 }));
  assert.throws(() => parseRewardEventInput({ offerId: 'offer-1', rewardCoins: 1, status: 'approved' }));
});

test('payout schema restricts supported payout destinations', () => {
  assert.equal(parsePayoutRequestInput({ amount: 100, payoutType: 'upi' }).amount, 100);
  assert.throws(() => parsePayoutRequestInput({ amount: 100, payoutType: 'wallet' }));
});

test('order request rejects client-supplied price or identity fields', () => {
  assert.deepEqual(parseProductOrderRequest({ productSku: 'sku-1', quantity: 2 }), {
    productSku: 'sku-1',
    quantity: 2,
  });
  assert.throws(() => parseProductOrderRequest({ productSku: 'sku-1', coinsSpent: 1, quantity: 2 }));
});

test('OTP schemas normalize Indian numbers and require six digits', () => {
  assert.deepEqual(parseOtpRequest({ phone: '98765 43210' }), { phone: '+919876543210' });
  assert.deepEqual(parseOtpRequest({ phone: '+91 98765-43210' }), { phone: '+919876543210' });
  assert.throws(() => parseOtpRequest({ phone: '12345' }));
  assert.deepEqual(parseOtpVerificationRequest({ phone: '9876543210', code: '123456' }), {
    phone: '+919876543210',
    code: '123456',
  });
  assert.throws(() => parseOtpVerificationRequest({ phone: '9876543210', code: '123' }));
});

test('Firebase session requests require a token and accept optional consent', () => {
  const tokenOnly = parseFirebaseSessionRequest({ idToken: 'header.payload.signature' });
  assert.equal(tokenOnly.idToken, 'header.payload.signature');
  assert.equal(tokenOnly.consent, null);

  const withConsent = parseFirebaseSessionRequest({
    idToken: 'header.payload.signature',
    consent: {
      adultConfirmed: true,
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion: 'terms-2026-10-01',
      privacyVersion: 'privacy-2026-10-01',
      fullName: 'A Person',
    },
  });
  assert.equal(withConsent.consent.analyticsOptIn, false);
  assert.equal(withConsent.consent.personalizedOffersOptIn, false);
  assert.equal(withConsent.consent.fullName, 'A Person');

  assert.throws(() => parseFirebaseSessionRequest({}), TypeError);
  assert.throws(() => parseFirebaseSessionRequest({ idToken: 'not-a-token' }), RangeError);
  assert.throws(() => parseFirebaseSessionRequest({ idToken: 'a.b.c', userId: 'chosen-by-attacker' }), TypeError);
});

test('consent requires adult confirmation and the exact published policy versions', () => {
  const base = {
    adultConfirmed: true,
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: 'terms-2026-10-01',
    privacyVersion: 'privacy-2026-10-01',
  };

  assert.deepEqual(parseConsentInput(base), {
    ...base,
    analyticsOptIn: false,
    personalizedOffersOptIn: false,
    fullName: undefined,
  });
  assert.equal(parseConsentInput(undefined, { required: false }), null);
  assert.throws(() => parseConsentInput(undefined), TypeError);
  assert.throws(() => parseConsentInput({ ...base, adultConfirmed: false }), RangeError);
  assert.throws(() => parseConsentInput({ ...base, termsAccepted: false }), RangeError);
  assert.throws(() => parseConsentInput({ ...base, termsVersion: '' }), RangeError);
  assert.throws(() => parseConsentInput({ ...base, analyticsOptIn: 'yes' }), TypeError);
});

test('Firebase phone verification accepts an optional normalized Indian phone', () => {
  assert.deepEqual(parseFirebasePhoneVerificationRequest({ idToken: 'a.b.c' }), { idToken: 'a.b.c', phone: null });
  assert.deepEqual(
    parseFirebasePhoneVerificationRequest({ idToken: 'a.b.c', phone: '98765 43210' }),
    { idToken: 'a.b.c', phone: '+919876543210' },
  );
  assert.throws(() => parseFirebasePhoneVerificationRequest({ idToken: 'a.b.c', phone: '12345' }), RangeError);
  assert.throws(() => parseFirebasePhoneVerificationRequest({ phone: '+919876543210' }), TypeError);
});

test('cash withdrawal request requires idempotency and rejects client identity/status', () => {
  assert.deepEqual(parseCashWithdrawalRequest({
    amount: 500,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_123456',
  }), {
    amount: 500,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_123456',
  });
  assert.throws(() => parseCashWithdrawalRequest({
    amount: 500,
    payoutType: 'upi',
    idempotencyKey: 'withdraw_request_123456',
    userId: 'another-user',
  }));
});