-- Retire AI storage permanently. Historical migrations remain in the ledger so
-- both existing installations and fresh databases reach the same final schema.
-- No CASCADE: unrelated objects must never be removed implicitly.
DROP TABLE IF EXISTS ai_memory_queue;
DROP TABLE IF EXISTS ai_agent_audit_log;
DROP TABLE IF EXISTS ai_conversation_history;
DROP TABLE IF EXISTS ai_chat_usage_hourly;
DROP TABLE IF EXISTS ai_chat_usage;
DROP TABLE IF EXISTS ai_whitelist;
DROP TABLE IF EXISTS ai_memories;
DROP TABLE IF EXISTS ai_memory;

UPDATE guild_configs
SET settings = settings - 'ai' - 'ai_allowed_users' - 'ai_allowed_roles'
WHERE settings ?| ARRAY['ai', 'ai_allowed_users', 'ai_allowed_roles'];

-- Remove pgvector only if no other database objects still depend on it.
DO $retire_vector$
BEGIN
  DROP EXTENSION IF EXISTS vector;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'Keeping shared vector extension: non-AI objects still depend on it.';
END $retire_vector$;
