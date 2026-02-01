const db = require('../services/database');

const settingsCache = new Map();
const SETTINGS_CACHE_TTL = 60 * 1000;

/**
 * Database functions for guild level settings
 */

/**
 * Get guild level settings
 * @param {string} guildId - Guild ID
 * @returns {Object|null} Guild settings or null if not found
 */
async function getGuildSettings(guildId) {
    try {
        const cached = settingsCache.get(guildId);
        if (cached && (Date.now() - cached.cachedAt < SETTINGS_CACHE_TTL)) {
            return cached.data;
        }
        const { rows } = await db.query(
            'SELECT * FROM guild_level_settings WHERE guild_id = $1',
            [guildId]
        );
        const settings = rows[0] || null;
        settingsCache.set(guildId, { data: settings, cachedAt: Date.now() });
        return settings;
    } catch (error) {
        console.error('[LevelSettings] Error fetching guild settings:', error);
        return null;
    }
}

/**
 * Get guild settings with defaults
 * @param {string} guildId - Guild ID
 * @returns {Object} Guild settings with defaults applied
 */
async function getGuildSettingsWithDefaults(guildId) {
    const settings = await getGuildSettings(guildId);

    // Default settings
    const defaults = {
        guild_id: guildId,
        theme_preset: 'dark',
        custom_theme: null,
        xp_multiplier: 1.0,
        text_xp_min: 15,
        text_xp_max: 25,
        voice_xp_rate: 10,
        xp_cooldown: 60,
        excluded_channels: [],
        levelup_enabled: false,
        levelup_channel_id: null,
        levelup_message: 'Congratulations {user}! You reached level {level}!',
        levelup_include_card: true,
        role_rewards: {},
        role_rewards_remove_previous: false
    };

    return settings ? { ...defaults, ...settings } : defaults;
}

/**
 * Update guild level settings
 * @param {string} guildId - Guild ID
 * @param {Object} settings - Settings to update
 * @returns {Object|null} Updated settings or null on error
 */
async function updateGuildSettings(guildId, settings) {
    try {
        // Build SET clause dynamically
        const fields = [];
        const values = [guildId];
        let paramIndex = 2;

        const allowedFields = [
            'theme_preset', 'custom_theme', 'xp_multiplier', 'text_xp_min',
            'text_xp_max', 'voice_xp_rate', 'xp_cooldown', 'excluded_channels',
            'levelup_enabled', 'levelup_channel_id', 'levelup_message',
            'levelup_include_card', 'role_rewards', 'role_rewards_remove_previous'
        ];

        for (const [key, value] of Object.entries(settings)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return await getGuildSettings(guildId);
        }

        const query = `
      INSERT INTO guild_level_settings (guild_id, ${allowedFields.join(', ')})
      VALUES ($1, ${allowedFields.map((_, i) => `$${i + 2}`).join(', ')})
      ON CONFLICT (guild_id) 
      DO UPDATE SET ${fields.join(', ')}
      RETURNING *
    `;

        const allValues = [guildId, ...allowedFields.map(f => settings[f] !== undefined ? settings[f] : null)];
        const { rows } = await db.query(query, allValues);
        settingsCache.delete(guildId);
        return rows[0];
    } catch (error) {
        console.error('[LevelSettings] Error updating guild settings:', error);
        return null;
    }
}

/**
 * Reset guild settings to defaults
 * @param {string} guildId - Guild ID
 * @returns {boolean} Success status
 */
async function resetGuildSettings(guildId) {
    try {
        await db.query('DELETE FROM guild_level_settings WHERE guild_id = $1', [guildId]);
        settingsCache.delete(guildId);
        return true;
    } catch (error) {
        console.error('[LevelSettings] Error resetting guild settings:', error);
        return false;
    }
}

/**
 * Get guild theme (server theme or default)
 * @param {string} guildId - Guild ID
 * @returns {string} Theme name
 */
async function getGuildTheme(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings?.theme_preset || 'dark';
}

/**
 * Get custom theme colors
 * @param {string} guildId - Guild ID
 * @returns {Object|null} Custom theme object or null
 */
async function getCustomTheme(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings?.custom_theme || null;
}

module.exports = {
    getGuildSettings,
    getGuildSettingsWithDefaults,
    updateGuildSettings,
    resetGuildSettings,
    getGuildTheme,
    getCustomTheme
};
