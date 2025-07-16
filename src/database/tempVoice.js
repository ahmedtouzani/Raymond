const db = require('../services/database');
const logger = require('../utils/logger');

/**
 * Gets the temporary voice channel configuration for a specific guild.
 * @param {string} guildId The ID of the guild.
 * @returns {Promise<object|null>} The configuration object or null if not found.
 */
/**
 * Gets a specific temporary voice channel configuration by the creator channel ID.
 * @param {string} guildId The ID of the guild.
 * @param {string} creatorChannelId The ID of the 'Join to Create' channel.
 * @returns {Promise<object|null>} The configuration object or null if not found.
 */
async function getTempVoiceConfig(guildId, creatorChannelId) {
  try {
    const { rows } = await db.query('SELECT * FROM temp_voice_configs WHERE guild_id = $1 AND creator_channel_id = $2', [guildId, creatorChannelId]);
    if (!rows[0]) return null;
    const config = rows[0];
    return {
      guildId: config.guild_id,
      creatorChannelId: config.creator_channel_id,
      configName: config.config_name,
      enabled: config.enabled,
      categoryId: config.category_id,
      supportRoleId: config.support_role_id,
    };
  } catch (error) {
    logger.error(`Error getting temp voice config for guild ${guildId} (creator: ${creatorChannelId}):`, error);
    throw error;
  }
}

/**
 * Gets all temporary voice channel configurations for a guild.
 * @param {string} guildId The ID of the guild.
 * @returns {Promise<Array<object>>} An array of configuration objects.
 */
async function getAllTempVoiceConfigsForGuild(guildId) {
  try {
    const { rows } = await db.query('SELECT * FROM temp_voice_configs WHERE guild_id = $1', [guildId]);
    return rows.map(config => ({
      guildId: config.guild_id,
      creatorChannelId: config.creator_channel_id,
      configName: config.config_name,
      enabled: config.enabled,
      categoryId: config.category_id,
      supportRoleId: config.support_role_id,
    }));
  } catch (error) {
    logger.error(`Error getting all temp voice configs for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Creates or updates a temporary voice channel configuration for a guild.
 * @param {string} guildId The ID of the guild.
 * @param {object} config The configuration object.
 * @returns {Promise<object>} The updated configuration object.
 */
async function upsertTempVoiceConfig(guildId, config) {
  const { creatorChannelId, configName, enabled, categoryId, supportRoleId } = config;
  const query = `
    INSERT INTO temp_voice_configs (guild_id, creator_channel_id, config_name, enabled, category_id, support_role_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (guild_id, creator_channel_id) DO UPDATE SET
      config_name = EXCLUDED.config_name,
      enabled = EXCLUDED.enabled,
      category_id = EXCLUDED.category_id,
      support_role_id = EXCLUDED.support_role_id
    RETURNING *;
  `;
  const params = [guildId, creatorChannelId, configName, enabled, categoryId, supportRoleId];
  try {
    const { rows } = await db.query(query, params);
    logger.info(`Upserted temp voice config '${configName}' for guild ${guildId}.`);
    return rows[0];
  } catch (error) {
    logger.error(`Error upserting temp voice config for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Deletes a temporary voice channel configuration.
 * @param {string} guildId The ID of the guild.
 * @param {string} creatorChannelId The ID of the creator channel config to delete.
 * @returns {Promise<boolean>} True if a config was deleted, false otherwise.
 */
async function deleteTempVoiceConfig(guildId, creatorChannelId) {
  try {
    const result = await db.query('DELETE FROM temp_voice_configs WHERE guild_id = $1 AND creator_channel_id = $2', [guildId, creatorChannelId]);
    const deleted = result.rowCount > 0;
    if (deleted) {
      logger.info(`Deleted temp voice config for creator channel ${creatorChannelId} in guild ${guildId}.`);
    }
    return deleted;
  } catch (error) {
    logger.error(`Error deleting temp voice config for creator channel ${creatorChannelId}:`, error);
    throw error;
  }
}

/**
 * Adds a record of an active temporary channel.
 * @param {string} channelId The ID of the created voice channel.
 * @param {string} guildId The ID of the guild.
 * @param {string} userId The ID of the user who created the channel.
 * @param {string} configType The type of config that created this channel.
 * @returns {Promise<void>}
 */
async function addTempChannel(channelId, guildId, userId, creatorChannelId) {
  try {
    await db.query('INSERT INTO temp_voice_channels (channel_id, guild_id, user_id, creator_channel_id) VALUES ($1, $2, $3, $4)', [channelId, guildId, userId, creatorChannelId]);
  } catch (error) {
    logger.error(`Error adding temp channel ${channelId}:`, error);
  }
}

/**
 * Removes a record of a temporary channel.
 * @param {string} channelId The ID of the channel to remove.
 * @returns {Promise<void>}
 */
async function removeTempChannel(channelId) {
  try {
    await db.query('DELETE FROM temp_voice_channels WHERE channel_id = $1', [channelId]);
  } catch (error) {
    logger.error(`Error removing temp channel ${channelId}:`, error);
  }
}

/**
 * Gets all active temporary channels, e.g., for cleanup on startup.
 * @returns {Promise<Array<object>>}
 */
async function getAllTempChannels() {
  try {
    const { rows } = await db.query('SELECT * FROM temp_voice_channels');
    return rows.map(channel => ({
      channelId: channel.channel_id,
      guildId: channel.guild_id,
      userId: channel.user_id,
      creatorChannelId: channel.creator_channel_id,
    }));
  } catch (error) {
    logger.error('Error getting all temp channels:', error);
    return [];
  }
}

module.exports = {
  getTempVoiceConfig,
  getAllTempVoiceConfigsForGuild,
  upsertTempVoiceConfig,
  deleteTempVoiceConfig,
  addTempChannel,
  removeTempChannel,
  getAllTempChannels,
};
