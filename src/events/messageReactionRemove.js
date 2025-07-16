const { handleReaction } = require('./reactionRoles');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageReactionRemove',
    async execute(reaction, user, client) {
        try {
            // Call the reaction handler from reactionRoles.js
            await handleReaction(reaction, user, 'remove');
        } catch (error) {
            logger.error('Error in messageReactionRemove event:', error);
        }
    }
};
