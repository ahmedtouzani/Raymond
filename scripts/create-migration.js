const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

async function createMigration() {
  const migrationName = process.argv[2];
  if (!migrationName) {
    console.error('❌ Please provide a name for the migration.');
    console.log('Usage: npm run migrate:create <migration_name>');
    process.exit(1);
  }

  // Ensure the migrations directory exists
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14);
  const sanitizedName = migrationName.replace(/\s+/g, '_');
  const fileName = `${timestamp}_${sanitizedName}.sql`;
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  const content = `-- Migration: ${migrationName}
-- Generated: ${new Date().toISOString()}
-- ID: ${uuidv4()}

BEGIN;

-- Your SQL statements go here.
-- Note: This migration is wrapped in a transaction.
-- If any statement fails, the entire transaction will be rolled back.



COMMIT;
`;

  await fs.writeFile(filePath, content);
  console.log(`✅ Created migration file: ${path.relative(process.cwd(), filePath)}`);
}

createMigration().catch(error => {
  console.error('❌ Failed to create migration:', error);
  process.exit(1);
});
