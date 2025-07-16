const db = require('../services/database');

/**
 * Set a level reward role for a guild/ladder/level
 */
async function setLevelRole(guildId, ladder, level, roleId) {
  await db.query(
    `INSERT INTO level_roles (guild_id, ladder, level, role_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, ladder, level) DO UPDATE SET role_id = $4`,
    [guildId, ladder, level, roleId]
  );
}

/**
 * Remove a level reward role
 */
async function removeLevelRole(guildId, ladder, level) {
  await db.query(
    `DELETE FROM level_roles WHERE guild_id = $1 AND ladder = $2 AND level = $3`,
    [guildId, ladder, level]
  );
}

/**
 * Get all level reward roles for a guild/ladder
 */
async function getLevelRoles(guildId, ladder) {
  const { rows } = await db.query(
    `SELECT level, role_id FROM level_roles WHERE guild_id = $1 AND ladder = $2 ORDER BY level ASC`,
    [guildId, ladder]
  );
  return rows;
}

/**
 * Get the role for a specific guild/ladder/level
 */
async function getRoleForLevel(guildId, ladder, level) {
  const { rows } = await db.query(
    `SELECT role_id FROM level_roles WHERE guild_id = $1 AND ladder = $2 AND level = $3`,
    [guildId, ladder, level]
  );
  return rows[0]?.role_id || null;
}

module.exports = {
  setLevelRole,
  removeLevelRole,
  getLevelRoles,
  getRoleForLevel
};
