-- Invite Tracking System
-- Tracks server invites and member join sources

CREATE TABLE IF NOT EXISTS invite_tracking (
  guild_id VARCHAR(32) NOT NULL,
  invite_code VARCHAR(32) NOT NULL,
  inviter_id VARCHAR(32),
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  PRIMARY KEY (guild_id, invite_code)
);

-- Track who invited whom
CREATE TABLE IF NOT EXISTS member_invites (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  member_id VARCHAR(32) NOT NULL,
  inviter_id VARCHAR(32),
  invite_code VARCHAR(32),
  join_method VARCHAR(50) DEFAULT 'unknown',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, member_id)
);

CREATE INDEX idx_invite_tracking_guild ON invite_tracking(guild_id);
CREATE INDEX idx_invite_tracking_inviter ON invite_tracking(inviter_id);
CREATE INDEX idx_member_invites_guild ON member_invites(guild_id);
CREATE INDEX idx_member_invites_member ON member_invites(member_id);
CREATE INDEX idx_member_invites_inviter ON member_invites(inviter_id);
