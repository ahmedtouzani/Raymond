-- Migration to refactor the temp_voice_configs table for multi-config support

-- Step 1: Add the new config_type column with a default value for existing rows
ALTER TABLE temp_voice_configs ADD COLUMN config_type VARCHAR(50) NOT NULL DEFAULT 'default';

-- Step 2: Drop the old primary key constraint
ALTER TABLE temp_voice_configs DROP CONSTRAINT temp_voice_configs_pkey;

-- Step 3: Create a new composite primary key
ALTER TABLE temp_voice_configs ADD PRIMARY KEY (guild_id, config_type);

-- Step 4: Add a comment to the new column for clarity
COMMENT ON COLUMN temp_voice_configs.config_type IS 'The type of temporary voice configuration (e.g., default, support).';

-- Step 5: Add the same config_type to the tracking table for consistency
ALTER TABLE temp_voice_channels ADD COLUMN config_type VARCHAR(50) NOT NULL DEFAULT 'default';

-- Step 6: Add a comment to the new column
COMMENT ON COLUMN temp_voice_channels.config_type IS 'The type of configuration that created this channel.';
