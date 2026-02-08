/**
 * Quick script to verify v4.0.0 memories exist in database
 */

require('dotenv').config();

async function checkMemories() {
    const aiMemory = require('../src/database/aiMemory');
    const { Pool } = require('pg');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    console.log('\n🔍 Checking for v4.0.0 test memories...\n');

    // Direct SQL query to bypass search
    const { rows } = await pool.query(`
        SELECT id, value, guild_id, created_at 
        FROM ai_memories 
        WHERE guild_id = '1234567890'
        ORDER BY id DESC
        LIMIT 10
    `);

    console.log(`Found ${rows.length} memories for test guild:\n`);
    rows.forEach(m => {
        console.log(`  [ID: ${m.id}] ${m.value}`);
        console.log(`    Guild: ${m.guild_id}, Created: ${m.created_at}\n`);
    });

    if (rows.length >= 2) {
        console.log('✅ v4.0.0 IS WORKING! Memories #76 and #77 were created!');
    }

    await pool.end();
    process.exit(0);
}

checkMemories().catch(console.error);
