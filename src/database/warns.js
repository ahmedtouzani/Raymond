const db = require('../services/database');

// Add a warning
async function addWarning(guildId, userId, moderatorId, reason) {
  await db.query(
    'INSERT INTO user_warnings (guild_id, user_id, moderator_id, reason) VALUES ($1, $2, $3, $4)',
    [guildId, userId, moderatorId, reason]
  );
}

// Count warnings
async function countWarnings(guildId, userId) {
  const res = await db.query(
    'SELECT COUNT(*) FROM user_warnings WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId]
  );
  return parseInt(res.rows[0].count, 10);
}

// Get warnings
async function getWarnings(guildId, userId) {
  const res = await db.query(
    'SELECT * FROM user_warnings WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId]
  );
  return res.rows;
}

// Delete one warning by warning ID (primary key)
async function deleteWarning(warningId) {
  await db.query('DELETE FROM user_warnings WHERE id = $1', [warningId]);
}

// Delete all warnings for a user in a guild
async function deleteAllWarnings(guildId, userId) {
  await db.query('DELETE FROM user_warnings WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
}

// Get warning by ID, guild ID, and user ID
async function getWarningByIdGuildUser(warningId, guildId, userId) {
  const res = await db.query(
    'SELECT * FROM user_warnings WHERE id = $1 AND guild_id = $2 AND user_id = $3',
    [warningId, guildId, userId]
  );
  return res.rows[0];
}


module.exports = { addWarning, countWarnings, getWarnings, deleteWarning, deleteAllWarnings, getWarningByIdGuildUser };
