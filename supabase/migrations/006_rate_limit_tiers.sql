-- rate_limit_tiers 表
CREATE TABLE IF NOT EXISTS rate_limit_tiers (
  tier TEXT PRIMARY KEY,
  rpm INTEGER NOT NULL,
  tpm INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO rate_limit_tiers (tier, rpm, tpm) VALUES
  ('free', 20, 100000),
  ('pro', 60, 500000),
  ('unlimited', -1, -1)
ON CONFLICT (tier) DO NOTHING;

-- api_keys 新增 rate_limit_tier 欄位
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_tier TEXT NOT NULL DEFAULT 'free';
