-- Migration: Create hourly rate limiting table for AI chat
-- Generated: 2026-02-07

CREATE TABLE IF NOT EXISTS ai_chat_usage_hourly (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  hour_timestamp TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, hour_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_hourly_timestamp 
  ON ai_chat_usage_hourly(hour_timestamp);

COMMENT ON TABLE ai_chat_usage_hourly IS 'Tracks AI chat usage per user per hour for rate limiting';
COMMENT ON COLUMN ai_chat_usage_hourly.hour_timestamp IS 'Truncated to hour for grouping (e.g., 2026-02-07 20:00:00)';
