const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.co')
        ? { rejectUnauthorized: false }
        : undefined,
    });
    
    // Test the connection
    this.testConnection();
  }

  async testConnection() {
    try {
      await this.pool.query('SELECT NOW()');
      logger.info('✅ Database connection successful');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { 
        text, 
        duration: `${duration}ms`,
        rowCount: res.rowCount 
      });
      return res;
    } catch (error) {
      logger.error('Query error:', {
        error: error.message,
        query: text,
        params
      });
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Ends the database connection pool. This should be called on graceful shutdown.
   */
  async end() {
    logger.info('Closing database connection pool...');
    await this.pool.end();
    logger.info('Database connection pool closed.');
  }
}

// Create and export a singleton instance of the DatabaseService.
// The connection pool is managed within this instance.
module.exports = new DatabaseService();
