const winston = require('winston');
const { updateChangelog } = require('./changelog');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-bot' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// Wrap logger methods to also write to the changelog
const origInfo = logger.info.bind(logger);
const origWarn = logger.warn.bind(logger);
const origError = logger.error.bind(logger);

logger.info = function(...args) {
  updateChangelog('INFO', args.map(String).join(' '));
  return origInfo(...args);
};
logger.warn = function(...args) {
  updateChangelog('WARN', args.map(String).join(' '));
  return origWarn(...args);
};
logger.error = function(...args) {
  updateChangelog('ERROR', args.map(String).join(' '));
  return origError(...args);
};

module.exports = logger;
