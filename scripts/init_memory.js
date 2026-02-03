require('dotenv').config();
const db = require('../src/services/database');
const { Client } = require('pg'); // Assuming pg is used, but db wrapper handles it.

async function initMemory() {
    console.log('--- Initializing AI Memory Table ---');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS ai_memory (
                id SERIAL PRIMARY KEY,
                key TEXT,
                value TEXT NOT NULL,
                created_by TEXT,
                last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table "ai_memory" created/verified.');

        // Test Insert
        const testValue = "System Initialization Test: Memory Online.";
        const result = await db.query(
            'INSERT INTO ai_memory (value, created_by) VALUES ($1, $2) RETURNING *',
            [testValue, 'SYSTEM']
        );
        console.log('✅ Test memory inserted:', result.rows[0]);

        // Cleanup
        await db.query('DELETE FROM ai_memory WHERE value = $1', [testValue]);
        console.log('✅ Test memory cleaned up.');

        console.log('--- Success: Brain is compatible. ---');
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to initialize memory:', error);
        process.exit(1);
    }
}

initMemory();
