import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWalletTransaction,
  buildWalletSnapshot,
  createWalletState,
} from './wallet.js';

test('credit transaction increases wallet balance', () => {
  const wallet = createWalletState({ balance: 1000 });

  const next = applyWalletTransaction(wallet, {
    direction: 'credit',
    amount: 250,
    type: 'reward',
    reason: 'offer_completion',
    sourceType: 'offer',
    sourceId: 'offer-1',
  });

  assert.equal(next.balance, 1250);
  assert.equal(next.transactions.length, 1);
  assert.equal(next.transactions[0].status, 'pending');
});

test('debit transaction reduces wallet balance when sufficient funds exist', () => {
  const wallet = createWalletState({ balance: 1200 });

  const next = applyWalletTransaction(wallet, {
    direction: 'debit',
    amount: 400,
    type: 'withdrawal',
    reason: 'payout_request',
    sourceType: 'withdrawal',
    sourceId: 'withdrawal-1',
  });

  assert.equal(next.balance, 800);
});

test('debit transaction fails when balance is insufficient', () => {
  const wallet = createWalletState({ balance: 300 });

  assert.throws(() => {
    applyWalletTransaction(wallet, {
      direction: 'debit',
      amount: 401,
      type: 'withdrawal',
      reason: 'payout_request',
      sourceType: 'withdrawal',
      sourceId: 'withdrawal-2',
    });
  }, /insufficient funds/i);
});

test('snapshot builds derived balance from immutable ledger entries', () => {
  const snapshot = buildWalletSnapshot([
    { direction: 'credit', amount: 100 },
    { direction: 'credit', amount: 50 },
    { direction: 'debit', amount: 25 },
  ]);

  assert.equal(snapshot.balance, 125);
  assert.equal(snapshot.transactions.length, 3);
});
