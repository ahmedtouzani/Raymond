-- Migration: Create AI memory and chat usage tables
-- Generated: 2026-02-03T09:30:00Z

CREATE TABLE IF NOT EXISTS ai_memories (
  id BIGSERIAL PRIMARY KEY,
  key TEXT,
  value TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_updated_at ON ai_memories(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memories_key ON ai_memories(key);

CREATE TABLE IF NOT EXISTS ai_chat_usage (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_day ON ai_chat_usage(day);
