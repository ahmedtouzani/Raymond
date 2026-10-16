CREATE TABLE IF NOT EXISTS mass_role_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  source_role_id TEXT NOT NULL,
  target_role_id TEXT NOT NULL,
  include_bots BOOLEAN NOT NULL DEFAULT FALSE,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','paused','cancelling','cancelled','completed')),
  last_error TEXT,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS mass_role_one_active_guild ON mass_role_jobs (guild_id)
  WHERE state IN ('pending','running','paused','cancelling');
CREATE TABLE IF NOT EXISTS mass_role_items (
  job_id BIGINT NOT NULL REFERENCES mass_role_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done','skipped','failed')),
  started BOOLEAN NOT NULL DEFAULT FALSE,
  target_added BOOLEAN NOT NULL DEFAULT FALSE,
  last_error TEXT,
  PRIMARY KEY (job_id,user_id)
);
CREATE INDEX IF NOT EXISTS mass_role_pending_items ON mass_role_items (job_id,state,user_id);
CREATE INDEX IF NOT EXISTS mass_role_jobs_ready ON mass_role_jobs (updated_at) WHERE state IN ('pending','running','cancelling');
