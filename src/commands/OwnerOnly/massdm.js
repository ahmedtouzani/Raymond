const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');

// Enhanced rate limiting parameters
const BATCH_SIZE = 10; // Increased batch size for efficiency
const BATCH_DELAY = 500; // Reduced delay between batches
const COOLDOWN = 30000; // 30 seconds cooldown
const MAX_MESSAGE_LENGTH = 10000; // Discord message limit

// Track ongoing operations
const activeOperations = new Map();

module.exports = {
    name: 'massdm',
    description: '⚡ [OWNER] Fast direct messaging to members across servers',
    category: 'Owner',
    ownerOnly: true,
    permissions: [PermissionFlagsBits.Administrator],
    usage: '!massdm <server_ids> <message>\nExample: !massdm all Hello everyone!\nExample: !massdm 1234567890,9876543210 Important announcement!',
    cooldown: 15, // Reduced cooldown
    hidden: true,

    async execute(message, args) {
        // Operation lock check
        if (activeOperations.has('global')) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('⚠️ Operation In Progress')
                    .setDescription('A mass DM operation is already running.')
                    .setColor(0xF39C12)
                ]
            });
        }

        // Argument validation
        if (args.length < 2) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Missing Arguments')
                    .setDescription('Provide server IDs and a message\n`!massdm all Hello!`')
                    .setColor(0xE74C3C)
                ]
            });
        }

        // Parse arguments
        const serverIds = args[0].toLowerCase() === 'all' 
            ? Array.from(message.client.guilds.cache.keys())
            : args[0].split(',').map(id => id.trim());
        
        const content = args.slice(1).join(' ');

        // Message validation
        if (!content) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Missing Message')
                    .setDescription('Please provide content to send')
                    .setColor(0xE74C3C)
                ]
            });
        }

        if (content.length > MAX_MESSAGE_LENGTH) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Message Too Long')
                    .setDescription(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`)
                    .setColor(0xE74C3C)
                ]
            });
        }

        // Confirmation flow
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirm Mass DM')
            .setDescription(`Send to ${serverIds.length} server(s)?`)
            .addFields(
                { 
                    name: 'Message Preview', 
                    value: content.length > 100 
                        ? `${content.substring(0, 100)}...` 
                        : content,
                    inline: false 
                },
                { 
                    name: 'Target Servers', 
                    value: serverIds.length > 5 
                        ? `${serverIds.slice(0, 5).join(', ')}... (${serverIds.length} total)`
                        : serverIds.join(', '),
                    inline: false 
                }
            )
            .setColor(0xF39C12)
            .setFooter({ text: '✅ to confirm | ❌ to cancel | ⏱️ 30s' });

        const confirmation = await message.reply({ embeds: [confirmEmbed] });
        await confirmation.react('✅');
        await confirmation.react('❌');

        // Reaction collector
        const filter = (reaction, user) => ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        
        try {
            const collected = await confirmation.awaitReactions({
                filter,
                max: 1,
                time: 30000
            });

            const reaction = collected.first();
            if (reaction.emoji.name === '❌') {
                return confirmation.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('❌ Operation Cancelled')
                        .setColor(0xE74C3C)
                    ]
                });
            }

            // Start operation
            activeOperations.set('global', true);
            await confirmation.reactions.removeAll().catch(() => {});

            const statusMessage = await message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('⚡ Starting Mass DM')
                    .setDescription('Preparing to send messages...')
                    .addFields(
                        { name: 'Total Servers', value: serverIds.length.toString(), inline: true },
                        { name: 'Status', value: 'Initializing...', inline: true }
                    )
                    .setColor(0x3498DB)
                ]
            });

            let totalSuccess = 0;
            let totalFailed = 0;
            let totalMembers = 0;
            let processedServers = 0;
            const startTime = Date.now();

            // Process servers in parallel
            await Promise.all(serverIds.map(async serverId => {
                try {
                    const guild = message.client.guilds.cache.get(serverId);
                    if (!guild) {
                        logger.warn(`Skipping unknown server: ${serverId}`);
                        return;
                    }

                    // Get members efficiently
                    const members = await guild.members.fetch({ 
                        withPresences: false,
                        force: true 
                    });
                    
                    const nonBotMembers = members.filter(m => !m.user.bot);
                    const memberCount = nonBotMembers.size;
                    totalMembers += memberCount;
                    processedServers++;

                    // Update status
                    await updateStatus(statusMessage, {
                        processedServers,
                        totalServers: serverIds.length,
                        totalSuccess,
                        totalFailed,
                        currentServer: guild.name,
                        memberCount
                    });

                    // Process members in batches
                    const memberArray = Array.from(nonBotMembers.values());
                    let serverSuccess = 0;
                    let serverFailed = 0;

                    for (let i = 0; i < memberArray.length; i += BATCH_SIZE) {
                        const batch = memberArray.slice(i, i + BATCH_SIZE);
                        const results = await Promise.allSettled(
                            batch.map(member => sendDM(member, content))
                        );

                        const batchSuccess = results.filter(r => r.status === 'fulfilled').length;
                        const batchFailed = results.length - batchSuccess;

                        serverSuccess += batchSuccess;
                        serverFailed += serverFailed;
                        totalSuccess += batchSuccess;
                        totalFailed += batchFailed;

                        // Update status periodically
                        if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= memberArray.length) {
                            await updateStatus(statusMessage, {
                                processedServers,
                                totalServers: serverIds.length,
                                totalSuccess,
                                totalFailed,
                                currentServer: `${guild.name} (${Math.round((i / memberArray.length) * 100)}%)`
                            });
                        }

                        // Minimal delay between batches
                        if (i + BATCH_SIZE < memberArray.length) {
                            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                        }
                    }

                } catch (error) {
                    logger.error(`Server ${serverId} error: ${error.message}`);
                    totalFailed++;
                }
            }));

            // Final results
            const duration = Math.floor((Date.now() - startTime) / 1000);
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Mass DM Complete')
                .setDescription(`Processed ${processedServers}/${serverIds.length} servers in ${duration}s`)
                .addFields(
                    { name: 'Total Members', value: totalMembers.toString(), inline: true },
                    { name: '✅ Success', value: totalSuccess.toString(), inline: true },
                    { name: '❌ Failed', value: totalFailed.toString(), inline: true },
                    { name: 'Speed', value: `${Math.round(totalMembers / duration)} members/s`, inline: true }
                )
                .setColor(0x2ECC71);

            await statusMessage.edit({ embeds: [resultEmbed] });

        } catch (error) {
            logger.error('Mass DM error:', error);
            message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Operation Failed')
                    .setDescription('An error occurred during mass DM')
                    .setColor(0xE74C3C)
                ]
            });
        } finally {
            activeOperations.delete('global');
        }
    }
};

/**
 * Send DM with optimized error handling
 */
async function sendDM(member, content) {
    try {
        // Try to send without creating DM channel first
        await member.send(content);
        return { success: true };
    } catch (error) {
        // Handle specific error cases
        if (error.code === 50007) { // Cannot message user
            return { success: false, reason: 'DMs disabled' };
        }
        return { success: false, reason: error.message };
    }
}

/**
 * Efficient status updater with rate limiting
 */
async function updateStatus(message, {
    processedServers,
    totalServers,
    totalSuccess,
    totalFailed,
    currentServer = '',
    memberCount = 0
}) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('📤 Sending Mass DMs')
            .setColor(0x3498DB)
            .addFields(
                { name: 'Progress', value: `${processedServers}/${totalServers} servers`, inline: true },
                { name: 'Current Server', value: currentServer || 'N/A', inline: true },
                { name: 'Members', value: memberCount.toString(), inline: true },
                { name: '✅ Success', value: totalSuccess.toString(), inline: true },
                { name: '❌ Failed', value: totalFailed.toString(), inline: true }
            );

        await message.edit({ embeds: [embed] });
    } catch (error) {
        logger.error('Status update failed:', error);
    }
}