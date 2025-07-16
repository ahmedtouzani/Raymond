-- Migration: create_auto_reactions_table
-- Generated: 2025-06-18T00:06:44.522Z
-- ID: 35500806-0e57-40ff-b113-f71a25787dc8

BEGIN;

CREATE TABLE auto_reactions (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('user', 'channel')),
    emoji VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX auto_reactions_unique_idx ON auto_reactions (guild_id, target_id, emoji);



COMMIT;
