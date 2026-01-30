const statsUpdater = require('../services/statsUpdater');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        try {
            const { guild } = member;

            // Update member count stats when someone leaves
            await statsUpdater.updateMemberCount(guild);

        } catch (error) {
            logger.error('Error in guildMemberRemove event:', error);
        }
    }
};
