// Premium logic utilities for Parallel Ultra Bot
// All logic is self-contained in this file for clarity and maintainability.
const db = require('../services/database');
const logger = require('../utils/logger');

// Cache for premium guilds
const premiumCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if a guild is premium (async)
 * @param {string} guildId - The ID of the guild to check
 * @returns {Promise<boolean>} Whether the guild has premium status
 */
async function isPremiumGuild(guildId) {
  try {
    // Check cache first
    const cached = premiumCache.get(guildId);
    if (cached && (Date.now() - cached.cachedAt < CACHE_TTL)) {
      return cached.data;
    }

    const { rowCount } = await db.query(
      'SELECT 1 FROM premium_guilds WHERE guild_id = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [guildId]
    );
    
    const isPremium = rowCount > 0;
    
    // Update cache
    premiumCache.set(guildId, {
      data: isPremium,
      cachedAt: Date.now()
    });
    
    return isPremium;
  } catch (error) {
    logger.error(`Error checking premium status for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Add a guild to premium list
 * @param {string} guildId - The ID of the guild to add
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function addPremiumGuild(guildId) {
  try {
    await db.query(
      `INSERT INTO premium_guilds (guild_id, activated_at) 
       VALUES ($1, NOW()) 
       ON CONFLICT (guild_id) 
       DO UPDATE SET activated_at = NOW()`,
      [guildId]
    );
    
    // Invalidate cache
    premiumCache.delete(guildId);
    return true;
  } catch (error) {
    logger.error(`Error adding premium guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Add a guild to premium with expiry, plan type, and buyer tracking.
 * @param {string} guildId - The guild ID to add
 * @param {string} buyerId - The ID of the user who bought the premium
 * @param {string} planType - The type of premium plan (e.g., 'basic', 'premium', 'enterprise')
 * @param {number} days - Number of days until expiry (default: 30)
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function addPremiumGuildWithExpiry(guildId, buyerId, planType = 'basic', days = 30) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  
  try {
    await db.query(
      `INSERT INTO premium_guilds (guild_id, expires_at, plan_type, buyer_id, activated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET 
         expires_at = EXCLUDED.expires_at,
         plan_type = EXCLUDED.plan_type,
         buyer_id = EXCLUDED.buyer_id,
         activated_at = CASE 
           WHEN premium_guilds.activated_at IS NULL THEN NOW() 
           ELSE premium_guilds.activated_at 
         END`,
      [guildId, expiryDate, planType, buyerId]
    );
    
    // Invalidate cache
    premiumCache.delete(guildId);
    return true;
  } catch (error) {
    logger.error(`Error adding premium guild ${guildId} with expiry:`, error);
    return false;
  }
}

/**
 * List all premium guilds with details
 * @returns {Promise<Array>} Array of premium guilds with details
 */
async function listPremiumGuildsDetails() {
  try {
    const { rows } = await db.query(
      `SELECT guild_id, activated_at, expires_at, plan_type, buyer_id 
       FROM premium_guilds 
       WHERE expires_at IS NULL OR expires_at > NOW()
       ORDER BY activated_at DESC`
    );
    return rows;
  } catch (error) {
    logger.error('Error listing premium guilds:', error);
    return [];
  }
}

/**
 * Remove a guild from premium list
 * @param {string} guildId - The guild ID to remove
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function removePremiumGuild(guildId) {
  try {
    await db.query('DELETE FROM premium_guilds WHERE guild_id = $1', [guildId]);
    
    // Invalidate cache
    premiumCache.delete(guildId);
    return true;
  } catch (error) {
    logger.error(`Error removing premium guild ${guildId}:`, error);
    return false;
  }
}

/**
 * List all premium guilds
 * @returns {Promise<Array>} Array of guild IDs with premium status
 */
async function listPremiumGuilds() {
  try {
    const { rows } = await db.query(
      'SELECT guild_id FROM premium_guilds WHERE expires_at IS NULL OR expires_at > NOW()'
    );
    return rows.map(row => row.guild_id);
  } catch (error) {
    logger.error('Error listing premium guilds:', error);
    return [];
  }
}

/**
 * Call this at bot startup to auto-create the premium_guilds table
 * @returns {Promise<boolean>} Whether initialization was successful
 */
/**
 * Placeholder for premium system initialization.
 * Database schema is now managed by migrations.
 * @returns {Promise<boolean>}
 */
async function ready() {
  logger.info('✅ Premium system ready');
  return true;
}

/**
 * Check if guild has at least Stellar (Stellar or Godmode)
 * @param {string} guildId - The guild ID to check
 * @returns {Promise<boolean>} Whether the guild has Stellar or higher
 */
async function hasStellarOrHigher(guildId) {
  try {
    const { rowCount } = await db.query(
      'SELECT 1 FROM premium_guilds WHERE guild_id = $1 AND plan_type IN ($2, $3) AND (expires_at IS NULL OR expires_at > NOW())',
      [guildId, 'stellar', 'godmode']
    );
    return rowCount > 0;
  } catch (error) {
    logger.error(`Error checking Stellar+ status for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Check if guild has Godmode plan
 * @param {string} guildId - The guild ID to check
 * @returns {Promise<boolean>} Whether the guild has Godmode
 */
async function hasGodmode(guildId) {
  try {
    const { rowCount } = await db.query(
      'SELECT 1 FROM premium_guilds WHERE guild_id = $1 AND plan_type = $2 AND (expires_at IS NULL OR expires_at > NOW())',
      [guildId, 'godmode']
    );
    return rowCount > 0;
  } catch (error) {
    logger.error(`Error checking Godmode status for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Get premium guild information
 * @param {string} guildId - The guild ID to get info for
 * @returns {Promise<Object|null>} Guild premium info or null if not found
 */
async function getPremiumInfo(guildId) {
  try {
    const { rows } = await db.query(
      'SELECT * FROM premium_guilds WHERE guild_id = $1',
      [guildId]
    );
    return rows[0] || null;
  } catch (error) {
    logger.error(`Error getting premium info for guild ${guildId}:`, error);
    return null;
  }
}

module.exports = {
  isPremiumGuild,
  addPremiumGuild,
  addPremiumGuildWithExpiry,
  removePremiumGuild,
  listPremiumGuilds,
  listPremiumGuildsDetails,

  ready,
  hasStellarOrHigher,
  hasGodmode,
  getPremiumInfo,
};
