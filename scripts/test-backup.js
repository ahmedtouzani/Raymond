const { Pool } = require('pg');
const { createBackup, restoreBackup, listBackups } = require('../src/utils/dbBackup');
const logger = require('../src/utils/logger');

// Parse the database URL
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Extract database name from URL
const dbName = new URL(dbUrl).pathname.replace(/^\/+/, '');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: false
});

async function testBackupRestore() {
  let client;
  try {
    // Connect to the database
    client = await pool.connect();
    
    // Step 1: Create a test table and insert some data
    console.log('\n🔧 Creating test data...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_backup (
        id SERIAL PRIMARY KEY, 
        name TEXT, 
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Insert test data
    await client.query(
      'INSERT INTO test_backup (name) VALUES ($1), ($2), ($3)',
      ['Test 1', 'Test 2', 'Test 3']
    );
    
    // Verify data was inserted
    const result = await client.query('SELECT * FROM test_backup');
    console.log('📊 Test data created:', result.rows);
    
    // Step 2: Create a backup
    console.log('\n💾 Creating backup...');
    const backup = await createBackup();
    if (!backup.success) {
      throw new Error(`Backup failed: ${backup.error}`);
    }
    console.log(`✅ Backup created: ${backup.filePath}`);
    
    // Step 3: Delete the test data
    console.log('\n🗑️  Deleting test data...');
    await client.query('DELETE FROM test_backup');
    
    // Verify data was deleted
    const emptyResult = await client.query('SELECT * FROM test_backup');
    console.log('📊 Test data after deletion:', emptyResult.rows);
    
    // Step 4: Restore from backup
    console.log('\n🔄 Restoring from backup...');
    const backupName = backup.filePath.split(/[\\/]/).pop();
    const restore = await restoreBackup(backupName);
    if (!restore.success) {
      throw new Error(`Restore failed: ${restore.error}`);
    }
    
    // Step 5: Verify data was restored
    console.log('\n🔍 Verifying restored data...');
    const restoredResult = await client.query('SELECT * FROM test_backup');
    console.log('📊 Restored data:', restoredResult.rows);
    
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await client.query('DROP TABLE IF EXISTS test_backup');
    
    console.log('\n✅ Backup and restore test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run the test
testBackupRestore();
