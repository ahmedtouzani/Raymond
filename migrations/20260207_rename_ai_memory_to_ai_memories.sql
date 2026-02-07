-- Migration: Fix ai_memory table name inconsistency
-- Generated: 2026-02-07
-- This migration renames ai_memory to ai_memories if it exists

DO $$
BEGIN
  -- Check if ai_memory table exists and ai_memories doesn't
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memory')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memories') THEN
    
    -- Rename the table
    ALTER TABLE ai_memory RENAME TO ai_memories;
    
    RAISE NOTICE 'Renamed ai_memory table to ai_memories';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memory')
        AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memories') THEN
    
    -- Both tables exist - this is an error state, log it
    RAISE WARNING 'Both ai_memory and ai_memories tables exist. Manual intervention required.';
  ELSE
    RAISE NOTICE 'ai_memories table already exists or ai_memory does not exist. No action needed.';
  END IF;
END $$;
