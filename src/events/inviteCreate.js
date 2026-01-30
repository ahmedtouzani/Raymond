const inviteTracker = require('../services/inviteTracker');
const logger = require('../utils/logger');

module.exports = {
    name: 'inviteCreate',
    async execute(invite) {
        try {
            await inviteTracker.onInviteCreate(invite);
        } catch (error) {
            logger.error('Error in inviteCreate event:', error);
        }
    }
};
