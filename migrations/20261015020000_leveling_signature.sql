-- Preserve every member's existing XP and levels; add only indexes and controls.
CREATE INDEX IF NOT EXISTS user_levels_text_ranking ON user_levels (guild_id, text_level DESC, text_xp DESC, user_id ASC) WHERE text_level>1 OR text_xp>0;
CREATE INDEX IF NOT EXISTS user_levels_voice_ranking ON user_levels (guild_id, voice_level DESC, voice_xp DESC, user_id ASC) WHERE voice_level>1 OR voice_xp>0;
ALTER TABLE guild_level_settings
  ADD COLUMN IF NOT EXISTS text_xp_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_xp_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_min_members INTEGER NOT NULL DEFAULT 2 CHECK (voice_min_members BETWEEN 1 AND 99),
  ADD COLUMN IF NOT EXISTS voice_ignore_muted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_ignore_deafened BOOLEAN NOT NULL DEFAULT true;
