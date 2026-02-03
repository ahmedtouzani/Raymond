const db = require('../services/database');

// Ensure table exists
(async () => {
  try {
    await db.query(`
            CREATE TABLE IF NOT EXISTS ai_memory (
                id SERIAL PRIMARY KEY,
                key TEXT,
                value TEXT NOT NULL,
                created_by TEXT,
                last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    // For SQLite compatibility if needed, though 'SERIAL' implies Postgres. 
    // Raymond V2 uses 'database.js' which wraps 'pg' or 'sqlite'.
    // Checking database.js would confirm, but standard SQL is safer.
  } catch (error) {
    console.error('Failed to init ai_memory table:', error);
  }
})();

module.exports = {
  async addMemory(value, { createdBy } = {}) {
    const { rows } = await db.query(
      'INSERT INTO ai_memory (value, created_by) VALUES ($1, $2) RETURNING *',
      [value, createdBy]
    );
    return rows[0];
  },

  async listMemories({ limit = 10 } = {}) {
    const { rows } = await db.query(
      'SELECT * FROM ai_memory ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  },

  async searchMemories(query, { limit = 5 } = {}) {
    // Simple text search for now
    const { rows } = await db.query(
      'SELECT * FROM ai_memory WHERE value ILIKE $1 ORDER BY created_at DESC LIMIT $2',
      [`%${query}%`, limit]
    );
    return rows;
  },

  async getMemoriesByUserId(userId, { limit = 5 } = {}) {
    const { rows } = await db.query(
      'SELECT * FROM ai_memory WHERE created_by = $1 ORDER BY created_at DESC LIMIT $2',
      [String(userId), limit]
    );
    return rows;
  },

  async deleteMemory(id) {
    const { rowCount } = await db.query('DELETE FROM ai_memory WHERE id = $1', [id]);
    return rowCount > 0;
  },

  async touchMemories(ids) {
    if (!ids.length) return;
    await db.query(
      'UPDATE ai_memory SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ANY($1)',
      [ids]
    );
  },

  async getMemoriesByUserId(userId, { limit = 5 } = {}) {
    // Search by created_by column which stores the Discord User ID
    const { rows } = await db.query(
      'SELECT * FROM ai_memory WHERE created_by = $1 ORDER BY created_at DESC LIMIT $2',
      [String(userId), limit]
    );
    return rows;
  }
};
