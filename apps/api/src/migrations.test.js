import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(import.meta.dirname, '../migrations/001_init_schema.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const otpMigrationPath = path.resolve(import.meta.dirname, '../migrations/002_otp_challenges.sql');
const otpSql = fs.readFileSync(otpMigrationPath, 'utf8');
const identityMigrationPath = path.resolve(import.meta.dirname, '../migrations/003_signup_and_minimum_kyc.sql');
const identitySql = fs.readFileSync(identityMigrationPath, 'utf8');
const firebaseMigrationPath = path.resolve(import.meta.dirname, '../migrations/005_firebase_auth_identity.sql');
const firebaseSql = fs.readFileSync(firebaseMigrationPath, 'utf8');

const requiredTables = [
  'users',
  'wallets',
  'wallet_transactions',
  'offers',
  'offer_events',
  'referrals',
  'withdrawals',
  'reward_products',
  'orders',
  'audit_logs',
];

test('migration schema includes core reward marketplace tables', () => {
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, 'i'));
  }
});

test('migration defines audit and wallet ledger foundation', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS wallet_transactions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS audit_logs/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS withdrawals/i);
});

test('OTP migration stores only hashes and bounds verification attempts', () => {
  assert.match(otpSql, /phone_hash BYTEA NOT NULL/i);
  assert.match(otpSql, /code_hash BYTEA NOT NULL/i);
  assert.match(otpSql, /attempts BETWEEN 0 AND 5/i);
  assert.match(otpSql, /consumed_at TIMESTAMPTZ/i);
});

test('identity migration supports email/Google signup, versioned consent, and phone Minimum KYC', () => {
  assert.match(identitySql, /ALTER TABLE users ALTER COLUMN phone DROP NOT NULL/i);
  assert.match(identitySql, /google_subject TEXT/i);
  assert.match(identitySql, /email_verified_at TIMESTAMPTZ/i);
  assert.match(identitySql, /CREATE TABLE IF NOT EXISTS user_consents/i);
  assert.match(identitySql, /minimum_kyc_verified_at TIMESTAMPTZ/i);
  assert.match(identitySql, /CREATE TABLE IF NOT EXISTS google_login_nonces/i);
});

test('Firebase migration keys accounts by Firebase UID and audits every sign-in', () => {
  assert.match(firebaseSql, /ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR\(128\)/i);
  assert.match(firebaseSql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid/i);
  assert.match(firebaseSql, /CREATE TABLE IF NOT EXISTS firebase_auth_events/i);
  assert.match(firebaseSql, /request_ip_hash BYTEA/i, 'IPs must be stored hashed only');
  assert.match(firebaseSql, /ADD COLUMN IF NOT EXISTS tokens_revoked_before TIMESTAMPTZ/i);
  assert.match(firebaseSql, /ADD COLUMN IF NOT EXISTS adult_self_declared_at TIMESTAMPTZ/i);
  assert.match(firebaseSql, /outcome VARCHAR\(32\) NOT NULL DEFAULT 'success'/i);
});

test('Firebase migration removes the retired Supabase identity storage', () => {
  assert.match(firebaseSql, /DROP COLUMN IF EXISTS supabase_user_id/i);
  assert.match(firebaseSql, /DROP COLUMN IF EXISTS supabase_phone_user_id/i);
  assert.match(firebaseSql, /DROP TABLE IF EXISTS google_login_nonces/i);
  assert.match(firebaseSql, /DROP TABLE IF EXISTS email_verification_challenges/i);
});

test('migration files are applied in a deterministic order', () => {
  const files = fs.readdirSync(path.resolve(import.meta.dirname, '../migrations')).filter((f) => f.endsWith('.sql')).sort();

  assert.deepEqual(files, [
    '001_init_schema.sql',
    '002_otp_challenges.sql',
    '003_signup_and_minimum_kyc.sql',
    '004_supabase_auth_identity.sql',
    '005_firebase_auth_identity.sql',
  ]);
});
