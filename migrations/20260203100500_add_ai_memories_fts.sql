CREATE INDEX IF NOT EXISTS idx_ai_memories_fts ON ai_memories USING GIN (to_tsvector('english', coalesce(key,'') || ' ' || coalesce(value,'')));
