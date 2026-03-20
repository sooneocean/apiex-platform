-- Add priority column to route_config for fallback ordering.
-- Lower number = higher priority. Default 0 for existing routes.
ALTER TABLE route_config ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
