-- Migration to add a support role ID to the temp_voice_configs table
ALTER TABLE temp_voice_configs
ADD COLUMN support_role_id VARCHAR(255) NULL;

COMMENT ON COLUMN temp_voice_configs.support_role_id IS 'The ID of the role that gets access to support-type temporary channels.';
