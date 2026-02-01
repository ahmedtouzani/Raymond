const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🔄 Starting force_theme migration...');

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'migrations', 'add_force_theme.sql'),
            'utf8'
        );

        await client.query(migrationSQL);

        console.log('✅ Migration completed successfully!');
        console.log('   - Added force_theme column to guild_level_settings');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(console.error);
