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
  ('apex-smart', 'anthropic', 'claude-opus-4-6', 'https://api.anthropic.com'),
  ('apex-cheap', 'google', 'gemini-2.0-flash', 'https://generativelanguage.googleapis.com/v1beta/openai');

-- =============================================================================
-- SQL Functions (RPC)
-- =============================================================================

-- reserve_quota: 原子預扣額度
-- quota_tokens = -1 表示無限額度，不扣也不返回 -1
-- 回傳預扣後剩餘額度，無符合條件的行則回傳 NULL（表示額度不足）
CREATE OR REPLACE FUNCTION reserve_quota(p_key_id UUID, p_estimated BIGINT)
RETURNS BIGINT
LANGUAGE sql
AS $$
  UPDATE api_keys
  SET quota_tokens = CASE
    WHEN quota_tokens = -1 THEN -1
    ELSE quota_tokens - p_estimated
  END
  WHERE id = p_key_id
    AND (quota_tokens >= p_estimated OR quota_tokens = -1)
  RETURNING quota_tokens;
$$;

-- settle_quota: 結算差額（退還多預扣或補扣不足）
-- p_diff = reserved - actual（正數退回，負數補扣）
-- quota_tokens = -1 的 key 自動跳過
CREATE OR REPLACE FUNCTION settle_quota(p_key_id UUID, p_diff BIGINT)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE api_keys
  SET quota_tokens = quota_tokens + p_diff
  WHERE id = p_key_id
    AND quota_tokens != -1;
$$;

-- admin_list_users: 管理員查詢用戶列表（含 key 數量、用量統計、配額）
CREATE OR REPLACE FUNCTION admin_list_users(p_offset INTEGER, p_limit INTEGER)
RETURNS TABLE (
  id UUID,
  email TEXT,
  key_count BIGINT,
  total_tokens_used BIGINT,
  quota_tokens BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(k.key_count, 0) AS key_count,
    COALESCE(ul.total_tokens_used, 0) AS total_tokens_used,
    COALESCE(uq.default_quota_tokens, -1) AS quota_tokens,
    u.created_at
  FROM auth.users u
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS key_count
    FROM api_keys WHERE status = 'active'
    GROUP BY user_id
  ) k ON k.user_id = u.id
  LEFT JOIN (
    SELECT ak.user_id, SUM(ul.total_tokens) AS total_tokens_used
    FROM usage_logs ul
    JOIN api_keys ak ON ak.id = ul.api_key_id
    GROUP BY ak.user_id
  ) ul ON ul.user_id = u.id
  LEFT JOIN user_quotas uq ON uq.user_id = u.id
  ORDER BY u.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;
