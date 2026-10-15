CREATE TABLE IF NOT EXISTS audit_log_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  category TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','failed','discarded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  discord_message_id TEXT,
  last_error TEXT,
  UNIQUE (guild_id, event_key)
);
CREATE INDEX IF NOT EXISTS audit_log_queue_pending ON audit_log_queue (available_at, id) WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS audit_log_queue_guild ON audit_log_queue (guild_id, created_at DESC);
