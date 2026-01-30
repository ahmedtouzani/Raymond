const db = require('../services/database');
const logger = require('../utils/logger');

/**
 * Creates a new role menu.
 * @param {object} data
 * @returns {Promise<object>} The created menu
 */
async function createRoleMenu(data) {
    const {
        guildId, name, title, description, type, mode,
        embed_color, thumbnail, image, footer, author_name, author_icon
    } = data;

    try {
        const { rows } = await db.query(
            `INSERT INTO role_menus (
          guild_id, name, title, description, type, mode,
          embed_color, thumbnail, image, footer, author_name, author_icon
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
            [
                guildId, name, title, description, type, mode,
                embed_color, thumbnail, image, footer, author_name, author_icon
            ]
        );
        return rows[0];
    } catch (error) {
        logger.error(`Error creating role menu '${name}' for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Adds an option to a role menu.
 * @param {number} menuId
 * @param {string} roleId
 * @param {string} label
 * @param {string} emoji
 * @param {string} style - BUTTON style (PRIMARY, SECONDARY, etc)
 * @param {string} description - SELECT option description
 */
async function addMenuOption(menuId, roleId, label, emoji, style, description) {
    try {
        const { rows } = await db.query(
            `INSERT INTO role_menu_options (menu_id, role_id, label, emoji, style, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [menuId, roleId, label, emoji, style, description]
        );
        return rows[0];
    } catch (error) {
        logger.error(`Error adding option to menu ${menuId}:`, error);
        throw error;
    }
}

/**
 * Get full menu with options by ID.
 * @param {number|string} menuId
 */
async function getRoleMenu(menuId) {
    try {
        const menuRes = await db.query('SELECT * FROM role_menus WHERE id = $1', [menuId]);
        if (!menuRes.rows[0]) return null;

        const optionsRes = await db.query('SELECT * FROM role_menu_options WHERE menu_id = $1 ORDER BY id ASC', [menuId]);

        return {
            ...menuRes.rows[0],
            options: optionsRes.rows
        };
    } catch (error) {
        logger.error(`Error fetching role menu ${menuId}:`, error);
        return null;
    }
}

/**
 * Updates the message ID and channel ID for a deployed menu.
 */
async function setMenuMessage(menuId, messageId, channelId) {
    await db.query(
        'UPDATE role_menus SET message_id = $1, channel_id = $2 WHERE id = $3',
        [messageId, channelId, menuId]
    );
}

module.exports = {
    createRoleMenu,
    addMenuOption,
    getRoleMenu,
    setMenuMessage
};
