-- Migration: 002_rls_policies
-- Row Level Security policies for Apiex platform

-- api_keys: 用戶只能看自己的 keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own keys" ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own keys" ON api_keys FOR UPDATE USING (auth.uid() = user_id);

-- user_quotas: 用戶可以查看自己的配額，只有 service role 可寫（admin 操作透過 api-server）
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own quota" ON user_quotas FOR SELECT USING (auth.uid() = user_id);

-- usage_logs: 用戶只能看自己 key 的 logs
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON usage_logs FOR SELECT
  USING (api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));

-- route_config: 僅限 service role 存取（應用層透過 service_role key 存取，不允許 anon/user 直接存取）
ALTER TABLE route_config ENABLE ROW LEVEL SECURITY;
-- No user-facing policies: only service_role key can read/write
