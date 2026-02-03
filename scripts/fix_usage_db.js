require('dotenv').config();
const db = require('../src/services/database');

async function fixUsage() {
    console.log('--- Fixing AI Usage Table ---');
    try {
        console.log('Dropping old table...');
        await db.query('DROP TABLE IF EXISTS ai_chat_usage');

        console.log('Creating new table...');
        await db.query(`
            CREATE TABLE ai_chat_usage (
                guild_id TEXT,
                user_id TEXT,
                usage_count INTEGER DEFAULT 0,
                last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id)
            )
        `);
        console.log('✅ Table "ai_chat_usage" reset successfully.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to fix usage table:', error);
        process.exit(1);
    }
}

fixUsage();
