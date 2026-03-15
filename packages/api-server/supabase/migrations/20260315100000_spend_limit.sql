-- T19: Per-Key Spend Limit
-- 為 api_keys 表新增花費上限與累計花費欄位

-- =============================================================================
-- Schema changes
-- =============================================================================

ALTER TABLE api_keys
  ADD COLUMN spend_limit_usd INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN spent_usd INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN api_keys.spend_limit_usd IS '花費上限（美分）。-1 = 無限制。';
COMMENT ON COLUMN api_keys.spent_usd IS '累計已消費（美分）。';

-- =============================================================================
-- RPC Functions
-- =============================================================================

-- check_spend_limit: 檢查 key 是否仍在花費上限內
-- 回傳 TRUE = 可繼續請求；FALSE = 已超限
CREATE OR REPLACE FUNCTION check_spend_limit(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN spend_limit_usd = -1 THEN TRUE
      WHEN spent_usd < spend_limit_usd THEN TRUE
      ELSE FALSE
    END
  FROM api_keys
  WHERE id = p_key_id;
$$;

-- record_spend: 原子累加已消費金額
-- p_amount_cents: 本次花費（美分，必須 >= 0）
CREATE OR REPLACE FUNCTION record_spend(p_key_id UUID, p_amount_cents INTEGER)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE api_keys
  SET spent_usd = spent_usd + p_amount_cents
  WHERE id = p_key_id;
$$;
