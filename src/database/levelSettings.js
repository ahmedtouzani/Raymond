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
    const cached = settingsCache.get(guildId);
    if (cached && cached.until > Date.now()) return cached.promise;
    const entry = { until: Date.now() + SETTINGS_CACHE_TTL };
    entry.promise = db.query('SELECT * FROM guild_level_settings WHERE guild_id = $1', [guildId])
      .then(({ rows }) => rows[0] || null).catch(error => { if (settingsCache.get(guildId) === entry) settingsCache.delete(guildId); throw error; });
    settingsCache.set(guildId, entry);
    while (settingsCache.size > 2048) settingsCache.delete(settingsCache.keys().next().value);
    return entry.promise;
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
        text_xp_enabled: true, voice_xp_enabled: true,
        voice_min_members: 2, voice_ignore_muted: false, voice_ignore_deafened: true,
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

    return settings ? { ...defaults, ...Object.fromEntries(Object.entries(settings).filter(([, value]) => value != null)) } : defaults;
}

/**
 * Update guild level settings
 * @param {string} guildId - Guild ID
 * @param {Object} settings - Settings to update
 * @returns {Object|null} Updated settings or null on error
 */
async function updateGuildSettings(guildId, settings) {
    const allowed = ['text_xp_enabled', 'voice_xp_enabled', 'voice_min_members', 'voice_ignore_muted', 'voice_ignore_deafened',
      'xp_multiplier', 'text_xp_min', 'text_xp_max', 'voice_xp_rate', 'xp_cooldown', 'excluded_channels',
      'levelup_enabled', 'levelup_channel_id', 'levelup_message', 'levelup_include_card', 'role_rewards', 'role_rewards_remove_previous'];
    const keys = Object.keys(settings).filter(key => allowed.includes(key) && settings[key] !== undefined);
    if (!keys.length) return getGuildSettings(guildId);
    const values = keys.map(key => settings[key]);
    const { rows } = await db.query(`INSERT INTO guild_level_settings (guild_id, ${keys.join(',')})
      VALUES ($1, ${keys.map((_, i) => `$${i+2}`).join(',')}) ON CONFLICT (guild_id)
      DO UPDATE SET ${keys.map(key => `${key}=EXCLUDED.${key}`).join(',')} RETURNING *`, [guildId, ...values]);
    settingsCache.delete(guildId);
    return rows[0];
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

module.exports = {
    clearSettingsCache: guildId => settingsCache.delete(guildId),
    getGuildSettings, getGuildSettingsWithDefaults, updateGuildSettings, resetGuildSettings,
};
