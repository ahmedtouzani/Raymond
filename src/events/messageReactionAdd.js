const { handleReaction } = require('./reactionRoles');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user, client) {
        try {
            // Call the reaction handler from reactionRoles.js
            await handleReaction(reaction, user, 'add');
        } catch (error) {
            logger.error('Error in messageReactionAdd event:', error);
        }
    }
};
