const { Collection } = require('discord.js');
const db = require('../services/database');
const logger = require('../utils/logger');

// Cache for guild settings
const guildConfigs = new Collection();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Gets a guild's configuration, using cache when possible
 * @param {string} guildId - The ID of the guild
 * @param {boolean} [forceRefresh=false] - Whether to bypass the cache
 * @returns {Promise<Object>} The guild's configuration
 */
async function getGuildConfig(guildId, forceRefresh = false) {
  if (!guildId) {
    logger.warn('getGuildConfig called without guildId');
    return createDefaultConfig(guildId);
  }

  // Check cache first
  const cached = guildConfigs.get(guildId);
  if (cached && !forceRefresh && (Date.now() - cached.cachedAt < CACHE_TTL)) {
    return cached.data;
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM guild_configs WHERE guild_id = $1',
      [guildId]
    );

    // If no config exists, create a default one
    const config = rows[0] || await createDefaultConfig(guildId);

    // Ensure settings is always an object
    if (!config.settings || typeof config.settings !== 'object') {
      config.settings = {};
    }

    // Update cache
    guildConfigs.set(guildId, {
      data: config,
      cachedAt: Date.now()
    });

    return config;
  } catch (error) {
    logger.error(`Error getting config for guild ${guildId}:`, error);
    // Return default config in case of error
    return createDefaultConfig(guildId);
  }
}

/**
 * Creates a default configuration for a guild
 * @private
 */
async function createDefaultConfig(guildId) {
  const defaultConfig = {
    guild_id: guildId,
    prefix: '!',
    settings: {},
    created_at: new Date(),
    updated_at: new Date()
  };

  try {
    if (guildId) { // Only save to DB if we have a valid guild ID
      await db.query(
        `INSERT INTO guild_configs (guild_id, prefix, settings)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id) DO NOTHING`,
        [guildId, defaultConfig.prefix, defaultConfig.settings]
      );
    }
  } catch (error) {
    logger.error('Error creating default config:', error);
  }

  return defaultConfig;
}

/**
 * Updates a guild's configuration
 * @param {string} guildId - The ID of the guild
 * @param {Object} updates - The updates to apply
 * @returns {Promise<Object>} The updated configuration
 */
async function setGuildConfig(guildId, updates) {
  if (!guildId) {
    throw new Error('guildId is required');
  }

  try {
    return await db.transaction(async (client) => {
      // Get current config (bypass cache)
      const current = await getGuildConfig(guildId, true);

      // Merge updates with current settings
      const updatedConfig = {
        ...current,
        ...updates,
        settings: {
          ...(current.settings || {}),
          ...(updates.settings || {})
        },
        updated_at: new Date()
      };

      // Update database
      const { rows } = await client.query(
        `INSERT INTO guild_configs (guild_id, prefix, settings, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id) 
         DO UPDATE SET 
           prefix = EXCLUDED.prefix,
           settings = EXCLUDED.settings,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          guildId,
          updatedConfig.prefix,
          updatedConfig.settings,
          updatedConfig.updated_at
        ]
      );

      // Update cache
      guildConfigs.set(guildId, {
        data: rows[0],
        cachedAt: Date.now()
      });

      return rows[0];
    });
  } catch (error) {
    logger.error(`Error updating config for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Updates only the guild's prefix
 * @param {string} guildId - The ID of the guild
 * @param {string} prefix - The new prefix
 * @returns {Promise<boolean>} Whether the update was successful
 */
async function setGuildPrefix(guildId, prefix) {
  try {
    await db.query(
      'UPDATE guild_configs SET prefix = $1, updated_at = NOW() WHERE guild_id = $2',
      [prefix, guildId]
    );

    // Invalidate cache
    clearCache(guildId);
    return true;
  } catch (error) {
    logger.error(`Error updating prefix for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Updates a specific embed setting for a guild
 * @param {string} guildId - The ID of the guild
 * @param {string} key - The setting key to update
 * @param {*} value - The new value
 * @returns {Promise<boolean>} Whether the update was successful
 */
async function setGuildEmbedSetting(guildId, key, value) {
  try {
    const config = await getGuildConfig(guildId);

    // Create a new settings object with the updated value
    const newSettings = {
      ...config.settings,
      embed: {
        ...(config.settings.embed || {}),
        [key]: value
      }
    };

    await setGuildConfig(guildId, { settings: newSettings });
    return true;
  } catch (error) {
    logger.error(`Error updating embed setting for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Initializes configurations for all guilds the bot is in
 * @param {Client} client - The Discord.js client
 * @returns {Promise<void>}
 */
async function initializeGuildConfigs(client) {
  try {

    // For each guild the bot is in, ensure it has a config
    const guilds = client.guilds.cache;
    logger.info(`Initializing configs for ${guilds.size} guilds...`);

    for (const [guildId, guild] of guilds) {
      try {
        await getGuildConfig(guildId); // This will create default config if it doesn't exist
      } catch (error) {
        logger.error(`Error initializing config for guild ${guildId}:`, error);
      }
    }

    logger.info('✅ Guild configurations initialized');
    return { success: true, guildCount: guilds.size };
  } catch (error) {
    logger.error('❌ Error initializing guild configs:', error);
    throw error;
  }
}

/**
 * Clears the cache for a specific guild or all guilds
 * @param {string} [guildId] - The ID of the guild to clear, or undefined to clear all
 */
function clearCache(guildId) {
  if (guildId) {
    guildConfigs.delete(guildId);
  } else {
    guildConfigs.clear();
  }
  logger.debug(`Cache cleared${guildId ? ` for guild ${guildId}` : ' for all guilds'}`);
}

module.exports = {
  getGuildConfig,
  setGuildConfig,
  setGuildPrefix,
  setGuildEmbedSetting,
  initializeGuildConfigs,
};