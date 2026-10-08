ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_phone_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_user_id
  ON users (supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_phone_user_id
  ON users (supabase_phone_user_id)
  WHERE supabase_phone_user_id IS NOT NULL;

ALTER TABLE google_login_nonces ADD COLUMN IF NOT EXISTS terms_version VARCHAR(64);
ALTER TABLE google_login_nonces ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(64);
ALTER TABLE google_login_nonces ADD COLUMN IF NOT EXISTS analytics_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE google_login_nonces ADD COLUMN IF NOT EXISTS personalized_offers_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
