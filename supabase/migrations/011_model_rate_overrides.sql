CREATE TABLE model_rate_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier TEXT NOT NULL REFERENCES rate_limit_tiers(tier) ON DELETE CASCADE,
    model_tag TEXT NOT NULL,
    rpm INTEGER NOT NULL,
    tpm INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tier, model_tag)
);

CREATE INDEX idx_model_rate_overrides_tier ON model_rate_overrides(tier);

ALTER TABLE model_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON model_rate_overrides
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
