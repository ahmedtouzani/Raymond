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
  // type: 'text' or 'voice'
  const user = await getUserLevel(guildId, userId);
  let xp, level, nextLevelXp;
  if (type === 'text') {
    xp = user.text_xp + amount;
    level = user.text_level;
    nextLevelXp = user.text_next_level_xp;
  } else {
    xp = user.voice_xp + amount;
    level = user.voice_level;
    nextLevelXp = user.voice_next_level_xp;
  }
  let leveledUp = false;
  let newNextLevelXp = nextLevelXp;
  while (level < 100 && xp >= newNextLevelXp) {
    xp -= newNextLevelXp;
    level++;
    newNextLevelXp = randomXpForLevel(level);
    leveledUp = true;
  }
  // Cap at level 100
  if (level > 100) level = 100;
  // Prepare update
  let update;
  if (type === 'text') {
    update = {
      text_xp: xp,
      text_level: level,
      text_next_level_xp: newNextLevelXp
    };
  } else {
    update = {
      voice_xp: xp,
      voice_level: level,
      voice_next_level_xp: newNextLevelXp
    };
  }
  await db.query(
    `INSERT INTO user_levels (guild_id, user_id, text_xp, text_level, text_next_level_xp, voice_xp, voice_level, voice_next_level_xp, last_message_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET text_xp = $3, text_level = $4, text_next_level_xp = $5, voice_xp = $6, voice_level = $7, voice_next_level_xp = $8, last_message_at = NOW()`,
    [
      guildId,
      userId,
      update.text_xp ?? user.text_xp,
      update.text_level ?? user.text_level,
      update.text_next_level_xp ?? user.text_next_level_xp,
      update.voice_xp ?? user.voice_xp,
      update.voice_level ?? user.voice_level,
      update.voice_next_level_xp ?? user.voice_next_level_xp
    ]
  );
  return { xp, level, leveledUp };
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
