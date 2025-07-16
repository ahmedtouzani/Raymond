const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const logger = require('./logger');

async function backupDatabase() {
  const backupDir = path.join(__dirname, '../../backups');
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  const backupPath = path.join(backupDir, `backup_${timestamp}.sql`);
  
  try {
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Get all data
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // Create backup of guild_configs
      const { rows } = await client.query('SELECT * FROM guild_configs');
      
      // Prepare backup content
      const backupContent = [
        `-- Database Backup ${timestamp}`,
        `-- Total guilds: ${rows.length}\n`,
        'BEGIN;\n',
        '-- Drop existing backup table if exists',
        'DROP TABLE IF EXISTS guild_configs_backup;\n',
        '-- Create backup table',
        'CREATE TABLE guild_configs_backup AS TABLE guild_configs;\n',
        '-- Insert current data',
        'TRUNCATE guild_configs_backup;',
        ...rows.map(row => 
          `INSERT INTO guild_configs_backup (guild_id, prefix, settings, created_at, updated_at) ` +
          `VALUES ('${row.guild_id}', '${String(row.prefix || '').replace(/'/g, "''")}', ` +
          `'${JSON.stringify(row.settings || {}).replace(/'/g, "''")}', ` +
          `'${row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()}', ` +
          `'${row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()}');`
        ),
        '\nCOMMIT;'
      ].join('\n');

      // Write to file
      fs.writeFileSync(backupPath, backupContent);

      await client.query('COMMIT');
      logger.info(`✅ Backup created at: ${backupPath}`);
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    logger.error('❌ Backup failed:', error);
    return false;
  }
}

module.exports = { backupDatabase };
