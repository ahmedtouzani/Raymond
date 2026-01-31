const { EmbedBuilder, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const { RateLimiter } = require('discord.js-rate-limiter');

// Configure aggressive but safe rate limiting (5 deletes/sec)
const rateLimiter = new RateLimiter(5, 1000); // 5 operations per second

// Cooldown tracking (1 hour per server)
const cooldowns = new Map();
const COOLDOWN_DURATION = 3600000;

module.exports = {
    name: 'nuke-server',
    aliases: ['cnuke'],
    description: '💣 [OWNER] Blazing-fast server channel deletion',
    category: 'Owner',
    ownerOnly: true,
    hidden: true,
    usage: '!nuke-server <serverID>',
    cooldown: 60,

    async execute(message, args) {
        // Owner verification
        if (message.author.id !== process.env.OWNER_ID) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🔒 Owner Only')
                    .setColor(0xE74C3C)
                ]
            });
        }

        // Server ID validation
        if (!args[0] || !/^\d{17,20}$/.test(args[0])) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(' Invalid Server ID')
                    .setDescription('Provide a valid server ID\n`!nuke-server 123456789012345678`')
                    .setColor(0xE74C3C)
                ]
            });
        }

        const targetServerId = args[0];
        const targetServer = message.client.guilds.cache.get(targetServerId);

        // Server existence check
        if (!targetServer) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(' Server Not Found')
                    .setColor(0xE74C3C)
                ]
            });
        }

        // Cooldown check
        const cooldownEnd = cooldowns.get(targetServerId) || 0;
        if (Date.now() < cooldownEnd) {
            const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('⏳ Cooldown Active')
                    .setDescription(`Wait ${remaining}s before nuking again`)
                    .setColor(0xF39C12)
                ]
            });
        }

        // Get server info
        const channelCount = targetServer.channels.cache.size;

        // Quick confirmation
        const confirmEmbed = new EmbedBuilder()
            .setTitle(`💣 NUKE ${targetServer.name}?`)
            .setDescription(`**This will delete ${channelCount} channels**`)
            .setColor(0xE74C3C)
            .setFooter({ text: 'Type "CONFIRM" to proceed' });

        const confirmation = await message.reply({ embeds: [confirmEmbed] });

        // Collect confirmation
        try {
            const filter = m => m.author.id === message.author.id;
            const collected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 10000, // 10s timeout
                errors: ['time']
            });

            if (collected.first().content.toUpperCase() !== 'CONFIRM') {
                return confirmation.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle(' Cancelled')
                        .setColor(0x2ECC71)
                    ]
                });
            }
        } catch {
            return confirmation.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('⌛ Timeout')
                    .setColor(0xF39C12)
                ]
            });
        }

        // Start deletion
        const startTime = Date.now();
        const statusMessage = await message.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('⚡ Starting Nuke')
                .setDescription(`Preparing to delete ${channelCount} channels...`)
                .setColor(0x3498DB)
            ]
        });

        try {
            // Get all channels
            const allChannels = [...targetServer.channels.cache.values()];
            const nonCategoryChannels = allChannels.filter(c => c.type !== ChannelType.GuildCategory);
            const categories = allChannels.filter(c => c.type === ChannelType.GuildCategory);

            let deletedCount = 0;
            let errorCount = 0;

            // Delete non-category channels in parallel
            const nonCatDeletes = nonCategoryChannels.map(channel =>
                deleteWithRateLimit(channel, `Nuke by ${message.author.tag}`)
            );

            // Process results
            const nonCatResults = await Promise.allSettled(nonCatDeletes);
            nonCatResults.forEach(result => {
                if (result.status === 'fulfilled') deletedCount++;
                else errorCount++;
            });

            // Delete categories in parallel
            const catDeletes = categories.map(category =>
                deleteWithRateLimit(category, `Nuke by ${message.author.tag}`)
            );

            const catResults = await Promise.allSettled(catDeletes);
            catResults.forEach(result => {
                if (result.status === 'fulfilled') deletedCount++;
                else errorCount++;
            });

            // Final results
            const duration = (Date.now() - startTime) / 1000;
            const resultEmbed = new EmbedBuilder()
                .setTitle('<a:okey:1467170671351173121> Server Nuked')
                .setDescription(`Deleted ${deletedCount} channels in ${duration.toFixed(1)}s`)
                .addFields(
                    { name: 'Server', value: targetServer.name, inline: true },
                    { name: 'Speed', value: `${(deletedCount / duration).toFixed(1)} ch/s`, inline: true },
                    { name: 'Errors', value: errorCount.toString(), inline: true }
                )
                .setColor(0x2ECC71);

            await statusMessage.edit({ embeds: [resultEmbed] });

            // Update cooldown
            cooldowns.set(targetServerId, Date.now() + COOLDOWN_DURATION);

        } catch (error) {
            logger.error('Nuke failed:', error);
            statusMessage.edit({
                embeds: [new EmbedBuilder()
                    .setTitle(' Critical Error')
                    .setColor(0xE74C3C)
                ]
            });
        }
    }
};

/**
 * Delete channel with rate limiting
 */
async function deleteWithRateLimit(channel, reason) {
    // Wait for rate limit slot
    const rateLimited = await rateLimiter.consume(channel.guild.id);
    if (rateLimited) {
        await new Promise(resolve => setTimeout(resolve, rateLimited));
    }

    try {
        await channel.delete(reason);
    } catch (error) {
        logger.error(`Failed to delete ${channel.name}: ${error.message}`);
        throw error;
    }
}