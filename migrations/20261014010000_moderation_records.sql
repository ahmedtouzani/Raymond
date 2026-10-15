CREATE TABLE IF NOT EXISTS moderation_case_counters (
  guild_id TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
CREATE TABLE IF NOT EXISTS moderation_cases (
  guild_id TEXT NOT NULL,
  case_number INTEGER NOT NULL CHECK (case_number > 0),
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  original_reason VARCHAR(1000) NOT NULL,
  source_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by TEXT,
  edited_at TIMESTAMPTZ,
  PRIMARY KEY (guild_id, case_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS moderation_cases_source ON moderation_cases (guild_id, source_message_id, action, target_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS moderation_cases_member ON moderation_cases (guild_id, target_id, case_number DESC);
CREATE TABLE IF NOT EXISTS moderation_notes (
  guild_id TEXT NOT NULL,
  note_id BIGINT GENERATED ALWAYS AS IDENTITY,
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  content VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (guild_id, note_id)
);
CREATE INDEX IF NOT EXISTS moderation_notes_member ON moderation_notes (guild_id, target_id, note_id DESC) WHERE deleted_at IS NULL;
