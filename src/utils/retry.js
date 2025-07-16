const logger = require('./logger');

async function retryOperation(operation, maxRetries = 5, delay = 2000, context = '') {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Attempt ${i + 1}/${maxRetries} for ${context} failed: ${error.message}. Retrying in ${delay / 1000} seconds...`);
      if (i === maxRetries - 1) {
        logger.error(`Max retries reached for ${context}. Giving up.`);
        throw error;
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

module.exports = { retryOperation }; 