-- Migration: Level reward roles per guild/ladder/level
CREATE TABLE IF NOT EXISTS level_roles (
  guild_id VARCHAR(32) NOT NULL,
  ladder VARCHAR(8) NOT NULL CHECK (ladder IN ('text', 'voice')),
  level INTEGER NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (guild_id, ladder, level)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_level_roles_guild_ladder ON level_roles (guild_id, ladder, level);
