const { allowsAutomation } = require('../config/development');
const inviteTracker = require('../services/inviteTracker');
const logger = require('../utils/logger');

module.exports = {
    name: 'inviteDelete',
    async execute(invite) {
        if (!allowsAutomation(invite.guild?.id)) return;
        try {
            await inviteTracker.onInviteDelete(invite);
        } catch (error) {
            logger.error('Error in inviteDelete event:', error);
        }
    }
};
