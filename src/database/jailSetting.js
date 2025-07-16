const db = require('../services/database');

// Get jail settings for a guild
async function getJailSettings(guildId) {
  const res = await db.query('SELECT * FROM jail_settings WHERE guild_id = $1', [guildId]);
  return res.rows[0];
}

// Set jail role for guild
async function setJailSettings(guildId, jailRoleId, jailVoiceChannelId) {
  await db.query(`
    INSERT INTO jail_settings (guild_id, jail_role_id, jail_voice_channel_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (guild_id) DO UPDATE SET jail_role_id = EXCLUDED.jail_role_id, jail_voice_channel_id = EXCLUDED.jail_voice_channel_id
  `, [guildId, jailRoleId, jailVoiceChannelId]);
}

// Save jailed user roles
async function jailUser(guildId, userId, roleIds) {
  const roleIdsJson = JSON.stringify(roleIds);
  await db.query(`
    INSERT INTO jailed_users (guild_id, user_id, saved_role_ids)
    VALUES ($1, $2, $3)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET saved_role_ids = EXCLUDED.saved_role_ids, jailed_at = CURRENT_TIMESTAMP
  `, [guildId, userId, roleIdsJson]);
}

// Get jailed user data
async function getJailedUser(guildId, userId) {
  const res = await db.query(`
    SELECT * FROM jailed_users WHERE guild_id = $1 AND user_id = $2
  `, [guildId, userId]);
  if (!res.rows.length) return null;

  const row = res.rows[0];
  return {
    ...row,
    saved_role_ids: JSON.parse(row.saved_role_ids),
  };
}

// Remove jailed user data
async function unjailUser(guildId, userId) {
  await db.query(`
    DELETE FROM jailed_users WHERE guild_id = $1 AND user_id = $2
  `, [guildId, userId]);
}

module.exports = {
  getJailSettings,
  setJailSettings,
  jailUser,
  getJailedUser,
  unjailUser,
};
