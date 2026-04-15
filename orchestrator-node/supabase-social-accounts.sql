-- Social Accounts Table
-- Stores Facebook/Instagram OAuth tokens for programmatic API access.
-- Tokens are obtained once via the Facebook SDK login flow and then
-- refreshed server-side as needed.

CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,                   -- 'facebook' | 'instagram'
  platform_user_id TEXT NOT NULL,           -- Facebook/IG numeric user ID
  username TEXT,
  display_name TEXT,
  profile_image_url TEXT,
  access_token TEXT NOT NULL,               -- short-lived or long-lived token
  token_expires_at TIMESTAMPTZ,             -- when the access_token expires
  scopes TEXT[] DEFAULT '{}',               -- granted permission scopes
  page_id TEXT,                             -- Facebook Page ID (for page publishing)
  page_access_token TEXT,                   -- long-lived page token (never expires)
  ig_business_account_id TEXT,              -- Instagram Business Account ID
  raw_auth_response JSONB DEFAULT '{}'::jsonb,  -- full FB authResponse for debugging
  status TEXT DEFAULT 'connected',          -- connected | expired | disconnected
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON social_accounts
  FOR ALL USING (true);

CREATE INDEX idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX idx_social_accounts_status ON social_accounts(status);

CREATE TRIGGER update_social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
