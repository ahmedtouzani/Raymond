CREATE TABLE IF NOT EXISTS ai_memory_queue (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, source_message_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_memory_queue_pending ON ai_memory_queue (status, available_at);
