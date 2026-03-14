-- T02: Supabase DB Schema + RLS + user_quotas
-- Apiex Platform initial schema migration

-- =============================================================================
-- Tables
-- =============================================================================

-- api_keys: 使用者的 API 金鑰，key_hash 儲存雜湊後的金鑰值
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  quota_tokens BIGINT NOT NULL DEFAULT -1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uk_api_keys_key_hash UNIQUE (key_hash)
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- user_quotas: 每位使用者的預設 token 配額
CREATE TABLE user_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  default_quota_tokens BIGINT NOT NULL DEFAULT -1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- usage_logs: API 呼叫的用量紀錄
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id),
  model_tag TEXT NOT NULL,
  upstream_model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'incomplete', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_api_key_id ON usage_logs(api_key_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);

-- route_config: 模型路由設定，tag 對應上游 provider/model
CREATE TABLE route_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL,
  upstream_provider TEXT NOT NULL,
  upstream_model TEXT NOT NULL,
  upstream_base_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_route_config_tag_active ON route_config(tag) WHERE is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- api_keys RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- user_quotas RLS
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quota"
  ON user_quotas FOR SELECT
  USING (auth.uid() = user_id);

-- usage_logs RLS
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON usage_logs FOR SELECT
  USING (api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));

-- route_config RLS
ALTER TABLE route_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read routes"
  ON route_config FOR SELECT
  USING (true);

-- =============================================================================
-- Seed Data
-- =============================================================================

INSERT INTO route_config (tag, upstream_provider, upstream_model, upstream_base_url) VALUES
  ('apex-smart', 'anthropic', 'claude-opus-4-6', 'https://api.anthropic.com/v1'),
  ('apex-cheap', 'google', 'gemini-2.0-flash', 'https://generativelanguage.googleapis.com/v1beta/openai');
