const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('../src/utils/logger');
const { getDatabaseOptions } = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

function orderMigrations(files) {
  const dependencies = { 'add_force_theme.sql': ['add_guild_level_settings.sql'],
    '20261015020000_leveling_signature.sql': ['add_guild_level_settings.sql'] };
  const ordered = [], visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    for (const dependency of dependencies[file] || []) {
      if (!files.includes(dependency)) throw new Error(`Missing migration dependency: ${dependency}`);
      visit(dependency);
    }
    visited.add(file); ordered.push(file);
  }
  for (const file of [...files].sort()) visit(file);
  return ordered;
}

// Historical files wrap themselves in BEGIN/COMMIT. The runner owns the transaction.
function migrationSql(sql) {
  const boundaries = [...sql.matchAll(/^[ \t]*(BEGIN|COMMIT);[ \t]*$/gm)];
  if (boundaries.length && (boundaries.length !== 2 || boundaries[0][1] !== 'BEGIN' || boundaries[1][1] !== 'COMMIT')) {
    throw new Error('Unsupported migration transaction boundaries');
  }
  return sql.replace(/^[ \t]*(?:BEGIN|COMMIT);[ \t]*$/gm, '');
}

class Migrator {
  constructor() {
    if (!process.env.DATABASE_URL) {
      logger.error('❌ DATABASE_URL environment variable is not set.');
      throw new Error('DATABASE_URL is not defined.');
    }
    this.pool = new Pool(getDatabaseOptions(process.env.DATABASE_URL, process.env));
  }

  async connect() {
    try {
      await this.pool.query('SELECT 1');
      logger.info('✅ Database connection for migrator is successful.');
    } catch (error) {
      logger.error('❌ Database connection for migrator failed:', error);
      throw error;
    }
  }

  async ensureMigrationsTable(client = this.pool) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    logger.info(`✅ '${MIGRATIONS_TABLE}' table ensured.`);
  }

  async getExecutedMigrations(client = this.pool) {
    const { rows } = await client.query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`);
    return new Set(rows.map(row => row.name));
  }

  async run() {
    await this.connect();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The transaction lock is released automatically on commit, rollback or
      // disconnect, and works with transaction-pooled PostgreSQL connections.
      await client.query('SELECT pg_advisory_xact_lock($1)', [1460237138]);
      await this.ensureMigrationsTable(client);
      const executedMigrations = await this.getExecutedMigrations(client);
      const migrationFiles = orderMigrations((await fs.readdir(MIGRATIONS_DIR))
        .filter(file => file.endsWith('.sql')));
      let appliedCount = 0;
      for (const file of migrationFiles) {
        if (executedMigrations.has(file)) continue;
        logger.info(`🔄 Applying migration: ${file}...`);
        const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        await client.query(migrationSql(sql));
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [file]);
        appliedCount++;
      }
      await client.query('COMMIT');
      if (appliedCount) logger.info(`Committed ${appliedCount} new migration(s).`);
      else logger.info('Database schema is already up to date.');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Migration batch failed and was rolled back:', error);
      throw error;
    } finally {
      client.release();
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
      process.exitCode = 1;
    })
    .finally(() => migrator.close());
}

module.exports = Migrator;
module.exports.orderMigrations = orderMigrations;
module.exports.migrationSql = migrationSql;
