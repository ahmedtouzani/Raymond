-- Migration: Initial Schema
-- Generated: 2025-06-17T19:05:00Z

BEGIN;

-- Table: guild_configs
CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id VARCHAR(32) PRIMARY KEY,
  prefix VARCHAR(10) DEFAULT '!',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guild_configs_settings ON guild_configs USING GIN (settings);

-- Table: premium_guilds
CREATE TABLE IF NOT EXISTS premium_guilds (
  guild_id VARCHAR(32) PRIMARY KEY,
  activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  plan_type VARCHAR(32) DEFAULT 'basic',
  buyer_id VARCHAR(32)
);

-- Table: user_warnings
CREATE TABLE IF NOT EXISTS user_warnings (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: jail_settings
CREATE TABLE IF NOT EXISTS jail_settings (
  guild_id TEXT PRIMARY KEY,
  jail_role_id TEXT,
  jail_voice_channel_id TEXT
);

-- Table: jailed_users
CREATE TABLE IF NOT EXISTS jailed_users (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  saved_role_ids TEXT NOT NULL,
  jailed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, user_id)
);

-- Table: guild_auto_roles
CREATE TABLE IF NOT EXISTS guild_auto_roles (
  guild_id TEXT PRIMARY KEY,
  role_id TEXT,
  member_join_log_channel_id TEXT
);

COMMIT;
