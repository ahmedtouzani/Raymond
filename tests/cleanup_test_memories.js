/**
 * Clean up duplicate test memories
 */

require('dotenv').config();

async function cleanup() {
    const { Pool } = require('pg');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    console.log('\n🧹 Cleaning up duplicate test memories...\n');

    // Delete test memories
    const result = await pool.query(`
        DELETE FROM ai_memories 
        WHERE guild_id IN ('1234567890', '9876543210', '716381717589393499')
        RETURNING id, value
    `);

    console.log(`Deleted ${result.rowCount} test memories:\n`);
    result.rows.forEach(m => {
        console.log(`  ❌ [ID: ${m.id}] ${m.value}`);
    });

    console.log('\n✅ Database cleaned! Ready for fresh test.\n');

    await pool.end();
    process.exit(0);
}

cleanup().catch(console.error);
