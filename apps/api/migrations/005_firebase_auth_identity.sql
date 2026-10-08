-- Firebase Auth becomes the only identity provider. Users are keyed by their
-- Firebase UID; the API never stores Firebase secrets, only the public UID and
-- verified profile claims.
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sign_in_provider VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS adult_self_declared_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_revoked_before TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid
  ON users (firebase_uid)
  WHERE firebase_uid IS NOT NULL;

-- users.phone already carries a UNIQUE constraint (and therefore an index) from
-- migration 001, so no extra phone index is needed. PostgreSQL allows multiple
-- NULLs in a unique column, which is what accounts without a phone rely on.

-- Append-only authentication audit trail. Every Firebase token exchange,
-- rejection, Minimum-KYC verification, and session revocation is recorded so
-- fraud review and support can reconstruct what happened without storing raw
-- IP addresses or user agents.
CREATE TABLE IF NOT EXISTS firebase_auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  firebase_uid VARCHAR(128),
  event_type VARCHAR(48) NOT NULL,
  sign_in_provider VARCHAR(64),
  auth_time TIMESTAMPTZ,
  outcome VARCHAR(32) NOT NULL DEFAULT 'success',
  reason VARCHAR(64),
  request_ip_hash BYTEA,
  user_agent_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_firebase_auth_events_uid_created
  ON firebase_auth_events (firebase_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_firebase_auth_events_user_created
  ON firebase_auth_events (user_id, created_at DESC);

-- Fraud signal: many rejected sign-ins from one network in a short window.
CREATE INDEX IF NOT EXISTS idx_firebase_auth_events_ip_created
  ON firebase_auth_events (request_ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_firebase_auth_events_outcome
  ON firebase_auth_events (outcome, created_at DESC);

-- Retention: authentication events are kept for 18 months, then pruned by the
-- reconciliation job.
CREATE INDEX IF NOT EXISTS idx_firebase_auth_events_created
  ON firebase_auth_events (created_at);

-- The Supabase Auth integration is removed. Its identity columns and the
-- provider-owned email challenge / Google nonce tables are dropped because
-- Firebase now owns email verification, Google sign-in, and phone verification.
ALTER TABLE users DROP COLUMN IF EXISTS supabase_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS supabase_phone_user_id;
DROP INDEX IF EXISTS idx_users_supabase_user_id;
DROP INDEX IF EXISTS idx_users_supabase_phone_user_id;
DROP TABLE IF EXISTS google_login_nonces;
DROP TABLE IF EXISTS email_verification_challenges;
