const { Pool } = require('pg');
require('dotenv').config();

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.co')
            ? { rejectUnauthorized: false }
            : undefined,
    });

    try {
        console.log('🔌 Connecting to database...');

        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');

        console.log('📝 Creating user_preferences table...');

        await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rank_card_theme TEXT DEFAULT 'dark',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      );
    `);

        console.log('✅ user_preferences table created');

        console.log('📝 Creating index...');

        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_preferences_lookup 
      ON user_preferences(guild_id, user_id);
    `);

        console.log('✅ Index created');
        console.log('🎉 Migration completed successfully!');

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Full error:', error);
        await pool.end();
        process.exit(1);
    }
}

runMigration();
