-- Migration: Create per-user conversation history table
-- Generated: 2026-02-07

CREATE TABLE IF NOT EXISTS ai_conversation_history (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_history_guild_user 
  ON ai_conversation_history(guild_id, user_id, created_at DESC);

COMMENT ON TABLE ai_conversation_history IS 'Stores per-user conversation history with the AI bot';
COMMENT ON COLUMN ai_conversation_history.role IS 'Either "user" for user messages or "assistant" for bot responses';
COMMENT ON COLUMN ai_conversation_history.message_id IS 'Discord message ID for reference';
