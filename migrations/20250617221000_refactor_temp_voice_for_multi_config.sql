-- This migration refactors the temporary voice channel system to support multiple, named configurations per guild.

-- Step 1: Add the new creator_channel_id column to the temp_voice_channels table.
ALTER TABLE temp_voice_channels ADD COLUMN creator_channel_id VARCHAR(255);

-- Step 2: Populate the new creator_channel_id column by joining with the temp_voice_configs table.
-- This ensures existing temporary channels are linked to their creator configuration.
UPDATE temp_voice_channels AS t_channels
SET creator_channel_id = t_configs.creator_channel_id
FROM temp_voice_configs AS t_configs
WHERE t_channels.guild_id = t_configs.guild_id AND t_channels.config_type = t_configs.config_type;

-- Step 3: Now that the data is migrated, drop the obsolete config_type column from temp_voice_channels.
ALTER TABLE temp_voice_channels DROP COLUMN config_type;

-- Step 4: Add a user-friendly config_name to the temp_voice_configs table.
ALTER TABLE temp_voice_configs ADD COLUMN config_name VARCHAR(100);

-- Step 5: Populate the new config_name for existing configurations, using the old config_type as a basis.
UPDATE temp_voice_configs
SET config_name = CASE
    WHEN config_type = 'support' THEN 'Support Lobby'
    ELSE 'Default Voice'
END;

-- Step 6: Drop the old primary key from temp_voice_configs as it's based on the obsolete config_type.
ALTER TABLE temp_voice_configs DROP CONSTRAINT temp_voice_configs_pkey;

-- Step 7: Drop the now-obsolete config_type column from temp_voice_configs.
ALTER TABLE temp_voice_configs DROP COLUMN config_type;

-- Step 8: Set the new primary key for temp_voice_configs to be a combination of guild_id and creator_channel_id.
-- This enforces that each 'Join to Create' channel is a unique configuration per guild.
ALTER TABLE temp_voice_configs ADD PRIMARY KEY (guild_id, creator_channel_id);

-- Step 9: Ensure that all configurations have a name.
ALTER TABLE temp_voice_configs ALTER COLUMN config_name SET NOT NULL;
