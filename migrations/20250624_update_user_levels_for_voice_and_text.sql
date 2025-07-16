-- Migration: Update user_levels table for separate text and voice XP/levels
ALTER TABLE user_levels
  ADD COLUMN IF NOT EXISTS text_xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS text_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS voice_xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS text_next_level_xp INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS voice_next_level_xp INTEGER NOT NULL DEFAULT 100;

-- Remove old columns if present
ALTER TABLE user_levels DROP COLUMN IF EXISTS xp;
ALTER TABLE user_levels DROP COLUMN IF EXISTS level;

-- Index for text leaderboard
CREATE INDEX IF NOT EXISTS idx_user_levels_guild_text ON user_levels (guild_id, text_level DESC, text_xp DESC);
-- Index for voice leaderboard
CREATE INDEX IF NOT EXISTS idx_user_levels_guild_voice ON user_levels (guild_id, voice_level DESC, voice_xp DESC);
