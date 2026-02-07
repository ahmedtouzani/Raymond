-- Migration: Create AI whitelist table for dynamic user management
-- Generated: 2026-02-07

CREATE TABLE IF NOT EXISTS ai_whitelist (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_whitelist_guild 
  ON ai_whitelist(guild_id);

COMMENT ON TABLE ai_whitelist IS 'Whitelisted users for higher AI rate limits (6 messages/hour instead of 3)';
COMMENT ON COLUMN ai_whitelist.added_by IS 'User ID who added this user to whitelist';
COMMENT ON COLUMN ai_whitelist.reason IS 'Optional reason for whitelisting';
