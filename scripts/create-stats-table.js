require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && (
        process.env.DATABASE_URL.includes('supabase.co') ||
        process.env.DATABASE_URL.includes('railway')
    )
        ? { rejectUnauthorized: false }
        : undefined,
});

async function createStatsTable() {
    try {
        console.log('Creating stats_channels table...');

        await pool.query(`
      CREATE TABLE IF NOT EXISTS stats_channels (
        guild_id VARCHAR(32) PRIMARY KEY,
        member_count_channel_id VARCHAR(32),
        voice_count_channel_id VARCHAR(32),
        member_count_format VARCHAR(100) DEFAULT '👥 Members: {count}',
        voice_count_format VARCHAR(100) DEFAULT '🎤 In Voice: {count}',
        last_member_update TIMESTAMP,
        last_voice_update TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log('✅ Table created successfully');

        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stats_channels_guild ON stats_channels(guild_id);
    `);

        console.log('✅ Index created successfully');

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await pool.end();
        process.exit(1);
    }
}

createStatsTable();
