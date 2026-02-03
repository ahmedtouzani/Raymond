DO $pgvec$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
      RAISE NOTICE 'pgvector extension not available (privilege/extension). Skipping embeddings columns/index.';
      RETURN;
  END;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector extension not installed. Skipping embeddings columns/index.';
    RETURN;
  END IF;

  EXECUTE $sql$
    ALTER TABLE ai_memories
      ADD COLUMN IF NOT EXISTS embedding vector(384),
      ADD COLUMN IF NOT EXISTS embedding_model text,
      ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS idx_ai_memories_embedding_ivfflat
      ON ai_memories USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  $sql$;
END $pgvec$;
