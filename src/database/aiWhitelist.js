const db = require('../services/database');

/**
 * AI Whitelist Management
 * Manages users with higher AI rate limits (6 messages/hour instead of 3)
 */

/**
 * Check if a user is whitelisted in a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>}
 */
async function isWhitelisted(guildId, userId) {
    const { rows } = await db.query(
        'SELECT 1 FROM ai_whitelist WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );
    return rows.length > 0;
}

/**
 * Add a user to the whitelist
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID to whitelist
 * @param {string} addedBy - User ID who is adding to whitelist
 * @param {string} reason - Optional reason for whitelisting
 * @returns {Promise<object>} Created record
 */
async function addToWhitelist(guildId, userId, addedBy, reason = null) {
    const { rows } = await db.query(
        `INSERT INTO ai_whitelist (guild_id, user_id, added_by, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, user_id) DO UPDATE
     SET added_by = $3, reason = $4, added_at = NOW()
     RETURNING *`,
        [guildId, userId, addedBy, reason]
    );
    return rows[0];
}

/**
 * Remove a user from the whitelist
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID to remove
 * @returns {Promise<boolean>} True if removed
 */
async function removeFromWhitelist(guildId, userId) {
    const { rowCount } = await db.query(
        'DELETE FROM ai_whitelist WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );
    return rowCount > 0;
}

/**
 * Get all whitelisted users in a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Array>} Array of whitelisted users
 */
async function getWhitelistedUsers(guildId) {
    const { rows } = await db.query(
        `SELECT user_id, added_by, added_at, reason
     FROM ai_whitelist
     WHERE guild_id = $1
     ORDER BY added_at DESC`,
        [guildId]
    );
    return rows;
}

/**
 * Clear all whitelisted users in a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<number>} Number of users removed
 */
async function clearWhitelist(guildId) {
    const { rowCount } = await db.query(
        'DELETE FROM ai_whitelist WHERE guild_id = $1',
        [guildId]
    );
    return rowCount;
}

module.exports = {
    isWhitelisted,
    addToWhitelist,
    removeFromWhitelist,
    getWhitelistedUsers,
    clearWhitelist,
};
