-- Migration: Create user_levels table for leveling system
CREATE TABLE IF NOT EXISTS user_levels (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  last_message_at TIMESTAMPTZ,
  PRIMARY KEY (guild_id, user_id)
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_user_levels_guild_xp ON user_levels (guild_id, xp DESC);
