-- Stats Channels Configuration
-- Stores voice channel IDs for displaying server statistics

CREATE TABLE IF NOT EXISTS stats_channels (
  guild_id VARCHAR(32) PRIMARY KEY,
  member_count_channel_id VARCHAR(32),
  voice_count_channel_id VARCHAR(32),
  member_count_format VARCHAR(100) DEFAULT '👥 Members: {count}',
  voice_count_format VARCHAR(100) DEFAULT '🎤 In Voice: {count}',
  last_member_update TIMESTAMP,
  last_voice_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stats_channels_guild ON stats_channels(guild_id);
