-- Migration: Add guild_level_settings table
-- This table stores server-wide level system customization

CREATE TABLE IF NOT EXISTS guild_level_settings (
  guild_id TEXT PRIMARY KEY,
  
  -- Theme Settings
  theme_preset TEXT DEFAULT 'dark' CHECK (theme_preset IN ('dark', 'light', 'neon', 'gradient', 'custom')),
  custom_theme JSONB DEFAULT NULL,
  
  -- XP Settings
  xp_multiplier DECIMAL(3,2) DEFAULT 1.0 CHECK (xp_multiplier >= 0.5 AND xp_multiplier <= 5.0),
  text_xp_min INTEGER DEFAULT 15 CHECK (text_xp_min >= 1),
  text_xp_max INTEGER DEFAULT 25 CHECK (text_xp_max >= text_xp_min),
  voice_xp_rate INTEGER DEFAULT 10 CHECK (voice_xp_rate >= 1),
  xp_cooldown INTEGER DEFAULT 60 CHECK (xp_cooldown >= 0),
  excluded_channels TEXT[] DEFAULT '{}',
  
  -- Level-Up Settings
  levelup_enabled BOOLEAN DEFAULT false,
  levelup_channel_id TEXT DEFAULT NULL,
  levelup_message TEXT DEFAULT 'Congratulations {user}! You reached level {level}!',
  levelup_include_card BOOLEAN DEFAULT true,
  
  -- Role Rewards (JSON format: {"5": "role_id", "10": "role_id"})
  role_rewards JSONB DEFAULT '{}',
  role_rewards_remove_previous BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_guild_level_settings_guild_id ON guild_level_settings(guild_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_guild_level_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_guild_level_settings_timestamp
BEFORE UPDATE ON guild_level_settings
FOR EACH ROW
EXECUTE FUNCTION update_guild_level_settings_timestamp();
