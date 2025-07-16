const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('../src/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

class Migrator {
  constructor() {
    if (!process.env.DATABASE_URL) {
      logger.error('❌ DATABASE_URL environment variable is not set.');
      throw new Error('DATABASE_URL is not defined.');
    }
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async connect() {
    try {
      await this.pool.connect();
      logger.info('✅ Database connection for migrator is successful.');
    } catch (error) {
      logger.error('❌ Database connection for migrator failed:', error);
      throw error;
    }
  }

  async ensureMigrationsTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    logger.info(`✅ '${MIGRATIONS_TABLE}' table ensured.`);
  }

  async getExecutedMigrations() {
    const { rows } = await this.pool.query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`);
    return new Set(rows.map(row => row.name));
  }

  async run() {
    await this.connect();
    await this.ensureMigrationsTable();

    const executedMigrations = await this.getExecutedMigrations();
    const migrationFiles = (await fs.readdir(MIGRATIONS_DIR))
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      logger.info('No migration files found.');
      return;
    }

    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (executedMigrations.has(file)) {
        continue;
      }

      logger.info(`🔄 Applying migration: ${file}...`);
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        logger.info(`✅ Migration ${file} applied successfully.`);
        appliedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`❌ Failed to apply migration ${file}:`, error);
        throw error;
      } finally {
        client.release();
      }
    }

    if (appliedCount === 0) {
      logger.info('Database schema is already up to date.');
    } else {
      logger.info(`Applied ${appliedCount} new migration(s).`);
    }
  }

  async close() {
    await this.pool.end();
  }
}

if (require.main === module) {
  const migrator = new Migrator();
  migrator.run()
    .then(() => {
      logger.info('Migrations completed.');
    })
    .catch(error => {
      logger.error('Migration process failed.', error);
      process.exit(1);
    })
    .finally(() => migrator.close());
}

module.exports = Migrator;
