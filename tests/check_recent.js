/**
 * Check ALL recent memories to see what was actually stored
 */

require('dotenv').config();

async function checkAllRecent() {
    const { Pool } = require('pg');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    console.log('\n🔍 Checking recent memories (any guild)...\n');

    const { rows } = await pool.query(`
        SELECT id, value, guild_id, created_by, created_at 
        FROM ai_memories 
        WHERE id >= 76
        ORDER BY id DESC
        LIMIT 10
    `);

    console.log(`Found ${rows.length} recent memories:\n`);
    rows.forEach(m => {
        console.log(`  [ID: ${m.id}] ${m.value}`);
        console.log(`    Guild: ${m.guild_id}`);
        console.log(`    CreatedBy: ${m.created_by}`);
        console.log(`    Created: ${m.created_at}\n`);
    });

    await pool.end();
    process.exit(0);
}

checkAllRecent().catch(console.error);
