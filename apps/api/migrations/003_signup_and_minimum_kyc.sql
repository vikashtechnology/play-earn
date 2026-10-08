ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS minimum_kyc_verified_at TIMESTAMPTZ;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'account';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_subject
  ON users (google_subject)
  WHERE google_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_verification_challenges (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  code_hash BYTEA NOT NULL,
  link_token_hash BYTEA NOT NULL,
  terms_version VARCHAR(64) NOT NULL,
  privacy_version VARCHAR(64) NOT NULL,
  analytics_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  personalized_offers_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  request_ip_hash BYTEA,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_verification_email_created
  ON email_verification_challenges (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_ip_created
  ON email_verification_challenges (request_ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS google_login_nonces (
  nonce_hash BYTEA PRIMARY KEY,
  request_ip_hash BYTEA,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(64) NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_type
  ON user_consents (user_id, consent_type, granted_at DESC);

CREATE TABLE IF NOT EXISTS payout_kyc_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(16) NOT NULL CHECK (method IN ('upi', 'bank')),
  status VARCHAR(32) NOT NULL CHECK (status IN ('pending', 'verified', 'rejected')),
  provider_reference VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_kyc_user_status
  ON payout_kyc_checks (user_id, status, created_at DESC);