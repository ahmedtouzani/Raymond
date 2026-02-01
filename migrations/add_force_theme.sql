-- Add force_theme column to guild_level_settings table
-- This allows admins to force server theme on all users, overriding personal preferences

ALTER TABLE guild_level_settings 
ADD COLUMN IF NOT EXISTS force_theme BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN guild_level_settings.force_theme IS 'When true, server theme overrides user personal theme preferences';
