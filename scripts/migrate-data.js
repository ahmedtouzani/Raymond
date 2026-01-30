const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('../src/utils/logger');

/**
 * Data Migration Script: Supabase → Railway
 * 
 * This script helps you migrate data from your old Supabase database to the new Railway database.
 * 
 * USAGE:
 * 1. Set OLD_DATABASE_URL environment variable to your Supabase connection string
 * 2. Ensure DATABASE_URL points to your new Railway database
 * 3. Run: node scripts/migrate-data.js
 */

const OLD_DB_URL = process.env.OLD_DATABASE_URL;
const NEW_DB_URL = process.env.DATABASE_URL;

if (!OLD_DB_URL) {
    console.error('❌ OLD_DATABASE_URL environment variable is not set.');
    console.log('\n📝 To use this script:');
    console.log('   1. Add OLD_DATABASE_URL to your .env file with your Supabase connection string');
    console.log('   2. Run: node scripts/migrate-data.js\n');
    process.exit(1);
}

if (!NEW_DB_URL) {
    console.error('❌ DATABASE_URL environment variable is not set.');
    process.exit(1);
}

// Tables to migrate (in order of dependencies)
const TABLES_TO_MIGRATE = [
    'guild_configs',
    'premium_guilds',
    'user_warnings',
    'jail_settings',
    'jailed_users',
    'guild_auto_roles',
    'temp_voice_configs',
    'temp_voice_channels',
    'auto_reactions',
    'user_levels',
    'level_roles',
    'role_menus',
    'role_menu_options',
    'infractions'
];

class DataMigrator {
    constructor() {
        this.oldPool = new Pool({
            connectionString: OLD_DB_URL,
            ssl: OLD_DB_URL.includes('supabase.co') ? { rejectUnauthorized: false } : undefined
        });

        this.newPool = new Pool({
            connectionString: NEW_DB_URL,
            ssl: NEW_DB_URL.includes('railway') ? { rejectUnauthorized: false } : undefined
        });
    }

    async connect() {
        try {
            await this.oldPool.query('SELECT NOW()');
            logger.info('✅ Connected to OLD database (Supabase)');
        } catch (error) {
            logger.error('❌ Failed to connect to OLD database:', error);
            throw error;
        }

        try {
            await this.newPool.query('SELECT NOW()');
            logger.info('✅ Connected to NEW database (Railway)');
        } catch (error) {
            logger.error('❌ Failed to connect to NEW database:', error);
            throw error;
        }
    }

    async checkTableExists(pool, tableName) {
        const { rows } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
        return rows[0].exists;
    }

    async getTableColumns(pool, tableName) {
        const { rows } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
        return rows.map(r => r.column_name);
    }

    async migrateTable(tableName) {
        logger.info(`\n🔄 Migrating table: ${tableName}...`);

        // Check if table exists in old database
        const existsInOld = await this.checkTableExists(this.oldPool, tableName);
        if (!existsInOld) {
            logger.warn(`⚠️  Table '${tableName}' does not exist in old database. Skipping.`);
            return { skipped: true, reason: 'not_found_in_source' };
        }

        // Check if table exists in new database
        const existsInNew = await this.checkTableExists(this.newPool, tableName);
        if (!existsInNew) {
            logger.warn(`⚠️  Table '${tableName}' does not exist in new database. Skipping.`);
            return { skipped: true, reason: 'not_found_in_destination' };
        }

        // Get column names from both databases
        const oldColumns = await this.getTableColumns(this.oldPool, tableName);
        const newColumns = await this.getTableColumns(this.newPool, tableName);

        // Find common columns
        const commonColumns = oldColumns.filter(col => newColumns.includes(col));

        if (commonColumns.length === 0) {
            logger.warn(`⚠️  No common columns found for table '${tableName}'. Skipping.`);
            return { skipped: true, reason: 'no_common_columns' };
        }

        // Fetch data from old database
        const { rows: oldData } = await this.oldPool.query(`SELECT ${commonColumns.join(', ')} FROM ${tableName}`);

        if (oldData.length === 0) {
            logger.info(`ℹ️  Table '${tableName}' is empty in old database. Nothing to migrate.`);
            return { migrated: 0 };
        }

        logger.info(`📊 Found ${oldData.length} rows to migrate`);

        // Insert data into new database
        let migrated = 0;
        let failed = 0;

        for (const row of oldData) {
            try {
                const values = commonColumns.map(col => row[col]);
                const placeholders = commonColumns.map((_, i) => `$${i + 1}`).join(', ');

                await this.newPool.query(
                    `INSERT INTO ${tableName} (${commonColumns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                    values
                );
                migrated++;
            } catch (error) {
                logger.error(`❌ Failed to insert row into ${tableName}:`, error.message);
                failed++;
            }
        }

        logger.info(`✅ Migrated ${migrated} rows from '${tableName}' (${failed} failed)`);
        return { migrated, failed };
    }

    async run() {
        await this.connect();

        logger.info('\n🚀 Starting data migration from Supabase to Railway...\n');
        logger.info(`📋 Tables to migrate: ${TABLES_TO_MIGRATE.length}`);

        const results = {};

        for (const table of TABLES_TO_MIGRATE) {
            try {
                results[table] = await this.migrateTable(table);
            } catch (error) {
                logger.error(`❌ Error migrating table '${table}':`, error);
                results[table] = { error: error.message };
            }
        }

        // Summary
        logger.info('\n' + '='.repeat(60));
        logger.info('📊 MIGRATION SUMMARY');
        logger.info('='.repeat(60));

        let totalMigrated = 0;
        let totalFailed = 0;
        let totalSkipped = 0;

        for (const [table, result] of Object.entries(results)) {
            if (result.skipped) {
                logger.info(`⏭️  ${table}: SKIPPED (${result.reason})`);
                totalSkipped++;
            } else if (result.error) {
                logger.error(`❌ ${table}: ERROR - ${result.error}`);
            } else {
                logger.info(`✅ ${table}: ${result.migrated} rows migrated${result.failed ? ` (${result.failed} failed)` : ''}`);
                totalMigrated += result.migrated || 0;
                totalFailed += result.failed || 0;
            }
        }

        logger.info('='.repeat(60));
        logger.info(`Total rows migrated: ${totalMigrated}`);
        logger.info(`Total rows failed: ${totalFailed}`);
        logger.info(`Total tables skipped: ${totalSkipped}`);
        logger.info('='.repeat(60) + '\n');
    }

    async close() {
        await this.oldPool.end();
        await this.newPool.end();
        logger.info('✅ Database connections closed');
    }
}

if (require.main === module) {
    const migrator = new DataMigrator();
    migrator.run()
        .then(() => {
            logger.info('✅ Data migration completed successfully!');
        })
        .catch(error => {
            logger.error('❌ Data migration failed:', error);
            process.exit(1);
        })
        .finally(() => migrator.close());
}

module.exports = DataMigrator;
