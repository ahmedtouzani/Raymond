const db = require('../services/database');
const pageCache = new Map();
function clearLeaderboardCache(guildId) {
  for (const key of pageCache.keys()) if (key.startsWith(`${guildId}:`)) pageCache.delete(key);
}
function defaultUser(guildId, userId) {
  return { guild_id: guildId, user_id: userId, text_xp: 0, text_level: 1, voice_xp: 0, voice_level: 1, text_next_level_xp: 1000, voice_next_level_xp: 1000 };
}

/**
 * Get a user's level data for a guild
 */
async function getUserLevel(guildId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM user_levels WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId]
  );
  return rows[0] || defaultUser(guildId, userId);
}

/**
 * Add XP to a user, auto-level up if needed
 */
function randomXpForLevel(level) {
  // Level cap: 100
  if (level >= 100) return 0;
  if (level < 30) {
    // Quadratic growth for early/mid levels
    return 500 * level * level - 500 * level + 1000;
  } else {
    // Level 30+: flat jump, ultra grind
    return 200000 + (level - 30) * 50000;
  }
}

async function addXp(guildId, userId, amount, type = 'text') {
  if (!['text', 'voice'].includes(type) || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Invalid XP update');
  }
  const result = await db.transaction(async client => {
    await client.query(
      `INSERT INTO user_levels (guild_id, user_id, text_xp, text_level, text_next_level_xp, voice_xp, voice_level, voice_next_level_xp)
       VALUES ($1, $2, 0, 1, $3, 0, 1, $3) ON CONFLICT (guild_id, user_id) DO NOTHING`,
      [guildId, userId, randomXpForLevel(1)]
    );
    const { rows } = await client.query('SELECT * FROM user_levels WHERE guild_id = $1 AND user_id = $2 FOR UPDATE', [guildId, userId]);
    const user = rows[0];
    let xp = user[`${type}_xp`] + amount;
    let level = user[`${type}_level`];
    let nextLevelXp = user[`${type}_next_level_xp`];
    let leveledUp = false;
    while (level < 100 && xp >= nextLevelXp) {
      xp -= nextLevelXp; level++;
      nextLevelXp = randomXpForLevel(level); leveledUp = true;
    }
    await client.query(
      `UPDATE user_levels SET ${type}_xp = $3, ${type}_level = $4, ${type}_next_level_xp = $5, last_message_at = NOW()
       WHERE guild_id = $1 AND user_id = $2`, [guildId, userId, xp, level, nextLevelXp]
    );
    return { xp, level, leveledUp };
  });
  clearLeaderboardCache(guildId);
  return result;
}

// Lifetime XP follows the existing curve without resetting progress or levels.
function lifetimeSql(level, xp) {
  const early = `LEAST(GREATEST(${level}-1,0),29)::bigint`;
  const late = `GREATEST(${level}-30,0)::bigint`;
  return `(${xp}::bigint + 500*${early}*(${early}+1)*(${early}-1)/3 + 1000*${early} + 200000*${late} + 25000*${late}*(${late}-1))`;
}
function ladder(type) {
  if (!['text', 'voice', 'combined'].includes(type)) throw new Error('Unknown XP ladder');
  const text = lifetimeSql('text_level', 'text_xp'), voice = lifetimeSql('voice_level', 'voice_xp');
  if (type === 'combined') return { eligible: '(text_level>1 OR text_xp>0 OR voice_level>1 OR voice_xp>0)',
    fields: `user_id, GREATEST(text_level,voice_level) AS level, text_xp+voice_xp AS xp, 0 AS next_level_xp, (${text}+${voice}) AS total_xp`, order: 'total_xp DESC, user_id ASC' };
  return { eligible: `(${type}_level>1 OR ${type}_xp>0)`,
    fields: `user_id, ${type}_xp AS xp, ${type}_level AS level, ${type}_next_level_xp AS next_level_xp, ${type === 'text' ? text : voice} AS total_xp`,
    order: `${type}_level DESC, ${type}_xp DESC, user_id ASC` };
}
async function getLeaderboard(guildId, type = 'text', limit = 10, offset = 0) {
  const spec = ladder(type);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid leaderboard range');
  return (await db.query(`SELECT ${spec.fields} FROM user_levels WHERE guild_id=$1 AND ${spec.eligible} ORDER BY ${spec.order} LIMIT $2 OFFSET $3`, [guildId, limit, offset])).rows;
}
async function getLeaderboardPage(guildId, type = 'text', requestedPage = 1, refresh = false) {
  const spec = ladder(type);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) requestedPage = 1;
  const key = `${guildId}:${type}:${requestedPage}`;
  const cached = pageCache.get(key);
  if (!refresh && cached && cached.until > Date.now()) return cached.promise;
  const entry = { until: Date.now() + 5000 };
  entry.promise = (async () => {
    const total = (await db.query(`SELECT COUNT(*)::int AS total FROM user_levels WHERE guild_id=$1 AND ${spec.eligible}`, [guildId])).rows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / 10)), page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * 10;
    const users = total ? await getLeaderboard(guildId, type, 10, offset) : [];
    return { users, total, page, totalPages, offset };
  })();
  pageCache.set(key, entry);
  while (pageCache.size > 256) pageCache.delete(pageCache.keys().next().value);
  try { return await entry.promise; } catch (error) { if (pageCache.get(key) === entry) pageCache.delete(key); throw error; }
}
async function getRankedUserLevel(guildId, userId, type = 'text') {
  if (!['text', 'voice'].includes(type)) throw new Error('Unknown XP ladder');
  const { rows } = await db.query(`SELECT u.*, CASE WHEN u.${type}_level=1 AND u.${type}_xp=0 THEN 0 ELSE
    (SELECT COUNT(*)+1 FROM user_levels b WHERE b.guild_id=u.guild_id AND (b.${type}_level>1 OR b.${type}_xp>0)
      AND ((b.${type}_level,b.${type}_xp)>(u.${type}_level,u.${type}_xp)
        OR (b.${type}_level=u.${type}_level AND b.${type}_xp=u.${type}_xp AND b.user_id<u.user_id))) END::int AS rank
    FROM user_levels u WHERE u.guild_id=$1 AND u.user_id=$2`, [guildId, userId]);
  return rows[0] || { ...defaultUser(guildId, userId), rank: 0 };
}
module.exports = { getUserLevel, addXp, getLeaderboard, getLeaderboardPage, getRankedUserLevel, clearLeaderboardCache };
