ALTER TABLE temp_voice_configs
DROP COLUMN IF EXISTS channel_name_template,
DROP COLUMN IF EXISTS cleanup_delay_seconds;
