-- Migration to create the infractions table
CREATE TABLE IF NOT EXISTS infractions (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    moderator_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- WARN, MUTE, KICK, BAN, UNBAN, UNMUTE
    reason TEXT,
    duration VARCHAR(50), -- e.g., "1h", "30m" (optional)
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE infractions IS 'Stores comprehensive moderation history for users.';
