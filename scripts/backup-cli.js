#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const { createBackup, listBackups, restoreBackup, cleanupOldBackups } = require('../src/utils/dbBackup');
const logger = require('../src/utils/logger');

program
  .name('db-backup')
  .description('CLI tool to manage database backups')
  .version('1.0.0');

// Create a new backup
program
  .command('create')
  .description('Create a new database backup')
  .action(async () => {
    console.log('🔄 Creating database backup...');
    const result = await createBackup();
    
    if (result.success) {
      console.log(`✅ Backup created successfully: ${result.filePath}`);
    } else {
      console.error('❌ Failed to create backup:');
      console.error(result.error);
      if (result.stack) {
        console.error(result.stack);
      }
      process.exit(1);
    }
  });

// List all backups
program
  .command('list')
  .description('List all available backups')
  .action(async () => {
    console.log('📋 Listing all backups:');
    const result = await listBackups();
    
    if (result.success) {
      if (result.backups && result.backups.length > 0) {
        result.backups.forEach((backup, index) => {
          console.log(`\n📄 ${index + 1}. ${backup.name}`);
          console.log(`   Size: ${backup.size}`);
          console.log(`   Modified: ${backup.modified.toLocaleString()}`);
          console.log(`   Path: ${backup.path}`);
        });
      } else {
        console.log('No backups found.');
      }
    } else {
      console.error('❌ Failed to list backups:');
      console.error(result.error);
      process.exit(1);
    }
  });

// Restore from a backup
program
  .command('restore <backupName>')
  .description('Restore database from a backup')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (backupName, options) => {
    if (!options.yes) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question('⚠️  WARNING: This will overwrite your current database. Are you sure? (y/N) ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('Restore cancelled.');
        return;
      }
    }

    console.log(`🔄 Restoring from backup: ${backupName}...`);
    const result = await restoreBackup(backupName);
    
    if (result.success) {
      console.log('✅ Database restored successfully!');
    } else {
      console.error('❌ Failed to restore backup:');
      console.error(result.error);
      process.exit(1);
    }
  });

// Clean up old backups
program
  .command('cleanup')
  .description('Clean up old backups, keeping only the most recent ones')
  .option('-k, --keep <number>', 'Number of most recent backups to keep', '5')
  .action(async (options) => {
    const keep = parseInt(options.keep, 10);
    if (isNaN(keep) || keep < 1) {
      console.error('❌ Please provide a valid number of backups to keep (minimum 1)');
      process.exit(1);
    }

    console.log(`🧹 Cleaning up old backups, keeping the most recent ${keep}...`);
    const result = await cleanupOldBackups(keep);
    
    if (result.success) {
      if (result.deleted > 0) {
        console.log(`✅ Cleaned up ${result.deleted} old backup(s).`);
      } else {
        console.log('ℹ️  No old backups to clean up.');
      }
    } else {
      console.error('❌ Failed to clean up old backups:');
      console.error(result.error);
      process.exit(1);
    }
  });

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}

program.parse(process.argv);
