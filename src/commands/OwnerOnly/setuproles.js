const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

// Premium server ID
const PREMIUM_SERVER_ID = '1038540608396066856';

module.exports = {
    name: 'setuproles',
    description: 'Set up reaction roles manually (Premium Server Only)',
    category: 'Owner',
    usage: 'setuproles',
    userPermissions: [PermissionFlagsBits.Administrator],
    botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.AddReactions],
    guildOnly: true,
    ownerOnly: true,
    premiumOnly: true, // Custom flag to indicate this is a premium feature

    async execute(message, args, client) {
        try {
            // Check if this is the premium server
            if (message.guild.id !== PREMIUM_SERVER_ID) {
                return message.reply('❌ This command is only available in the premium server.')
                    .then(msg => setTimeout(() => msg.delete().catch(console.error), 5000))
                    .catch(console.error);
            }

            // Check if user has administrator permissions
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply('❌ You need administrator permissions to use this command.')
                    .then(msg => setTimeout(() => msg.delete().catch(console.error), 5000))
                    .catch(console.error);
            }

            // Send initial message
            const processingMsg = await message.channel.send('🔄 Setting up reaction roles...');
            
            try {
                // Create or get the roles
                const guild = message.guild;
                
                // Create Drops Notify role
                let dropsRole = guild.roles.cache.find(r => r.name === '・◜Drops Notify◞');
                if (!dropsRole) {
                    dropsRole = await guild.roles.create({
                        name: '・◜Drops Notify◞',
                        color: 'GOLD',
                        reason: 'Setup reaction roles',
                        mentionable: true
                    });
                }

                // Create Tools Notify role
                let toolsRole = guild.roles.cache.find(r => r.name === '・◜tools notify◞');
                if (!toolsRole) {
                    toolsRole = await guild.roles.create({
                        name: '・◜tools notify◞',
                        color: 'BLUE',
                        reason: 'Setup reaction roles',
                        mentionable: true
                    });
                }

                // Create the embed message
                const embed = new EmbedBuilder()
                    .setColor('#FFFF00')
                    .setTitle('Get Notify')
                    .setDescription(
                        'Sent by parallel universe team\n\n' +
                        'if you want get verified :\n' +
                        'Click on button below\n' +
                        'to take role that will notify you to new drops & tools\n\n' +
                        'for New drops notify click on 🔔\n\n' +
                        'for New Tools notify click on 🛠️'
                    )
                    .setFooter({ text: 'React below to get your roles' });

                // Send the message
                const roleMessage = await message.channel.send({ embeds: [embed] });
                
                // Add reactions
                await roleMessage.react('🔔');
                await roleMessage.react('🛠️');

                // Clean up
                await processingMsg.delete().catch(console.error);
                await message.delete().catch(console.error);
                
                // Send success message that auto-deletes
                const successMsg = await message.channel.send('✅ Successfully set up reaction roles!');
                setTimeout(() => successMsg.delete().catch(console.error), 5000);
                
                logger.info(`Reaction roles set up in guild ${guild.id}`);
                
            } catch (error) {
                logger.error('Error in setuproles command:', error);
                await processingMsg.edit('❌ Failed to set up roles. Please check bot permissions and try again.');
            }
            
        } catch (error) {
            logger.error('Unexpected error in setuproles command:', error);
            message.channel.send('❌ An unexpected error occurred while setting up roles.')
                .then(msg => setTimeout(() => msg.delete().catch(console.error), 5000))
                .catch(console.error);
        }
    }
};
