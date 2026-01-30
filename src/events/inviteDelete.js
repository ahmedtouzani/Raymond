const inviteTracker = require('../services/inviteTracker');
const logger = require('../utils/logger');

module.exports = {
    name: 'inviteDelete',
    async execute(invite) {
        try {
            await inviteTracker.onInviteDelete(invite);
        } catch (error) {
            logger.error('Error in inviteDelete event:', error);
        }
    }
};
