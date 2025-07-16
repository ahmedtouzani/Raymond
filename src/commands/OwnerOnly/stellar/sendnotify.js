const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../../utils/logger');
const { ensureReactionRoles } = require('../../../utils/ensureRoles');

// Premium server ID
const PREMIUM_SERVER_ID = '1038540608396066856';

// Modern color palette
const COLORS = {
    PRIMARY: '#5865F2',    // Discord blurple
    SUCCESS: '#57F287',   // Discord green
    WARNING: '#FEE75C',   // Discord yellow
    DANGER: '#ED4245',    // Discord red
    DARK: '#2C2F33',      // Dark theme background
    LIGHT: '#FFFFFF',     // White text
    ACCENT: '#EB459E'     // Accent color
};

// Modern emojis
const EMOJIS = {
    BELL: '🔔',
    TOOLS: '🛠️',
    ARROW: '➡️',
    CHECK: '✅',
    CROSS: '❌',
    INFO: 'ℹ️'
};

module.exports = {
    name: 'sendnotify',
    description: 'Sends the notification role message (Premium Server Only)',
    category: 'OwnerOnly',
    usage: 'sendnotify',
    aliases: ['reactionroles'],
    botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.AddReactions],
    guildOnly: true,
    ownerOnly: true, // Only the bot owner can use this command
    premiumOnly: true, // Custom flag to indicate this is a premium feature
    
    async execute(message, args, client) {
        try {
            // Check if this is the premium server
            if (message.guild.id !== PREMIUM_SERVER_ID) {
                return message.reply({
                    content: '❌ This command is only available in the premium server.'
                }).then(msg => setTimeout(() => msg.delete().catch(console.error), 5000))
                .catch(console.error);
            }



            // Send a temporary message to show the command is working
            const processingMsg = await message.channel.send('🔄 Setting up reaction roles...');

            try {
                // Ensure required roles exist
                await ensureReactionRoles(message.guild);
                
                // Create the modern embed message
                const embed = new EmbedBuilder()
                    .setColor(COLORS.PRIMARY)
                    .setTitle('🔔 Notification Roles')
                    .setDescription(
                        `**Welcome to Parallel Universe!**\n` +
                        `Get notified about our latest updates and tools by selecting your preferences below.\n\n` +
                        `${EMOJIS.ARROW} **How it works:**\n` +
                        `${EMOJIS.CHECK} React with ${EMOJIS.BELL} to get notified about **New Drops**\n` +
                        `${EMOJIS.CHECK} React with ${EMOJIS.TOOLS} to get notified about **New Tools**\n\n` +
                        `*You can click the reactions to toggle your preferences anytime.*`
                    )
                    .addFields(
                        {
                            name: '\u200B',
                            value: `${EMOJIS.BELL} **Drops Notify**\nBe the first to know about new drops and releases.`,
                            inline: true
                        },
                        {
                            name: '\u200B',
                            value: `${EMOJIS.TOOLS} **Tools Notify**\nGet updates on new tools and resources.`,
                            inline: true
                        },
                        {
                            name: '\u200B',
                            value: `\n${EMOJIS.INFO} *React below to select your notification preferences*`,
                            inline: false
                        }
                    )
                    .setThumbnail('https://i.imgur.com/8Km9tLL.png') // Replace with your server icon URL
                    .setFooter({
                        text: 'Parallel Universe • React to get your roles',
                        iconURL: 'https://i.imgur.com/8Km9tLL.png' // Replace with your server icon URL
                    })
                    .setTimestamp();

                // Send the message and add reactions
                const roleMessage = await message.channel.send({ embeds: [embed] });
                await roleMessage.react('🔔');
                await roleMessage.react('🛠️');
                
                logger.info(`Reaction role message created with ID: ${roleMessage.id} in channel ${roleMessage.channel.id}`);
                
                // Delete the processing message and command message
                await processingMsg.delete().catch(console.error);
                await message.delete().catch(console.error);
                
                // Send success message that will auto-delete
                const successMsg = await message.channel.send('✅ Successfully created reaction role message!');
                setTimeout(() => successMsg.delete().catch(console.error), 5000);

            } catch (error) {
                logger.error('Error in reaction role setup:', error);
                await processingMsg.edit('❌ Failed to set up reaction roles. Please check the bot permissions and try again.');
            }

        } catch (error) {
            logger.error('Unexpected error in sendnotify command:', error);
            message.channel.send('❌ An unexpected error occurred while creating the reaction role message.')
                .then(msg => setTimeout(() => msg.delete().catch(console.error), 5000))
                .catch(console.error);
        }
    }
};
