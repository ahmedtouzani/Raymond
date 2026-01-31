-- Add user preferences table for rank card themes
CREATE TABLE IF NOT EXISTS user_preferences (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rank_card_theme TEXT DEFAULT 'dark',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_lookup ON user_preferences(guild_id, user_id);
