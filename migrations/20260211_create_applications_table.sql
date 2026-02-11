CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
  answers JSONB, -- Store modal answers as JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(20),
  reviewed_at TIMESTAMP,
  message_id VARCHAR(20), -- ID of the review embed message
  channel_id VARCHAR(20) -- Channel ID where the reviews are sent
);

CREATE INDEX IF NOT EXISTS idx_applications_guild_user ON applications(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
