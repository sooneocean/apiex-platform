-- Performance index for webhook_logs listing
-- Used by WebhookService.listLogs() which queries by config_id ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_webhook_logs_config_created
  ON webhook_logs (webhook_config_id, created_at DESC);
