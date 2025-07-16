-- Migration to add tables for the temporary voice channel feature

-- Stores the configuration for each guild's temp voice system
CREATE TABLE IF NOT EXISTS temp_voice_configs (
    guild_id VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    creator_channel_id VARCHAR(255) NOT NULL,
    category_id VARCHAR(255), -- Optional: Category to create channels in
    channel_name_template VARCHAR(100) DEFAULT '{user}''s Channel' -- e.g., "{user}'s Channel"
);

-- Tracks the active temporary channels created by the bot
CREATE TABLE IF NOT EXISTS temp_voice_channels (
    channel_id VARCHAR(255) PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add a comment to describe the new tables
COMMENT ON TABLE temp_voice_configs IS 'Stores guild-specific configurations for the temporary voice channel feature.';
COMMENT ON TABLE temp_voice_channels IS 'Tracks active temporary voice channels created by users.';
