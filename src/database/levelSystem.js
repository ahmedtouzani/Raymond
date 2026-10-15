const db = require('../services/database');
const logger = require('../utils/logger');

/**
 * Get a user's level data for a guild
 */
async function getUserLevel(guildId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM user_levels WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId]
  );
  // Default structure for new users
  return rows[0] || {
    guild_id: guildId,
    user_id: userId,
    text_xp: 0,
    text_level: 1,
    voice_xp: 0,
    voice_level: 1,
    text_next_level_xp: randomXpForLevel(1),
    voice_next_level_xp: randomXpForLevel(1)
  };
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
  return db.transaction(async client => {
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
}

/**
 * Get leaderboard for a guild
 */
async function getLeaderboard(guildId, type = 'text', limit = 10) {
  // type: 'text' or 'voice'
  let query;
  if (type === 'text') {
    query = 'SELECT user_id, text_xp AS xp, text_level AS level FROM user_levels WHERE guild_id = $1 ORDER BY text_level DESC, text_xp DESC LIMIT $2';
  } else {
    query = 'SELECT user_id, voice_xp AS xp, voice_level AS level FROM user_levels WHERE guild_id = $1 ORDER BY voice_level DESC, voice_xp DESC LIMIT $2';
  }
  const { rows } = await db.query(query, [guildId, limit]);
  return rows;
}

module.exports = {
  getUserLevel,
  addXp,
  getLeaderboard
};
