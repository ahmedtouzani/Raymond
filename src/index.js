const logger = require('./utils/logger');
const { startBot } = require('./startup');

startBot().catch(error => {
  logger.error('Startup failed; the bot was not started:', error);
  process.exitCode = 1;
});
