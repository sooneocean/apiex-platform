-- Migration: 005_add_topup_quota
-- Atomic quota increment for topup (P0-1 fix: must ADD not SET)

-- add_topup_quota: Atomically increment quota_tokens for a user
-- 1. UPSERT user_quotas (increment default_quota_tokens)
-- 2. UPDATE all active api_keys (increment quota_tokens, skip unlimited=-1)
CREATE OR REPLACE FUNCTION add_topup_quota(p_user_id UUID, p_tokens BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. UPSERT user_quotas: increment default_quota_tokens
  INSERT INTO user_quotas (user_id, default_quota_tokens, updated_at)
  VALUES (p_user_id, p_tokens, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    default_quota_tokens = user_quotas.default_quota_tokens + p_tokens,
    updated_at = now();

  -- 2. UPDATE api_keys: add tokens to all active keys with finite quota
  UPDATE api_keys
  SET quota_tokens = quota_tokens + p_tokens
  WHERE user_id = p_user_id
    AND status = 'active'
    AND quota_tokens != -1;
END;
$$;
