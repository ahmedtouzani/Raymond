-- Migration: Add Guild Isolation to AI Memories
-- Generated: 2026-02-08T02:12:00.000Z
-- Description: Adds guild_id column to ai_memories for multi-server isolation
--              and creates ai_agent_audit_log table for autonomous agent tracking

BEGIN;

-- ========================================
-- 1. Add guild_id column to ai_memories
-- ========================================
ALTER TABLE ai_memories 
ADD COLUMN IF NOT EXISTS guild_id TEXT;

-- Create index for faster guild-based queries
CREATE INDEX IF NOT EXISTS idx_ai_memories_guild_id 
ON ai_memories(guild_id);

-- Create composite index for guild + user queries
CREATE INDEX IF NOT EXISTS idx_ai_memories_guild_user 
ON ai_memories(guild_id, created_by);

-- ========================================
-- 2. Create AI Agent Audit Log Table
-- ========================================
CREATE TABLE IF NOT EXISTS ai_agent_audit_log (
    id SERIAL PRIMARY KEY,
    agent_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    guild_id TEXT,
    performed_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster guild-based audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_guild_id 
ON ai_agent_audit_log(guild_id);

-- Create index for faster agent-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_agent_action 
ON ai_agent_audit_log(agent_name, action);

-- Create index for timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
ON ai_agent_audit_log(created_at DESC);

COMMIT;
