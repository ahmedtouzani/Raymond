const { Client } = require('pg');
require('dotenv').config();

/**
 * Migration script for guild_level_settings table
 * Run this script to add server-wide level system customization
 */
async function migrateGuildLevelSettings() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🔄 Connecting to database...');
        await client.connect();
        console.log('✅ Connected to database');

        console.log('🔄 Creating guild_level_settings table...');

        const migrationSQL = `
      -- Migration: Add guild_level_settings table
      CREATE TABLE IF NOT EXISTS guild_level_settings (
        guild_id TEXT PRIMARY KEY,
        
        -- Theme Settings
        theme_preset TEXT DEFAULT 'dark' CHECK (theme_preset IN ('dark', 'light', 'neon', 'gradient', 'custom')),
        custom_theme JSONB DEFAULT NULL,
        
        -- XP Settings
        xp_multiplier DECIMAL(3,2) DEFAULT 1.0 CHECK (xp_multiplier >= 0.5 AND xp_multiplier <= 5.0),
        text_xp_min INTEGER DEFAULT 15 CHECK (text_xp_min >= 1),
        text_xp_max INTEGER DEFAULT 25 CHECK (text_xp_max >= text_xp_min),
        voice_xp_rate INTEGER DEFAULT 10 CHECK (voice_xp_rate >= 1),
        xp_cooldown INTEGER DEFAULT 60 CHECK (xp_cooldown >= 0),
        excluded_channels TEXT[] DEFAULT '{}',
        
        -- Level-Up Settings
        levelup_enabled BOOLEAN DEFAULT false,
        levelup_channel_id TEXT DEFAULT NULL,
        levelup_message TEXT DEFAULT 'Congratulations {user}! You reached level {level}!',
        levelup_include_card BOOLEAN DEFAULT true,
        
        -- Role Rewards
        role_rewards JSONB DEFAULT '{}',
        role_rewards_remove_previous BOOLEAN DEFAULT false,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Create index
      CREATE INDEX IF NOT EXISTS idx_guild_level_settings_guild_id ON guild_level_settings(guild_id);

      -- Create trigger function
      CREATE OR REPLACE FUNCTION update_guild_level_settings_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger
      DROP TRIGGER IF EXISTS trigger_update_guild_level_settings_timestamp ON guild_level_settings;
      CREATE TRIGGER trigger_update_guild_level_settings_timestamp
      BEFORE UPDATE ON guild_level_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_guild_level_settings_timestamp();
    `;

        await client.query(migrationSQL);
        console.log('✅ guild_level_settings table created successfully');

        // Verify table exists
        const { rows } = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'guild_level_settings'
      ORDER BY ordinal_position;
    `);

        console.log('\n📋 Table structure:');
        rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})`);
        });

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run migration
migrateGuildLevelSettings();
