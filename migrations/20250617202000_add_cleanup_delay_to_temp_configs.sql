-- Migration to add a cleanup delay setting to the temp_voice_configs table
ALTER TABLE temp_voice_configs
ADD COLUMN cleanup_delay_seconds INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN temp_voice_configs.cleanup_delay_seconds IS 'The delay in seconds before an empty temporary channel is deleted.';
