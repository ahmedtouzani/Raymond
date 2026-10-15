const logger = require('./logger');
let shuttingDown = false;

async function gracefulShutdown(signal, client, dbClient, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  const timeout = setTimeout(() => { logger.warn('Shutdown timed out'); process.exit(1); }, 5000);
  try {
    for (const timer of Object.values(global.voiceXpTracking || {})) clearInterval(timer);
    for (const close of [
      () => require('../services/auditLogs').stop(),
      () => client?.destroy?.(),
      () => dbClient?.end?.(),
    ]) {
      try { await close(); } catch { exitCode = 1; logger.error('Failed to close a resource during shutdown'); }
    }
  } finally {
    clearTimeout(timeout);
    logger.info('Shutdown complete');
    process.exit(exitCode);
  }
}
module.exports = { gracefulShutdown };
