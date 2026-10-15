const { asEmbed } = require('../utils/responses');
const { Events } = require('discord.js');
const logger = require('../utils/logger');

// Role configuration - map emojis to role names
const ROLE_MAPPING = {
    '🔔': '・◜Drops Notify◞',
    '🛠️': '・◜tools notify◞'
};

// Cache for tracking reaction role messages
const reactionRoleMessages = new Set();

// Track if we've set up the event listeners
let isInitialized = false;

/**
 * Handles reaction role assignments
 * @param {MessageReaction} reaction - The reaction object
 * @param {User} user - The user who reacted
 * @param {string} action - 'add' or 'remove' to add or remove the role
 */
async function handleReaction(reaction, user, action) {
    // Ignore reactions from bots
    if (user.bot) return;

    try {
        // Fetch the reaction if it's a partial
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                logger.error('Error fetching reaction:', error);
                return;
            }
        }

        const { message } = reaction;
        
        // Ignore reactions in DMs
        if (!message.guild) return;

        // Fetch the member who reacted
        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
            logger.warn(`Could not fetch member ${user.id} in guild ${message.guild.id}`);
            return;
        }


        // Check if this is a reaction role message we care about
        // We'll check if the message has our specific embed title
        const isReactionRoleMessage = message.embeds.length > 0 && 
                                   message.embeds[0].data &&
                                   message.embeds[0].data.title === '🔔 Notification Roles';
        
        if (!isReactionRoleMessage) return;

        // Get the role name from our mapping
        const roleName = ROLE_MAPPING[reaction.emoji.name];
        if (!roleName) return; // Not an emoji we care about

        // Find the role in the guild (case insensitive search)
        const role = message.guild.roles.cache.find(
            r => r.name.toLowerCase() === roleName.toLowerCase()
        );

        if (!role) {
            logger.warn(`Role "${roleName}" not found in guild ${message.guild.name} (${message.guild.id})`);
            return;
        }

        // Add or remove the role based on the action
        try {
            if (action === 'add') {
                if (!member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    logger.info(`Added role ${roleName} to ${user.tag}`);
                }
            } else {
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    logger.info(`Removed role ${roleName} from ${user.tag}`);
                }
            }
        } catch (error) {
            logger.error(`Failed to ${action} role ${roleName} for ${user.tag}:`, error);
            
            // Optionally send a message to the user if we can
            if (error.code === 50013) { // Missing Permissions
                try {
                    await user.send(asEmbed(`I don't have permission to manage the ${roleName} role. Please contact an admin.`));
                } catch (dmError) {
                    logger.error('Failed to send DM to user:', dmError);
                }
            }
        }

    } catch (error) {
        logger.error('Error in reaction role handler:', error);
    }
}

/**
 * Sets up the reaction role event listeners
 * @param {Client} client - The Discord client instance
 */
function setup(client) {
    // Handle reaction additions
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        try {
            // Only process reactions to messages we're tracking
            if (reaction.message.partial) {
                try {
                    await reaction.message.fetch();
                } catch (error) {
                    logger.error('Error fetching reaction message:', error);
                    return;
                }
            }
            
            // Check if this is a reaction role message (has our embed with title 'Get Notify')
            const message = reaction.message;
            if (message.embeds.length > 0 && message.embeds[0].title === 'Get Notify') {
                await handleReaction(reaction, user, 'add');
            }
        } catch (error) {
            logger.error('Error in messageReactionAdd handler:', error);
        }
    });

    // Handle reaction removals
    client.on(Events.MessageReactionRemove, async (reaction, user) => {
        try {
            // Only process reactions to messages we're tracking
            if (reaction.message.partial) {
                try {
                    await reaction.message.fetch();
                } catch (error) {
                    logger.error('Error fetching reaction message:', error);
                    return;
                }
            }
            
            // Check if this is a reaction role message (has our embed with title 'Get Notify')
            const message = reaction.message;
            if (message.embeds.length > 0 && message.embeds[0].title === 'Get Notify') {
                await handleReaction(reaction, user, 'remove');
            }
        } catch (error) {
            logger.error('Error in messageReactionRemove handler:', error);
        }
    });
    
    isInitialized = true;
    logger.info('Reaction role event handlers registered');
}

// Export the handleReaction function and setup for use in index.js
module.exports = {
    name: 'reactionRoles',
    handleReaction,
    ROLE_MAPPING
};

// Also export ROLE_MAPPING as a direct property for backward compatibility
module.exports.ROLE_MAPPING = ROLE_MAPPING;
