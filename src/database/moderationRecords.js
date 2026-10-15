const db = require('../services/database');
function required(value, label) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); }
async function createCase({ guildId, targetId, moderatorId, action, reason = 'No reason provided', messageId = null, metadata = {} }) {
  for (const [label, value] of Object.entries({ guildId, targetId, moderatorId, action })) required(value, label);
  if (action.length > 32 || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('Invalid case action or reason');
  // Serialize before opening a transaction; invalid objects must not stall a pg query.
  const serializedMetadata = JSON.stringify(metadata);
  return db.transaction(async client => {
    if (messageId) {
      const existing = await client.query('SELECT * FROM moderation_cases WHERE guild_id=$1 AND source_message_id=$2 AND action=$3 AND target_id=$4', [guildId, messageId, action, targetId]);
      if (existing.rows[0]) return existing.rows[0];
    }
    const number = (await client.query(`INSERT INTO moderation_case_counters (guild_id, last_number) VALUES ($1, 1)
      ON CONFLICT (guild_id) DO UPDATE SET last_number=moderation_case_counters.last_number+1 RETURNING last_number`, [guildId])).rows[0].last_number;
    const result = await client.query(`INSERT INTO moderation_cases (guild_id, case_number, target_id, moderator_id, action, reason, original_reason, source_message_id, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)
      ON CONFLICT (guild_id, source_message_id, action, target_id) WHERE source_message_id IS NOT NULL
      DO UPDATE SET source_message_id=EXCLUDED.source_message_id RETURNING *`, [guildId, number, targetId, moderatorId, action, reason, messageId, serializedMetadata]);
    return result.rows[0];
  });
}
async function getCase(guildId, number) {
  required(guildId, 'guildId');
  return (await db.query('SELECT * FROM moderation_cases WHERE guild_id=$1 AND case_number=$2', [guildId, number])).rows[0] || null;
}
async function memberCases(guildId, targetId, page = 0) {
  required(guildId, 'guildId'); required(targetId, 'targetId');
  return (await db.query('SELECT * FROM moderation_cases WHERE guild_id=$1 AND target_id=$2 ORDER BY case_number DESC LIMIT 10 OFFSET $3', [guildId, targetId, Math.max(0, page) * 10])).rows;
}
async function editCaseReason(guildId, number, moderatorId, reason, elevated = false) {
  required(guildId, 'guildId'); required(moderatorId, 'moderatorId');
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('Reason must contain 1–1000 characters');
  return (await db.query(`UPDATE moderation_cases SET reason=$4, edited_by=$3, edited_at=NOW()
    WHERE guild_id=$1 AND case_number=$2 AND (moderator_id=$3 OR $5::boolean) RETURNING *`, [guildId, number, moderatorId, reason, elevated])).rows[0] || null;
}
async function addNote(guildId, targetId, moderatorId, content) {
  for (const [label, value] of Object.entries({ guildId, targetId, moderatorId })) required(value, label);
  if (typeof content !== 'string' || !content.trim() || content.length > 1000) throw new Error('Note must contain 1–1000 characters');
  return (await db.query('INSERT INTO moderation_notes (guild_id, target_id, moderator_id, content) VALUES ($1,$2,$3,$4) RETURNING *', [guildId, targetId, moderatorId, content])).rows[0];
}
async function memberNotes(guildId, targetId, page = 0) {
  required(guildId, 'guildId'); required(targetId, 'targetId');
  return (await db.query('SELECT * FROM moderation_notes WHERE guild_id=$1 AND target_id=$2 AND deleted_at IS NULL ORDER BY note_id DESC LIMIT 10 OFFSET $3', [guildId, targetId, Math.max(0, page) * 10])).rows;
}
async function deleteNote(guildId, id, moderatorId, elevated = false) {
  required(guildId, 'guildId'); required(moderatorId, 'moderatorId');
  return (await db.query(`UPDATE moderation_notes SET deleted_at=NOW(), deleted_by=$3
    WHERE guild_id=$1 AND note_id=$2 AND deleted_at IS NULL AND (moderator_id=$3 OR $4::boolean) RETURNING *`, [guildId, id, moderatorId, elevated])).rows[0] || null;
}
module.exports = { createCase, getCase, memberCases, editCaseReason, addNote, memberNotes, deleteNote };
