-- Migration: 010_notification_logs
-- Adds notification_logs table for webhook dedup tracking

CREATE TABLE IF NOT EXISTS notification_logs (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  TEXT        NOT NULL,
  key_id      UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for dedup queries: (event_type, key_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_notification_logs_dedup
  ON notification_logs (event_type, key_id, created_at DESC);

-- RLS: enable row-level security
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- service_role can read and write
CREATE POLICY "service_role_all" ON notification_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
