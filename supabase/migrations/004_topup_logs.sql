CREATE TABLE topup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT NOT NULL,
  stripe_event_id TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  tokens_granted BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_topup_logs_event_id UNIQUE (stripe_event_id)
);

CREATE INDEX idx_topup_logs_user_id ON topup_logs(user_id);
CREATE INDEX idx_topup_logs_session_id ON topup_logs(stripe_session_id);
CREATE INDEX idx_topup_logs_created_at ON topup_logs(created_at);

ALTER TABLE topup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topup logs"
  ON topup_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can insert topup logs"
  ON topup_logs FOR INSERT
  WITH CHECK (true);
