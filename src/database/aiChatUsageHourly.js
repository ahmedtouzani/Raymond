const db = require('../services/database');

/**
 * Hourly rate limiting for AI chat usage
 * Tracks messages per user per hour for tiered rate limiting
 */

/**
 * Get the current hour timestamp (truncated to the hour)
 * @returns {Date} Timestamp truncated to the hour
 */
function getCurrentHourTimestamp() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
}

/**
 * Get hourly usage count for a user
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<number>} Number of messages in current hour
 */
async function getHourlyUsage(guildId, userId) {
    const hourTimestamp = getCurrentHourTimestamp();

    const { rows } = await db.query(
        `SELECT count FROM ai_chat_usage_hourly 
     WHERE guild_id = $1 AND user_id = $2 AND hour_timestamp = $3`,
        [guildId, userId, hourTimestamp]
    );

    return rows.length > 0 ? rows[0].count : 0;
}

/**
 * Increment hourly usage count for a user
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<number>} New count
 */
async function incrementHourlyUsage(guildId, userId) {
    const hourTimestamp = getCurrentHourTimestamp();

    const { rows } = await db.query(
        `INSERT INTO ai_chat_usage_hourly (guild_id, user_id, hour_timestamp, count, updated_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (guild_id, user_id, hour_timestamp)
     DO UPDATE SET count = ai_chat_usage_hourly.count + 1, updated_at = NOW()
     RETURNING count`,
        [guildId, userId, hourTimestamp]
    );

    return rows[0].count;
}

/**
 * Get rate limit for a user based on their tier
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<number>} Messages allowed per hour (Infinity for owner)
 */
async function getRateLimitForUser(userId, guildId = null) {
    const ownerId = String(process.env.OWNER_ID || '').trim();

    // Owner has unlimited access
    if (ownerId && userId === ownerId) {
        return Infinity;
    }

    // Check database whitelist first (if guildId provided)
    if (guildId) {
        const aiWhitelist = require('./aiWhitelist');
        const isWhitelisted = await aiWhitelist.isWhitelisted(guildId, userId).catch(() => false);

        if (isWhitelisted) {
            const whitelistedLimit = Number(process.env.AI_HOURLY_LIMIT_WHITELISTED || 6);
            return whitelistedLimit;
        }
    }

    // Fall back to .env whitelist (for backward compatibility)
    const envAllowedUsers = String(process.env.AI_ALLOWED_USERS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const isEnvWhitelisted = envAllowedUsers.includes(userId);

    // Get limits from environment or use defaults
    const whitelistedLimit = Number(process.env.AI_HOURLY_LIMIT_WHITELISTED || 6);
    const regularLimit = Number(process.env.AI_HOURLY_LIMIT_REGULAR || 3);

    return isEnvWhitelisted ? whitelistedLimit : regularLimit;
}

/**
 * Check if user has exceeded their hourly rate limit
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<{allowed: boolean, limit: number, used: number}>}
 */
async function checkRateLimit(guildId, userId) {
    const limit = await getRateLimitForUser(userId, guildId);

    if (limit === Infinity) {
        return { allowed: true, limit: Infinity, used: 0 };
    }

    const used = await getHourlyUsage(guildId, userId);
    const allowed = used < limit;

    return { allowed, limit, used };
}

/**
 * Cleanup old hourly records (older than 24 hours)
 * Should be called periodically
 * @returns {Promise<number>} Number of deleted records
 */
async function cleanupOldRecords() {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    const { rowCount } = await db.query(
        'DELETE FROM ai_chat_usage_hourly WHERE hour_timestamp < $1',
        [cutoff]
    );

    return rowCount;
}

module.exports = {
    getHourlyUsage,
    incrementHourlyUsage,
    getRateLimitForUser,
    checkRateLimit,
    cleanupOldRecords,
};
