const db = require('../services/database');

async function getAutoRoleSettings(guildId) {
  const res = await db.query('SELECT role_id, member_join_log_channel_id FROM guild_auto_roles WHERE guild_id = $1', [guildId]);
  return res.rows[0] || { role_id: null, member_join_log_channel_id: null };
}

async function setAutoRole(guildId, roleId, memberJoinLogChannelId) {
  await db.query(`
    INSERT INTO guild_auto_roles (guild_id, role_id, member_join_log_channel_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (guild_id) DO UPDATE SET role_id = EXCLUDED.role_id, member_join_log_channel_id = EXCLUDED.member_join_log_channel_id
  `, [guildId, roleId, memberJoinLogChannelId]);
}

module.exports = { getAutoRoleSettings, setAutoRole };
