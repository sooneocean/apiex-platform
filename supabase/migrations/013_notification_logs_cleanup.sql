-- Migration: 013_notification_logs_cleanup
-- Adds a scheduled cleanup function for notification_logs (dedup records older than 2 hours)
-- Can be called by pg_cron or external scheduler

CREATE OR REPLACE FUNCTION cleanup_notification_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notification_logs
  WHERE created_at < NOW() - INTERVAL '2 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION cleanup_notification_logs() TO service_role;

-- If pg_cron is available, schedule hourly cleanup:
-- SELECT cron.schedule('cleanup-notification-logs', '0 * * * *', 'SELECT cleanup_notification_logs()');
