-- 008_analytics.sql
-- Analytics Dashboard: model_rates table + composite indexes

-- ---------------------------------------------------------------------------
-- model_rates table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS model_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_tag TEXT NOT NULL,
  input_rate_per_1k NUMERIC(10,6) NOT NULL,
  output_rate_per_1k NUMERIC(10,6) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default rates
INSERT INTO model_rates (model_tag, input_rate_per_1k, output_rate_per_1k, effective_from)
VALUES
  ('apex-smart', 0.015000, 0.075000, '2024-01-01T00:00:00Z'),
  ('apex-cheap', 0.000100, 0.000400, '2024-01-01T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_model_rates_tag_effective
  ON model_rates (model_tag, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_created
  ON usage_logs (api_key_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE model_rates ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bypasses RLS by default, but explicit policy for clarity)
CREATE POLICY "service_role_all" ON model_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
