-- Seed data for Apiex platform
-- Initial route_config entries for apex-smart and apex-cheap

INSERT INTO route_config (tag, upstream_provider, upstream_model, upstream_base_url, is_active)
VALUES
  (
    'apex-smart',
    'anthropic',
    'claude-opus-4-6',
    'https://api.anthropic.com',
    true
  ),
  (
    'apex-cheap',
    'google',
    'gemini-2.0-flash',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    true
  );
