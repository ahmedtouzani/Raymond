const fs = require('fs').promises;
require('dotenv').config();
const { Pool } = require('pg');
const { parse } = require('pg-connection-string');
const path = require('path');
const logger = require('./logger');
const { getDatabaseOptions } = require('../config/database');

const BACKUP_DIR = path.join(__dirname, '../../backups');

// Database connection pool
let pool;

/**
 * Initialize the database connection
 */
async function initDb() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    pool = new Pool(getDatabaseOptions(dbUrl));
    
    // Test the connection
    await pool.query('SELECT NOW()');
    logger.info('✅ Database connection for backup utility is working');
    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize database connection for backup utility:', error);
    throw error;
  }
}

// Database connection state
let dbInitialized = false;
let dbInitPromise = null;

/**
 * Get the database pool, ensuring it's initialized
 * @returns {Promise<import('pg').Pool>}
 */
async function getPool() {
  if (dbInitialized) {
    return pool;
  }
  
  if (!dbInitPromise) {
    dbInitPromise = initDb().then(() => {
      dbInitialized = true;
      return pool;
    });
  }
  
  return dbInitPromise;
}

// Start initializing the database
getPool().catch(error => {
  logger.error('Fatal error initializing database:', error);
  process.exit(1);
});

/**
 * Creates a backup of the database
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
 */
async function createBackup() {
  let client;
  try {
    // Create backups directory if it doesn't exist
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);
    
    // Get database pool and connect
    const dbPool = await getPool();
    client = await dbPool.connect();
    
    // Get all table names
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `;
    
    const tablesResult = await client.query(tablesQuery);
    const backupData = {};
    
    // Backup each table
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      try {
        // Get table structure
        const structureQuery = `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 
          ORDER BY ordinal_position;
        `;
        
        const structureResult = await client.query(structureQuery, [tableName]);
        
        // Get table data
        const dataResult = await client.query(`SELECT * FROM "${tableName}"`);
        
        backupData[tableName] = {
          structure: structureResult.rows,
          data: dataResult.rows
        };
      } catch (error) {
        logger.warn(`Error backing up table ${tableName}:`, error);
        backupData[tableName] = { error: error.message };
      }
    }
    
    // Write backup to file
    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
    
    logger.info(`✅ Database backup created: ${backupPath}`);
    return { success: true, filePath: backupPath };
  } catch (error) {
    logger.error('❌ Failed to create database backup:', error);
    return { 
      success: false, 
      error: error.message,
      stack: error.stack 
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Lists all available backups
 * @returns {Promise<{success: boolean, backups?: Array<{name: string, path: string, size: string}>, error?: string}>}
 */
async function listBackups() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(BACKUP_DIR);
    
    const backups = await Promise.all(
      files
        .filter(file => file.startsWith('backup-') && file.endsWith('.json'))
        .map(async (file) => {
          try {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = await fs.stat(filePath);
            return {
              name: file,
              path: filePath,
              size: formatFileSize(stats.size),
              modified: stats.mtime
            };
          } catch (error) {
            logger.warn(`Error getting stats for ${file}:`, error);
            return null;
          }
        })
    );
    
    // Filter out nulls and sort by modified time (newest first)
    const validBackups = backups.filter(Boolean).sort((a, b) => b.modified - a.modified);
    
    return { success: true, backups: validBackups };
  } catch (error) {
    logger.error('❌ Failed to list backups:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Restores a database from a backup
 * @param {string} backupName - Name of the backup file to restore
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function restoreBackup(backupName) {
  const backupPath = path.join(BACKUP_DIR, backupName);
  let client;
  
  try {
    // Verify backup exists
    await fs.access(backupPath);
    
    // Read backup file
    const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    
    const dbPool = await getPool();
    client = await dbPool.connect();
    
    // Start transaction
    await client.query('BEGIN');
    
    // Restore each table
    for (const [tableName, tableData] of Object.entries(backupData)) {
      if (tableData.error) {
        logger.warn(`Skipping table ${tableName} due to previous error:`, tableData.error);
        continue;
      }
      
      try {
        // Truncate existing data if table exists
        await client.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
        
        // Insert data
        if (tableData.data && tableData.data.length > 0) {
          const columns = Object.keys(tableData.data[0]);
          const values = tableData.data.map(row => 
            columns.map(col => row[col])
          );
          
          const placeholders = tableData.data.map(
            (_, rowIdx) => `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`
          ).join(', ');
          
          const query = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES ${placeholders}
          `;
          
          await client.query(query, values.flat());
        }
        
        logger.info(`✅ Restored table: ${tableName} (${tableData.data?.length || 0} rows)`);
      } catch (error) {
        logger.error(`❌ Error restoring table ${tableName}:`, error);
        throw error; // This will trigger the rollback
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    logger.info(`✅ Database restored from backup: ${backupName}`);
    return { success: true };
  } catch (error) {
    // Rollback on error
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Error during rollback:', rollbackError);
      }
    }
    
    logger.error(`❌ Failed to restore backup ${backupName}:`, error);
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Formats file size in a human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Deletes old backups, keeping only the most recent N backups
 * @param {number} keep - Number of most recent backups to keep
 * @returns {Promise<{success: boolean, deleted: number, error?: string}>}
 */
async function cleanupOldBackups(keep = 5) {
  try {
    const { success, backups } = await listBackups();
    if (!success || !backups) {
      throw new Error('Failed to list backups');
    }
    
    if (backups.length <= keep) {
      return { success: true, deleted: 0 };
    }
    
    const backupsToDelete = backups.slice(keep);
    let deletedCount = 0;
    
    for (const backup of backupsToDelete) {
      try {
        await fs.unlink(backup.path);
        logger.info(`Deleted old backup: ${backup.name}`);
        deletedCount++;
      } catch (delError) {
        logger.error(`Failed to delete backup ${backup.name}:`, delError);
      }
    }
    
    return { 
      success: true, 
      deleted: deletedCount 
    };
  } catch (error) {
    logger.error('❌ Failed to clean up old backups:', error);
    return { 
      success: false, 
      error: error.message,
      deleted: 0
    };
  }
}

// Create a backup on module load if in production
if (process.env.NODE_ENV === 'production') {
  createBackup()
    .then(() => cleanupOldBackups())
    .catch(error => 
      logger.error('Automatic backup failed:', error)
    );
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  cleanupOldBackups,
  getPool, // Exported for testing
  BACKUP_DIR
};
