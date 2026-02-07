const db = require('../services/database');

/**
 * Per-user conversation history storage
 * Stores conversation history in database for persistence and better context management
 */

/**
 * Save a user message to conversation history
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {string} content - Message content
 * @param {string} messageId - Discord message ID
 * @returns {Promise<object>} Saved record
 */
async function saveUserMessage(guildId, userId, content, messageId = null) {
    const { rows } = await db.query(
        `INSERT INTO ai_conversation_history (guild_id, user_id, role, content, message_id)
     VALUES ($1, $2, 'user', $3, $4)
     RETURNING *`,
        [guildId, userId, content, messageId]
    );

    return rows[0];
}

/**
 * Save a bot response to conversation history
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID (the user who triggered the response)
 * @param {string} content - Bot response content
 * @param {string} messageId - Discord message ID
 * @returns {Promise<object>} Saved record
 */
async function saveBotResponse(guildId, userId, content, messageId = null) {
    const { rows } = await db.query(
        `INSERT INTO ai_conversation_history (guild_id, user_id, role, content, message_id)
     VALUES ($1, $2, 'assistant', $3, $4)
     RETURNING *`,
        [guildId, userId, content, messageId]
    );

    return rows[0];
}

/**
 * Get conversation history for a specific user
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {number} limit - Number of messages to retrieve (default: 3)
 * @returns {Promise<Array>} Array of messages in chronological order
 */
async function getUserConversationHistory(guildId, userId, limit = 3) {
    // Get last N messages (user + bot responses) for this specific user
    const { rows } = await db.query(
        `SELECT role, content, message_id, created_at
     FROM ai_conversation_history
     WHERE guild_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
        [guildId, userId, limit * 2] // Fetch more to ensure we get enough pairs
    );

    // Reverse to get chronological order
    const messages = rows.reverse();

    // Format for AI service (compatible with OpenRouter format)
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}

/**
 * Cleanup old conversation history for a user
 * Keeps only the most recent N messages
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {number} keepLast - Number of messages to keep (default: 10)
 * @returns {Promise<number>} Number of deleted records
 */
async function cleanupOldHistory(guildId, userId, keepLast = 10) {
    const { rowCount } = await db.query(
        `DELETE FROM ai_conversation_history
     WHERE guild_id = $1 AND user_id = $2
     AND id NOT IN (
       SELECT id FROM ai_conversation_history
       WHERE guild_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3
     )`,
        [guildId, userId, keepLast]
    );

    return rowCount;
}

/**
 * Delete all conversation history for a user
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteUserHistory(guildId, userId) {
    const { rowCount } = await db.query(
        'DELETE FROM ai_conversation_history WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );

    return rowCount;
}

/**
 * Delete all conversation history for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteGuildHistory(guildId) {
    const { rowCount } = await db.query(
        'DELETE FROM ai_conversation_history WHERE guild_id = $1',
        [guildId]
    );

    return rowCount;
}

module.exports = {
    saveUserMessage,
    saveBotResponse,
    getUserConversationHistory,
    cleanupOldHistory,
    deleteUserHistory,
    deleteGuildHistory,
};
