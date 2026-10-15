const { allowsAutomation } = require('../config/development');
const inviteTracker = require('../services/inviteTracker');
const logger = require('../utils/logger');

module.exports = {
    name: 'inviteCreate',
    async execute(invite) {
        if (!allowsAutomation(invite.guild?.id)) return;
        try {
            await inviteTracker.onInviteCreate(invite);
        } catch (error) {
            logger.error('Error in inviteCreate event:', error);
        }
    }
};
