const db = require('../services/database');

async function getMemberCheckData(guildId, userId, includeRecords = false) {
  if (!guildId || !userId) throw new Error('guildId and userId are required');
  const results = await Promise.allSettled([
    db.query('SELECT inviter_id, invite_code, join_method, joined_at FROM member_invites WHERE guild_id=$1 AND member_id=$2', [guildId, userId]),
    db.query('SELECT COUNT(*)::int AS count FROM user_warnings WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
    db.query('SELECT jailed_at FROM jailed_users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
    ...(includeRecords ? [
      db.query('SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id=$1 AND target_id=$2', [guildId, userId]),
      db.query('SELECT COUNT(*)::int AS count FROM moderation_notes WHERE guild_id=$1 AND target_id=$2 AND deleted_at IS NULL', [guildId, userId]),
    ] : []),
  ]);
  return {
    invite: results[0].status === 'fulfilled' ? results[0].value.rows[0] || null : null,
    inviteAvailable: results[0].status === 'fulfilled',
    warnings: results[1].status === 'fulfilled' ? results[1].value.rows[0].count : null,
    jail: results[2].status === 'fulfilled' ? Boolean(results[2].value.rows[0]) : null,
    recordsIncluded: includeRecords,
    caseCount: results[3]?.status === 'fulfilled' ? results[3].value.rows[0]?.count ?? null : null,
    noteCount: results[4]?.status === 'fulfilled' ? results[4].value.rows[0]?.count ?? null : null,
  };
}
module.exports = { getMemberCheckData };
