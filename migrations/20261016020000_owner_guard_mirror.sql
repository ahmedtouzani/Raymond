-- Existing jobs represented server mutes. New jobs explicitly arm each mirrored flag.
ALTER TABLE owner_guard_events
  ADD COLUMN IF NOT EXISTS undo_mute BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS undo_deaf BOOLEAN NOT NULL DEFAULT FALSE;
