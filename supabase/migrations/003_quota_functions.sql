-- Migration: 003_quota_functions
-- PostgreSQL functions for atomic quota operations (SR-P0-001: 樂觀預扣機制)

-- reserveQuota: Atomically deduct estimated tokens
-- Returns remaining quota_tokens if successful, NULL if insufficient
CREATE OR REPLACE FUNCTION reserve_quota(p_key_id UUID, p_estimated BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining BIGINT;
BEGIN
  UPDATE api_keys
  SET quota_tokens = quota_tokens - p_estimated
  WHERE id = p_key_id
    AND (quota_tokens >= p_estimated OR quota_tokens = -1)
  RETURNING quota_tokens INTO v_remaining;

  RETURN v_remaining;  -- NULL if no rows updated (insufficient quota)
END;
$$;

-- settleQuota: Settle the difference between reserved and actual tokens
-- Positive diff = refund, negative diff = charge more
-- Skips keys with quota_tokens = -1 (unlimited)
CREATE OR REPLACE FUNCTION settle_quota(p_key_id UUID, p_diff BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET quota_tokens = quota_tokens + p_diff
  WHERE id = p_key_id
    AND quota_tokens != -1;
END;
$$;
