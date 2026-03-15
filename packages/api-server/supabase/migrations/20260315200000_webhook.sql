-- T20: Webhook 配額告警通知
-- 建立 webhook_configs 與 webhook_logs 表，以及 RLS policies

-- =============================================================================
-- webhook_configs — 用戶 Webhook 設定（每用戶一組）
-- =============================================================================

CREATE TABLE webhook_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  secret        TEXT,                                  -- 可選，HMAC-SHA256 簽名用
  events        TEXT[]      NOT NULL DEFAULT '{quota_warning}',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_configs_user_id_unique UNIQUE (user_id)  -- 每用戶一組
);

COMMENT ON TABLE  webhook_configs            IS 'User webhook notification configurations';
COMMENT ON COLUMN webhook_configs.secret     IS 'Optional HMAC-SHA256 signing secret';
COMMENT ON COLUMN webhook_configs.events     IS 'Subscribed event types, e.g. {quota_warning}';

-- =============================================================================
-- webhook_logs — 推播記錄
-- =============================================================================

CREATE TABLE webhook_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id   UUID        NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
  event               TEXT        NOT NULL,
  payload             JSONB       NOT NULL DEFAULT '{}',
  status_code         INTEGER,                         -- NULL 表示網路錯誤
  response_body       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  webhook_logs             IS 'Record of every webhook dispatch attempt';
COMMENT ON COLUMN webhook_logs.status_code IS 'HTTP response status; NULL means network/timeout error';

-- 依 webhook_config_id + created_at 建立索引，加速 logs 查詢與防重複檢查
CREATE INDEX idx_webhook_logs_config_created
  ON webhook_logs(webhook_config_id, created_at DESC);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs    ENABLE ROW LEVEL SECURITY;

-- webhook_configs: 只有 owner 可讀寫
CREATE POLICY "Users can manage own webhook configs"
  ON webhook_configs
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- webhook_logs: 透過 config 的 owner 判斷
CREATE POLICY "Users can view own webhook logs"
  ON webhook_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM webhook_configs wc
      WHERE wc.id = webhook_logs.webhook_config_id
        AND wc.user_id = auth.uid()
    )
  );

-- service_role bypass（API server 使用 supabaseAdmin）
CREATE POLICY "Service role bypass webhook_configs"
  ON webhook_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role bypass webhook_logs"
  ON webhook_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
