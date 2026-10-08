CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY,
  phone_hash BYTEA NOT NULL,
  code_hash BYTEA NOT NULL,
  request_ip_hash BYTEA,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone_created
  ON otp_challenges (phone_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_ip_created
  ON otp_challenges (request_ip_hash, created_at DESC);
