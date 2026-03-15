-- Update admin_list_users to include rate_limit_tier
-- Returns the most common (or latest) rate_limit_tier among active keys for each user
CREATE OR REPLACE FUNCTION admin_list_users(p_offset INTEGER, p_limit INTEGER)
RETURNS TABLE (
  id UUID,
  email TEXT,
  key_count BIGINT,
  total_tokens_used BIGINT,
  quota_tokens BIGINT,
  rate_limit_tier TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(k.key_count, 0) AS key_count,
    COALESCE(ul.total_tokens_used, 0) AS total_tokens_used,
    COALESCE(uq.default_quota_tokens, -1) AS quota_tokens,
    COALESCE(k.rate_limit_tier, 'free') AS rate_limit_tier,
    u.created_at
  FROM auth.users u
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS key_count, MAX(rate_limit_tier) AS rate_limit_tier
    FROM api_keys WHERE status = 'active'
    GROUP BY user_id
  ) k ON k.user_id = u.id
  LEFT JOIN (
    SELECT ak.user_id, SUM(ul.total_tokens) AS total_tokens_used
    FROM usage_logs ul
    JOIN api_keys ak ON ak.id = ul.api_key_id
    GROUP BY ak.user_id
  ) ul ON ul.user_id = u.id
  LEFT JOIN user_quotas uq ON uq.user_id = u.id
  ORDER BY u.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;
