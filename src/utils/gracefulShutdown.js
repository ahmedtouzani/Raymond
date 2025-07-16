const logger = require('../utils/logger');

/**
 * Gracefully shuts down the bot and closes resources.
 * @param {string} signal - The signal or source of shutdown (e.g., 'SIGINT', 'COMMAND')
 * @param {Client} client - The Discord.js client instance
 * @param {object} dbClient - The database client instance (optional)
 */
async function gracefulShutdown(signal, client, dbClient) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  // Set a hard timeout to prevent the process from hanging indefinitely
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 5000); // 5-second hard limit

  try {
    // --- Diagnostic Shutdown Sequence ---
    logger.info('Starting diagnostic shutdown sequence...');

    if (client && client.destroy) {
      logger.info('[1/2] Attempting to destroy Discord client...');
      await client.destroy();
      logger.info('[1/2] ✅ Discord client destroyed successfully.');
    } else {
      logger.info('[1/2] Discord client not found or already destroyed.');
    }

    if (dbClient && dbClient.end) {
      logger.info('[2/2] Attempting to close database connection...');
      await dbClient.end();
      logger.info('[2/2] ✅ Database connection closed successfully.');
    } else {
      logger.info('[2/2] Database client not found or no end method.');
    }

    logger.info('Diagnostic shutdown sequence complete.');

  } catch (err) {
    logger.error('Error during shutdown:', err);
  } finally {
    clearTimeout(shutdownTimeout);
    logger.info('Shutdown complete. Exiting.');
    process.exit(0);
  }
}

module.exports = { gracefulShutdown };
