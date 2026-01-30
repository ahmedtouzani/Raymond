const db = require('../services/database');
const logger = require('../utils/logger');

/**
 * Get stats channels configuration for a guild
 */
async function getStatsChannels(guildId) {
    try {
        const result = await db.query(
            'SELECT * FROM stats_channels WHERE guild_id = $1',
            [guildId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting stats channels:', error);
        return null;
    }
}

/**
 * Set stats channel configuration
 */
async function setStatsChannel(guildId, type, channelId, format = null) {
    try {
        const column = type === 'member' ? 'member_count_channel_id' : 'voice_count_channel_id';
        const formatColumn = type === 'member' ? 'member_count_format' : 'voice_count_format';

        const updates = { [column]: channelId };
        if (format) {
            updates[formatColumn] = format;
        }

        const setClause = Object.keys(updates).map((key, idx) => `${key} = $${idx + 2}`).join(', ');
        const values = [guildId, ...Object.values(updates)];

        await db.query(`
      INSERT INTO stats_channels (guild_id, ${Object.keys(updates).join(', ')})
      VALUES ($1, ${Object.keys(updates).map((_, idx) => `$${idx + 2}`).join(', ')})
      ON CONFLICT (guild_id) 
      DO UPDATE SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    `, values);

        return true;
    } catch (error) {
        logger.error('Error setting stats channel:', error);
        return false;
    }
}

/**
 * Update last update timestamp
 */
async function updateLastUpdate(guildId, type) {
    try {
        const column = type === 'member' ? 'last_member_update' : 'last_voice_update';
        await db.query(
            `UPDATE stats_channels SET ${column} = CURRENT_TIMESTAMP WHERE guild_id = $1`,
            [guildId]
        );
    } catch (error) {
        logger.error('Error updating last update timestamp:', error);
    }
}

/**
 * Remove stats channel configuration
 */
async function removeStatsChannel(guildId, type) {
    try {
        const column = type === 'member' ? 'member_count_channel_id' : 'voice_count_channel_id';
        await db.query(
            `UPDATE stats_channels SET ${column} = NULL WHERE guild_id = $1`,
            [guildId]
        );
        return true;
    } catch (error) {
        logger.error('Error removing stats channel:', error);
        return false;
    }
}

module.exports = {
    getStatsChannels,
    setStatsChannel,
    updateLastUpdate,
    removeStatsChannel
};
