-- Migration: 009_spend_limit
-- Adds per-key spend limit tracking columns and supporting SQL functions

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS spend_limit_usd INTEGER NOT NULL DEFAULT -1;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS spent_usd INTEGER NOT NULL DEFAULT 0;

-- record_spend: atomically add p_amount_cents to spent_usd for the given key
CREATE OR REPLACE FUNCTION record_spend(p_key_id UUID, p_amount_cents INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET spent_usd = spent_usd + p_amount_cents
  WHERE id = p_key_id;
END;
$$;

-- reset_spend: reset spent_usd to 0 for the given key
CREATE OR REPLACE FUNCTION reset_spend(p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET spent_usd = 0
  WHERE id = p_key_id;
END;
$$;

-- check_spend_limit: returns TRUE if the key is within its spend limit
-- (either limit is -1/unlimited, or spent_usd < spend_limit_usd)
-- Returns FALSE if the key is at or over its limit, or if the key does not exist.
CREATE OR REPLACE FUNCTION check_spend_limit(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_spend_limit INTEGER;
  v_spent       INTEGER;
BEGIN
  SELECT spend_limit_usd, spent_usd
  INTO v_spend_limit, v_spent
  FROM api_keys
  WHERE id = p_key_id;

  -- Key not found
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Unlimited
  IF v_spend_limit = -1 THEN
    RETURN TRUE;
  END IF;

  RETURN v_spent < v_spend_limit;
END;
$$;
