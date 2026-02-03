const db = require('../services/database');

// Ensure table exists
(async () => {
  try {
    await db.query(`
            CREATE TABLE IF NOT EXISTS ai_chat_usage (
                guild_id TEXT,
                user_id TEXT,
                usage_count INTEGER DEFAULT 0,
                last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id)
            )
        `);
  } catch (error) {
    console.error('Failed to init ai_chat_usage table:', error);
  }
})();

module.exports = {
  async getUsageCount(guildId, userId) {
    // Check if reset is needed (daily)
    const { rows } = await db.query(
      'SELECT * FROM ai_chat_usage WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );

    if (!rows.length) return 0;

    const row = rows[0];
    const lastReset = new Date(row.last_reset_at);
    const now = new Date();

    // Reset if it's a new day
    if (lastReset.getDate() !== now.getDate() || lastReset.getMonth() !== now.getMonth()) {
      await db.query(
        'UPDATE ai_chat_usage SET usage_count = 0, last_reset_at = CURRENT_TIMESTAMP WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
      );
      return 0;
    }

    return row.usage_count;
  },

  async incrementUsage(guildId, userId) {
    // Upsert logic
    await db.query(`
            INSERT INTO ai_chat_usage (guild_id, user_id, usage_count, last_reset_at)
            VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
            ON CONFLICT (guild_id, user_id)
            DO UPDATE SET usage_count = ai_chat_usage.usage_count + 1
        `, [guildId, userId]);
  }
};
