#!/usr/bin/env node

const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createBackup, cleanupOldBackups } = require('../src/utils/dbBackup');
const logger = require('../src/utils/logger');
const fs = require('fs').promises;

// Maximum number of backups to keep
const MAX_BACKUPS = 7; // Keep one week of daily backups

/**
 * Run the scheduled backup
 */
async function runScheduledBackup() {
  try {
    logger.info('🚀 Starting scheduled database backup...');
    
    // Create a new backup
    const backup = await createBackup();
    if (!backup.success) {
      throw new Error(backup.error);
    }
    
    logger.info(`✅ Backup created: ${backup.filePath}`);
    
    // Clean up old backups
    const cleanup = await cleanupOldBackups(MAX_BACKUPS);
    if (!cleanup.success) {
      throw new Error(cleanup.error);
    }
    
    if (cleanup.deleted && cleanup.deleted.length > 0) {
      logger.info(`♻️  Cleaned up ${cleanup.deleted.length} old backups`);
    }
    
    logger.info('✅ Scheduled backup completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Scheduled backup failed:', error);
    process.exit(1);
  }
}

// Run the backup
runScheduledBackup();
