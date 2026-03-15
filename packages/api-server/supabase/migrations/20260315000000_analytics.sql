-- =============================================================================
-- Analytics Dashboard Migration
-- 建立時間：2026-03-15
-- 內容：model_rates 費率表、topup_logs 補建、複合索引、8 個 RPC functions
-- =============================================================================

-- =============================================================================
-- Tables
-- =============================================================================

-- model_rates：每個 model 的計費費率（支援歷史版本，以 effective_from 區分）
CREATE TABLE model_rates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_tag        TEXT        NOT NULL,
  input_rate_per_1k  NUMERIC(10,6) NOT NULL,
  output_rate_per_1k NUMERIC(10,6) NOT NULL,
  effective_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- topup_logs：用戶充值紀錄（IF NOT EXISTS，因為表可能已存在於 Supabase 雲端）
CREATE TABLE IF NOT EXISTS topup_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id),
  amount_usd     INTEGER     NOT NULL,   -- 單位：美分（cents），顯示時需除以 100
  tokens_granted BIGINT      NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- usage_logs 複合索引：加速 per-user 聚合查詢（需 JOIN api_keys.api_key_id）
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_created
  ON usage_logs (api_key_id, created_at DESC);

-- model_rates 複合索引：加速費率歷史查詢（依 model_tag 篩選 + effective_from 排序）
CREATE INDEX IF NOT EXISTS idx_model_rates_tag_effective
  ON model_rates (model_tag, effective_from DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE model_rates ENABLE ROW LEVEL SECURITY;

-- service role（後端）可完整 CRUD
CREATE POLICY "Service role can manage model_rates"
  ON model_rates
  USING (true)
  WITH CHECK (true);

-- topup_logs RLS（IF NOT EXISTS 的表可能已有 policy，跳過衝突）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'topup_logs'
      AND policyname = 'Service role can manage topup_logs'
  ) THEN
    ALTER TABLE topup_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Service role can manage topup_logs"
      ON topup_logs
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- =============================================================================
-- Helper：period TEXT → INTERVAL
-- =============================================================================

-- period_to_interval：將 '24h'/'7d'/'30d' 轉換為 INTERVAL
CREATE OR REPLACE FUNCTION period_to_interval(p_period TEXT)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_period
    WHEN '24h' THEN INTERVAL '24 hours'
    WHEN '7d'  THEN INTERVAL '7 days'
    WHEN '30d' THEN INTERVAL '30 days'
    ELSE INTERVAL '7 days'  -- 預設 7 天
  END;
$$;

-- period_to_trunc：依 period 決定時間截斷粒度（'24h' → 'hour'，其他 → 'day'）
CREATE OR REPLACE FUNCTION period_to_trunc(p_period TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_period
    WHEN '24h' THEN 'hour'
    ELSE 'day'
  END;
$$;

-- =============================================================================
-- RPC Functions（每個都設定 10 秒 statement_timeout）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. analytics_timeseries
--    用途：依時間桶彙總 token 用量，支援 per-user 或全平台模式
--    per-user：usage_logs 需 JOIN api_keys 以取得 user_id（usage_logs 無 user_id 欄位）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_timeseries(
  p_user_id  UUID,       -- NULL = 全平台模式（Admin 用）
  p_key_id   UUID,       -- NULL = 不篩選特定 key
  p_period   TEXT        -- '24h' | '7d' | '30d'
)
RETURNS TABLE (
  bucket       TIMESTAMPTZ,
  model_tag    TEXT,
  total_tokens BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  SELECT
    DATE_TRUNC(period_to_trunc(p_period), ul.created_at) AS bucket,
    ul.model_tag,
    SUM(ul.total_tokens)::BIGINT AS total_tokens
  FROM usage_logs ul
  JOIN api_keys ak ON ak.id = ul.api_key_id
  WHERE
    ul.created_at >= NOW() - period_to_interval(p_period)
    AND (p_user_id IS NULL OR ak.user_id = p_user_id)
    AND (p_key_id IS NULL OR ul.api_key_id = p_key_id)
  GROUP BY bucket, ul.model_tag
  ORDER BY bucket, ul.model_tag;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. analytics_model_breakdown
--    用途：依 model_tag 彙總 token 用量與請求數，供圓環圖使用
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_model_breakdown(
  p_user_id  UUID,       -- NULL = 全平台模式
  p_key_id   UUID,       -- NULL = 不篩選
  p_period   TEXT
)
RETURNS TABLE (
  model_tag      TEXT,
  total_tokens   BIGINT,
  request_count  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  SELECT
    ul.model_tag,
    SUM(ul.total_tokens)::BIGINT AS total_tokens,
    COUNT(*)::BIGINT AS request_count
  FROM usage_logs ul
  JOIN api_keys ak ON ak.id = ul.api_key_id
  WHERE
    ul.created_at >= NOW() - period_to_interval(p_period)
    AND (p_user_id IS NULL OR ak.user_id = p_user_id)
    AND (p_key_id IS NULL OR ul.api_key_id = p_key_id)
  GROUP BY ul.model_tag
  ORDER BY total_tokens DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. analytics_latency_percentile
--    用途：依時間桶計算各 model 的延遲百分位數（p50/p95/p99）
--    只計算 status='success' 的紀錄
--    p_model_tag 可選，NULL = 回傳所有 model
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_latency_percentile(
  p_user_id   UUID,      -- NULL = 全平台模式
  p_key_id    UUID,      -- NULL = 不篩選
  p_period    TEXT,
  p_model_tag TEXT       -- NULL = 所有 model
)
RETURNS TABLE (
  bucket     TIMESTAMPTZ,
  model_tag  TEXT,
  p50        NUMERIC,
  p95        NUMERIC,
  p99        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  SELECT
    DATE_TRUNC(period_to_trunc(p_period), ul.created_at) AS bucket,
    ul.model_tag,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ul.latency_ms)::NUMERIC AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ul.latency_ms)::NUMERIC AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ul.latency_ms)::NUMERIC AS p99
  FROM usage_logs ul
  JOIN api_keys ak ON ak.id = ul.api_key_id
  WHERE
    ul.created_at >= NOW() - period_to_interval(p_period)
    AND ul.status = 'success'
    AND (p_user_id IS NULL OR ak.user_id = p_user_id)
    AND (p_key_id IS NULL OR ul.api_key_id = p_key_id)
    AND (p_model_tag IS NULL OR ul.model_tag = p_model_tag)
  GROUP BY bucket, ul.model_tag
  ORDER BY bucket, ul.model_tag;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. analytics_billing_summary
--    用途：計算用戶帳單摘要，包含費用換算、充值紀錄、配額剩餘天數
--    注意：topup_logs.amount_usd 為美分（INTEGER），除以 100 轉美元
--    費用計算使用歷史費率（effective_from <= usage.created_at）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_billing_summary(
  p_user_id UUID
)
RETURNS TABLE (
  model_tag        TEXT,
  prompt_tokens    BIGINT,
  completion_tokens BIGINT,
  input_cost_usd   NUMERIC,
  output_cost_usd  NUMERIC,
  total_cost_usd   NUMERIC,
  rate_input       NUMERIC,
  rate_output      NUMERIC,
  -- 配額摘要（每列重複，前端取第一列或獨立查）
  total_quota_tokens     BIGINT,
  has_unlimited          BOOLEAN,
  daily_avg_7d           NUMERIC,
  -- 充值紀錄（最近 5 筆，JSON 陣列）
  recent_topups          JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  WITH
  -- 用戶所有 usage_logs（需 JOIN api_keys 取 user_id）
  user_usage AS (
    SELECT
      ul.model_tag,
      ul.prompt_tokens,
      ul.completion_tokens,
      ul.created_at
    FROM usage_logs ul
    JOIN api_keys ak ON ak.id = ul.api_key_id
    WHERE ak.user_id = p_user_id
  ),
  -- 依 model 彙總 all_time 用量
  usage_agg AS (
    SELECT
      model_tag,
      SUM(prompt_tokens)::BIGINT     AS prompt_tokens,
      SUM(completion_tokens)::BIGINT AS completion_tokens
    FROM user_usage
    GROUP BY model_tag
  ),
  -- 取每個 model 的有效歷史費率（以最新生效的費率為準）
  effective_rates AS (
    SELECT DISTINCT ON (model_tag)
      model_tag,
      input_rate_per_1k,
      output_rate_per_1k
    FROM model_rates
    ORDER BY model_tag, effective_from DESC
  ),
  -- 費用計算（prompt / 1000 * input_rate + completion / 1000 * output_rate）
  cost_calc AS (
    SELECT
      u.model_tag,
      u.prompt_tokens,
      u.completion_tokens,
      CASE WHEN r.input_rate_per_1k IS NOT NULL
        THEN (u.prompt_tokens::NUMERIC / 1000) * r.input_rate_per_1k
        ELSE NULL
      END AS input_cost_usd,
      CASE WHEN r.output_rate_per_1k IS NOT NULL
        THEN (u.completion_tokens::NUMERIC / 1000) * r.output_rate_per_1k
        ELSE NULL
      END AS output_cost_usd,
      r.input_rate_per_1k,
      r.output_rate_per_1k
    FROM usage_agg u
    LEFT JOIN effective_rates r ON r.model_tag = u.model_tag
  ),
  -- 配額統計（active keys；-1 表示無限制）
  quota_stats AS (
    SELECT
      SUM(CASE WHEN quota_tokens = -1 THEN 0 ELSE quota_tokens END)::BIGINT AS total_quota,
      BOOL_OR(quota_tokens = -1) AS has_unlimited
    FROM api_keys
    WHERE user_id = p_user_id AND status = 'active'
  ),
  -- 近 7 日日均消耗
  daily_avg AS (
    SELECT
      COALESCE(
        SUM(total_tokens)::NUMERIC / 7,
        0
      ) AS daily_avg_7d
    FROM usage_logs ul
    JOIN api_keys ak ON ak.id = ul.api_key_id
    WHERE ak.user_id = p_user_id
      AND ul.created_at >= NOW() - INTERVAL '7 days'
  ),
  -- 最近 5 筆充值紀錄（amount_usd 為美分，除以 100 轉美元後回傳）
  recent_topup_data AS (
    SELECT jsonb_agg(t ORDER BY t.created_at DESC) AS topups
    FROM (
      SELECT
        id::TEXT,
        (amount_usd::NUMERIC / 100) AS amount_usd,  -- 美分 → 美元
        tokens_granted,
        created_at
      FROM topup_logs
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT 5
    ) t
  )
  SELECT
    c.model_tag,
    c.prompt_tokens,
    c.completion_tokens,
    c.input_cost_usd,
    c.output_cost_usd,
    (COALESCE(c.input_cost_usd, 0) + COALESCE(c.output_cost_usd, 0)) AS total_cost_usd,
    c.input_rate_per_1k  AS rate_input,
    c.output_rate_per_1k AS rate_output,
    q.total_quota        AS total_quota_tokens,
    q.has_unlimited,
    d.daily_avg_7d,
    COALESCE(rt.topups, '[]'::JSONB) AS recent_topups
  FROM cost_calc c
  CROSS JOIN quota_stats q
  CROSS JOIN daily_avg d
  CROSS JOIN recent_topup_data rt;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. analytics_platform_overview
--    用途：全平台統計彙總（Admin 用），包含總 tokens、請求數、活躍用戶、總收入
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_platform_overview(
  p_period TEXT
)
RETURNS TABLE (
  total_tokens       BIGINT,
  total_requests     BIGINT,
  active_users       BIGINT,
  total_revenue_usd  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  WITH
  -- 期間內用量統計
  usage_stats AS (
    SELECT
      SUM(ul.total_tokens)::BIGINT AS total_tokens,
      COUNT(*)::BIGINT             AS total_requests,
      COUNT(DISTINCT ak.user_id)::BIGINT AS active_users
    FROM usage_logs ul
    JOIN api_keys ak ON ak.id = ul.api_key_id
    WHERE ul.created_at >= NOW() - period_to_interval(p_period)
  ),
  -- 期間內充值總收入（amount_usd 為美分，除以 100）
  revenue_stats AS (
    SELECT
      COALESCE(SUM(amount_usd::NUMERIC / 100), 0) AS total_revenue_usd
    FROM topup_logs
    WHERE created_at >= NOW() - period_to_interval(p_period)
      AND status = 'completed'
  )
  SELECT
    us.total_tokens,
    us.total_requests,
    us.active_users,
    rs.total_revenue_usd
  FROM usage_stats us
  CROSS JOIN revenue_stats rs;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. analytics_platform_timeseries
--    用途：全平台 token 用量時序（Admin Dashboard 趨勢圖用）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_platform_timeseries(
  p_period TEXT
)
RETURNS TABLE (
  bucket       TIMESTAMPTZ,
  model_tag    TEXT,
  total_tokens BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  SELECT
    DATE_TRUNC(period_to_trunc(p_period), ul.created_at) AS bucket,
    ul.model_tag,
    SUM(ul.total_tokens)::BIGINT AS total_tokens
  FROM usage_logs ul
  WHERE ul.created_at >= NOW() - period_to_interval(p_period)
  GROUP BY bucket, ul.model_tag
  ORDER BY bucket, ul.model_tag;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. analytics_top_users
--    用途：依 token 用量排行，回傳 Top N 用戶（含 email 與費用）
--    費用使用最新有效費率計算
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_top_users(
  p_period TEXT,
  p_limit  INT    -- 回傳筆數上限
)
RETURNS TABLE (
  user_id        UUID,
  email          TEXT,
  total_tokens   BIGINT,
  total_cost_usd NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  WITH
  -- 期間內各用戶用量
  user_usage AS (
    SELECT
      ak.user_id,
      ul.model_tag,
      SUM(ul.prompt_tokens)::BIGINT     AS prompt_tokens,
      SUM(ul.completion_tokens)::BIGINT AS completion_tokens,
      SUM(ul.total_tokens)::BIGINT      AS total_tokens
    FROM usage_logs ul
    JOIN api_keys ak ON ak.id = ul.api_key_id
    WHERE ul.created_at >= NOW() - period_to_interval(p_period)
    GROUP BY ak.user_id, ul.model_tag
  ),
  -- 各 model 最新費率
  effective_rates AS (
    SELECT DISTINCT ON (model_tag)
      model_tag,
      input_rate_per_1k,
      output_rate_per_1k
    FROM model_rates
    ORDER BY model_tag, effective_from DESC
  ),
  -- 費用計算
  user_cost AS (
    SELECT
      u.user_id,
      SUM(u.total_tokens)::BIGINT AS total_tokens,
      SUM(
        COALESCE((u.prompt_tokens::NUMERIC / 1000) * r.input_rate_per_1k, 0) +
        COALESCE((u.completion_tokens::NUMERIC / 1000) * r.output_rate_per_1k, 0)
      ) AS total_cost_usd
    FROM user_usage u
    LEFT JOIN effective_rates r ON r.model_tag = u.model_tag
    GROUP BY u.user_id
  )
  SELECT
    uc.user_id,
    au.email::TEXT,
    uc.total_tokens,
    uc.total_cost_usd
  FROM user_cost uc
  JOIN auth.users au ON au.id = uc.user_id
  ORDER BY uc.total_tokens DESC
  LIMIT p_limit;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. analytics_platform_latency
--    用途：全平台延遲百分位數時序（Admin 用，按 model 分組）
--    只計算 status='success' 的紀錄
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_platform_latency(
  p_period    TEXT,
  p_model_tag TEXT   -- NULL = 所有 model
)
RETURNS TABLE (
  bucket     TIMESTAMPTZ,
  model_tag  TEXT,
  p50        NUMERIC,
  p95        NUMERIC,
  p99        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL statement_timeout = '10s';

  RETURN QUERY
  SELECT
    DATE_TRUNC(period_to_trunc(p_period), ul.created_at) AS bucket,
    ul.model_tag,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ul.latency_ms)::NUMERIC AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ul.latency_ms)::NUMERIC AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ul.latency_ms)::NUMERIC AS p99
  FROM usage_logs ul
  WHERE
    ul.created_at >= NOW() - period_to_interval(p_period)
    AND ul.status = 'success'
    AND (p_model_tag IS NULL OR ul.model_tag = p_model_tag)
  GROUP BY bucket, ul.model_tag
  ORDER BY bucket, ul.model_tag;
END;
$$;
