const Migrator = require('../scripts/migrate');

async function startBot() {
  const migrator = new Migrator();
  try {
    await migrator.run();
  } finally {
    await migrator.close();
  }
  // Import only after schema changes commit and the migration pool closes.
  // This prevents event handlers, workers and Discord login from starting early.
  return require('./bot');
}

module.exports = { startBot };
