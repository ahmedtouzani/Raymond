const logger = require('./logger');

// Import the role mapping from reactionRoles to keep them in sync
const { ROLE_MAPPING } = require('../events/reactionRoles');

/**
 * Ensures that the required roles for reaction roles exist in the guild
 * @param {Guild} guild - The Discord guild to check/update roles in
 * @returns {Promise<Object>} Object with role IDs
 */
async function ensureReactionRoles(guild) {
    try {
        // Define required roles with their properties
        const requiredRoles = {
            '・◜Drops Notify◞': {
                color: '#FFD700', // Gold color
                reason: 'Auto-created role for drops notifications',
                position: 10 // Optional: set position if needed
            },
            '・◜tools notify◞': {
                color: '#1E90FF', // Dodger blue
                reason: 'Auto-created role for tools notifications',
                position: 11 // Optional: set position if needed
            }
        };

        const roles = {};
        
        // Check each required role
        for (const [roleName, roleData] of Object.entries(requiredRoles)) {
            // Case-insensitive role search
            let role = guild.roles.cache.find(
                r => r.name.toLowerCase() === roleName.toLowerCase()
            );
            
            // If role doesn't exist, create it
            if (!role) {
                try {
                    const roleOptions = {
                        name: roleName,
                        color: roleData.color,
                        reason: roleData.reason,
                        mentionable: true,
                        hoist: false
                    };

                    role = await guild.roles.create(roleOptions);
                    
                    // If you need to set position, you'll need to handle it separately
                    // as it requires special permissions
                    
                    logger.info(`Created role: ${roleName} in guild ${guild.name}`);
                } catch (error) {
                    logger.error(`Failed to create role ${roleName} in guild ${guild.name}:`, error);
                    // Don't throw the error, just log it and continue with other roles
                    continue;
                }
            } else {
                // Role exists, check if we need to update its properties
                const needsUpdate = 
                    role.color !== roleData.color || 
                    role.mentionable !== true ||
                    role.hoist !== false;
                
                if (needsUpdate) {
                    try {
                        await role.edit({
                            color: roleData.color,
                            mentionable: true,
                            hoist: false,
                            reason: 'Updating role settings to match required configuration'
                        });
                        logger.info(`Updated role settings for ${roleName} in guild ${guild.name}`);
                    } catch (updateError) {
                        logger.error(`Failed to update role ${roleName} in guild ${guild.name}:`, updateError);
                    }
                }
            }
            
            // Map the role name to its ID for easy access
            roles[roleName] = role.id;
        }
        
        return roles;
    } catch (error) {
        logger.error('Error in ensureReactionRoles:', error);
        throw error;
    }
}

module.exports = { ensureReactionRoles };
