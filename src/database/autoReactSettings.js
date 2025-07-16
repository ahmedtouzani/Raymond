const db = require('../services/database');

// Add a new auto-reaction
async function addAutoReaction(guildId, targetId, targetType, emoji) {
    const query = `
        INSERT INTO auto_reactions (guild_id, target_id, target_type, emoji)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, target_id, emoji) DO NOTHING
        RETURNING *;
    `;
    const res = await db.query(query, [guildId, targetId, targetType, emoji]);
    return res.rows[0];
}

// Remove an auto-reaction
async function removeAutoReaction(guildId, targetId, emoji) {
    const query = `
        DELETE FROM auto_reactions
        WHERE guild_id = $1 AND target_id = $2 AND emoji = $3
        RETURNING *;
    `;
    const res = await db.query(query, [guildId, targetId, emoji]);
    return res.rows[0];
}

// Get all auto-reactions for a guild
async function getAutoReactionsForGuild(guildId) {
    const query = 'SELECT * FROM auto_reactions WHERE guild_id = $1';
    const res = await db.query(query, [guildId]);
    return res.rows;
}

module.exports = {
    addAutoReaction,
    removeAutoReaction,
    getAutoReactionsForGuild,
};
