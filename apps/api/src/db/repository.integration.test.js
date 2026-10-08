// Repository-level integration tests that run against pg-mem, an in-memory
// PostgreSQL emulator. They exist because the domain tests use fake
// repositories, so SQL regressions (column names, constraint handling, conflict
// paths) would otherwise only surface against a live Neon database.
//
// pg-mem implements a subset of PostgreSQL, so a few built-ins are registered
// here and one emulator-only limitation is worked around. `scripts/smoke-identity.js`
// against real Neon remains the authoritative pre-launch check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DataType, newDb } from 'pg-mem';

import { createIdentityRepository } from './identityRepository.js';
import { createOfferRepository } from './offerRepository.js';
import { createWalletRepository, EMPTY_BALANCE_SUMMARY } from './walletRepository.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

const CONSENT = {
  adultConfirmed: true,
  termsAccepted: true,
  privacyAccepted: true,
  analyticsOptIn: false,
  personalizedOffersOptIn: true,
  termsVersion: 'terms-2026-10-01',
  privacyVersion: 'privacy-2026-10-01',
};

function googleIdentity(overrides = {}) {
  return {
    uid: 'firebase-uid-google',
    email: 'player@example.com',
    emailVerified: true,
    phoneNumber: null,
    phoneVerified: false,
    displayName: 'Test Player',
    photoUrl: null,
    signInProvider: 'google.com',
    authTime: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// Builds a database with every migration applied and returns a pg-compatible pool.
function createTestDatabase() {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  // PostgreSQL built-ins that pg-mem does not implement.
  db.public.registerFunction({
    name: 'gen_random_uuid', returns: DataType.uuid, implementation: () => randomUUID(), impure: true,
  });
  db.public.registerFunction({
    name: 'hashtext',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value) => createHash('sha256').update(String(value ?? '')).digest().readInt32BE(0),
    impure: true,
  });
  for (const type of [DataType.integer, DataType.bigint]) {
    db.public.registerFunction({
      name: 'pg_advisory_xact_lock', args: [type], returns: DataType.null, implementation: () => null,
    });
  }
  for (const type of [DataType.integer, DataType.bigint, DataType.float, DataType.decimal]) {
    db.public.registerFunction({ name: 'abs', args: [type], returns: type, implementation: (value) => Math.abs(Number(value)) });
  }
  db.public.registerFunction({
    name: 'split_part',
    args: [DataType.text, DataType.text, DataType.integer],
    returns: DataType.text,
    implementation: (value, delimiter, index) => String(value ?? '').split(delimiter)[Number(index) - 1] ?? '',
  });

  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    // pg-mem has no extension system; gen_random_uuid is registered above.
    const sql = readFileSync(join(migrationsDir, file), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/gi, '');
    db.public.none(sql);
  }

  // Emulator limitation only: pg-mem unique indexes reject NULL, while real
  // PostgreSQL allows many NULLs in a UNIQUE column. users.phone relies on that.
  db.public.none('ALTER TABLE users DROP CONSTRAINT users_phone_key');

  const { Pool } = db.adapters.createPg();
  return { db, pool: new Pool() };
}

test('every migration applies in order', () => {
  const { pool } = createTestDatabase();
  assert.ok(pool, 'migrations 001-005 applied without error');
});

test('Firebase sign-in provisions the account, wallet, and consents', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);

  const created = await identity.upsertFirebaseUser(googleIdentity(), CONSENT);
  assert.equal(created.created, true);
  assert.ok(created.id);
  assert.equal(created.email, 'player@example.com');
  assert.ok(created.email_verified_at, 'a verified email claim sets email_verified_at');

  const wallets = await pool.query('SELECT balance, currency_code, status FROM wallets WHERE user_id = $1', [created.id]);
  assert.equal(wallets.rowCount, 1);
  assert.equal(Number(wallets.rows[0].balance), 0);
  assert.equal(wallets.rows[0].currency_code, 'INR');

  const consents = await pool.query(
    'SELECT consent_type, granted, policy_version FROM user_consents WHERE user_id = $1 ORDER BY consent_type',
    [created.id],
  );
  assert.deepEqual(
    consents.rows.map((row) => row.consent_type),
    ['adult_self_declaration', 'analytics', 'personalized_offers', 'privacy_notice', 'terms'],
  );
  assert.equal(consents.rows.find((row) => row.consent_type === 'analytics').granted, false, 'opt-out is stored, not assumed');
  assert.equal(consents.rows.find((row) => row.consent_type === 'personalized_offers').granted, true);

  const audits = await pool.query("SELECT action FROM audit_logs WHERE user_id = $1", [created.id]);
  assert.deepEqual(audits.rows.map((row) => row.action), ['user_provisioned']);

  // Returning sign-in is idempotent. A name the user already has is kept, so a
  // Firebase profile change cannot silently rewrite it.
  const returning = await identity.upsertFirebaseUser(googleIdentity({ displayName: 'Asha Verma' }));
  assert.equal(returning.created, false);
  assert.equal(returning.id, created.id);
  assert.equal(returning.full_name, 'Test Player');

  // A placeholder name derived from the email is upgraded once Firebase knows
  // the real one.
  const placeholder = await identity.upsertFirebaseUser(googleIdentity({
    uid: 'firebase-uid-placeholder', email: 'placeholder@example.com', displayName: null,
  }), CONSENT);
  assert.equal(placeholder.full_name, 'placeholder');

  const upgraded = await identity.upsertFirebaseUser(googleIdentity({
    uid: 'firebase-uid-placeholder', email: 'placeholder@example.com', displayName: 'Asha Verma',
  }));
  assert.equal(upgraded.full_name, 'Asha Verma');

  const count = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  assert.equal(count.rows[0].count, 2);
});

test('email and phone remain unique across Firebase accounts', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);

  const owner = await identity.upsertFirebaseUser(googleIdentity(), CONSENT);
  assert.equal(owner.created, true);

  const phoneOwner = await identity.upsertFirebaseUser(
    googleIdentity({
      uid: 'firebase-uid-phone', email: 'phone@example.com',
      phoneNumber: '+919876543210', phoneVerified: true, signInProvider: 'phone.com',
    }),
    CONSENT,
  );
  assert.equal(phoneOwner.created, true);
  assert.ok(phoneOwner.phone_verified_at);

  // Another Firebase UID may not take over an existing email.
  assert.deepEqual(
    await identity.upsertFirebaseUser(googleIdentity({ uid: 'firebase-uid-evil' }), CONSENT),
    { conflict: 'email_already_linked', created: false },
  );

  // Nor may it take over an existing phone, at signup or on refresh.
  assert.deepEqual(
    await identity.upsertFirebaseUser(googleIdentity({
      uid: 'firebase-uid-thief', email: 'thief@example.com',
      phoneNumber: '+919876543210', phoneVerified: true, signInProvider: 'password',
    }), CONSENT),
    { conflict: 'phone_already_linked', created: false },
  );
  assert.deepEqual(
    await identity.upsertFirebaseUser(googleIdentity({ phoneNumber: '+919876543210', phoneVerified: true })),
    { conflict: 'phone_already_linked', created: false },
  );

  // The rightful owner keeps working.
  const refresh = await identity.upsertFirebaseUser(googleIdentity({
    uid: 'firebase-uid-phone', email: 'phone@example.com',
    phoneNumber: '+919876543210', phoneVerified: true, signInProvider: 'phone.com',
  }));
  assert.equal(refresh.created, false);
  assert.equal(refresh.id, phoneOwner.id);

  const users = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  assert.equal(users.rows[0].count, 2, 'no extra rows were created by the rejected attempts');
});

test('an unverified contact claim never marks the account verified', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);

  const created = await identity.upsertFirebaseUser(googleIdentity({
    uid: 'firebase-uid-unverified', email: 'unverified@example.com', emailVerified: false,
    phoneNumber: '+919876540000', phoneVerified: false,
  }), CONSENT);

  assert.equal(created.created, true);
  assert.equal(created.email_verified_at, null);
  assert.equal(created.phone_verified_at, null);
});

test('a new Firebase account requires consent', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);

  assert.deepEqual(
    await identity.upsertFirebaseUser(googleIdentity({ uid: 'firebase-uid-new', email: 'new@example.com' })),
    { conflict: 'consent_required', created: false },
  );

  const users = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  assert.equal(users.rows[0].count, 0);
});

test('Minimum KYC binds one phone to one account transactionally', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);

  const first = await identity.upsertFirebaseUser(googleIdentity(), CONSENT);
  const second = await identity.upsertFirebaseUser(
    googleIdentity({ uid: 'firebase-uid-phone', email: 'phone@example.com', phoneNumber: '+919876543210', phoneVerified: true }),
    CONSENT,
  );

  assert.equal(
    await identity.markMinimumKycVerified(first.id, '+919876543210', googleIdentity().uid),
    false,
    'a phone owned by another account cannot be reused',
  );

  assert.equal(
    await identity.markMinimumKycVerified(first.id, '+919000000001', googleIdentity().uid),
    true,
  );

  const eligibility = await identity.findPayoutEligibility(first.id);
  assert.equal(eligibility.minimumKycVerified, true);
  assert.equal(eligibility.phoneVerified, true);
  assert.equal(eligibility.status, 'active');

  const audits = await pool.query("SELECT action, details FROM audit_logs WHERE user_id = $1 ORDER BY action", [first.id]);
  assert.deepEqual(audits.rows.map((row) => row.action), ['minimum_kyc_verified', 'user_provisioned']);

  // A Firebase phone verification is Minimum KYC, not a provider UPI/bank check.
  const kycChecks = await pool.query('SELECT COUNT(*)::int AS count FROM payout_kyc_checks WHERE user_id = $1', [first.id]);
  assert.equal(kycChecks.rows[0].count, 0);
  assert.ok(second.id);
});

test('session revocation persists a watermark and auth events are audited', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);
  const user = await identity.upsertFirebaseUser(googleIdentity(), CONSENT);
  const ipHash = createHash('sha256').update('203.0.113.7').digest('hex');

  await identity.recordAuthEvent({
    userId: user.id, firebaseUid: googleIdentity().uid, eventType: 'session_exchange',
    signInProvider: 'google.com', authTime: Math.floor(Date.now() / 1000),
    outcome: 'success', requestIpHash: ipHash,
  });
  await identity.recordAuthEvent({
    firebaseUid: googleIdentity().uid, eventType: 'session_exchange', outcome: 'rejected',
    reason: 'unsupported_provider', requestIpHash: ipHash,
  });

  assert.equal(await identity.countRecentAuthEvents({ firebaseUid: googleIdentity().uid, minutes: 15 }), 2);
  assert.equal(await identity.countRecentAuthEvents({ requestIpHash: ipHash, minutes: 15, outcome: 'rejected' }), 1);
  assert.equal(await identity.countRecentAuthEvents({ userId: user.id, minutes: 15, outcome: 'success' }), 1);

  assert.equal(await identity.revokeSessionsBefore(user.id, new Date()), true);
  const revoked = await identity.findPayoutEligibility(user.id);
  assert.ok(revoked.tokensRevokedBefore instanceof Date);

  assert.equal(await identity.pruneAuthEvents(540), 0, 'recent events are retained');
  assert.equal(await identity.pruneAuthEvents(-1), 2, 'expired events are pruned');
});

test('wallet balances separate AdMob coins from redeemable coins', async () => {
  const { pool } = createTestDatabase();
  const identity = createIdentityRepository(pool);
  const wallets = createWalletRepository(pool);
  const user = await identity.upsertFirebaseUser(googleIdentity(), CONSENT);

  assert.deepEqual(await wallets.getBalanceSummary(user.id), {
    ...EMPTY_BALANCE_SUMMARY, hasWallet: true, walletStatus: 'active',
  });
  assert.deepEqual(await wallets.getBalanceSummary(randomUUID()), { ...EMPTY_BALANCE_SUMMARY });

  const walletId = (await pool.query('SELECT id FROM wallets WHERE user_id = $1', [user.id])).rows[0].id;
  const ledger = [
    ['reward', 'credit', 250, 'offer_completed', 'offer', 'offer-1', 'completed'],
    ['reward', 'credit', 40, 'survey_completed', 'survey', 'survey-1', 'pending'],
    ['ad_reward', 'credit', 60, 'rewarded_ad', 'admob', 'ad-1', 'completed'],
    ['redemption', 'debit', 15, 'checkout_reserve', 'order', 'order-1', 'reserved'],
    ['reward', 'debit', 5, 'fraud_reversal', 'offer', 'offer-2', 'reversed'],
  ];
  for (const [type, direction, amount, reason, sourceType, sourceId, status] of ledger) {
    await pool.query(
      `INSERT INTO wallet_transactions
         (id, wallet_id, type, direction, amount, currency_code, reason, source_type, source_id, status)
       VALUES ($1, $2, $3, $4, $5, 'INR', $6, $7, $8, $9)`,
      [randomUUID(), walletId, type, direction, amount, reason, sourceType, sourceId, status],
    );
  }

  const summary = await wallets.getBalanceSummary(user.id);
  assert.equal(summary.availableCoins, 250);
  assert.equal(summary.pendingCoins, 40);
  assert.equal(summary.adMobInAppCoins, 60, 'AdMob coins are reported separately and never mixed into cash');
  assert.equal(summary.reservedCoins, 15);
  assert.equal(summary.reversedCoins, 5);

  const transactions = await wallets.listTransactions(user.id, { limit: 3 });
  assert.equal(transactions.length, 3);
  assert.ok(transactions.every((row) => Number.isFinite(row.amount)));
});

test('offer reads only expose active Play-Store-only install offers', async () => {
  const { pool } = createTestDatabase();
  const offers = createOfferRepository(pool);

  const rows = [
    ['Approved install', 'install', 'active', 200, 'https://play.google.com/store/apps/details?id=com.example.partner'],
    ['Sideload install', 'install', 'active', 500, 'https://example.test/app.apk'],
    ['Survey', 'survey', 'active', 120, null],
    ['Draft survey', 'survey', 'draft', 900, null],
    ['Expired install', 'install', 'expired', 700, 'https://play.google.com/store/apps/details?id=com.example.old'],
  ];
  const ids = [];
  for (const [title, kind, status, coins, landingUrl] of rows) {
    const id = randomUUID();
    ids.push({ id, title });
    await pool.query(
      `INSERT INTO offers
         (id, provider, title, description, kind, status, payout_coins, country_code, landing_url, verification_mode)
       VALUES ($1, 'partner', $2, 'Test offer', $3, $4, $5, 'IN', $6, 'server')`,
      [id, title, kind, status, coins, landingUrl],
    );
  }

  const active = await offers.listActiveOffers({ limit: 10 });
  assert.deepEqual(active.map((offer) => offer.title), ['Approved install', 'Survey']);
  assert.equal(active[0].rewardCoins, 200);
  assert.equal(active[0].installTarget, 'google_play');

  const found = await offers.findById(ids.find((row) => row.title === 'Survey').id);
  assert.equal(found?.title, 'Survey');
  assert.equal(await offers.findById(ids.find((row) => row.title === 'Sideload install').id), null, 'sideloads are never served');
});
