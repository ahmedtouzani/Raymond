const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const aiWhitelist = require('../../database/aiWhitelist');

// DYNAMIC VALUES
const whitelistLimit = process.env.AI_HOURLY_LIMIT_WHITELISTED || 6;
const regularLimit = process.env.AI_HOURLY_LIMIT_REGULAR || 3;

module.exports = {
    name: 'aiwhitelist',
    description: 'Manage AI whitelist (higher rate limits)',
    usage: 'aiwhitelist <add|remove|list|clear> [@user]',
    aliases: ['aiwl', 'whitelist'],
    category: 'OwnerOnly',

    async execute(message, args) {
        const isOwner = !process.env.OWNER_ID || message.author.id === process.env.OWNER_ID;

        if (!isOwner) {
            return message.reply('❌ Only the bot owner can manage the AI whitelist.');
        }

        if (!args.length) {
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'aiwhitelist',
                description: `Manage users with higher AI rate limits (${whitelistLimit} messages/hour instead of ${regularLimit}).`,
                usage: '`!aiwhitelist add @user [reason]`\n`!aiwhitelist remove @user`\n`!aiwhitelist list`\n`!aiwhitelist clear`',
                examples: '`!aiwhitelist add @Busy VIP member`\n`!aiwhitelist remove @Busy`\n`!aiwhitelist list`'
            });
            return message.reply({ embeds: [embed] });
        }

        const sub = String(args[0] || '').toLowerCase();

        // ===== ADD SUBCOMMAND =====
        if (sub === 'add') {
            const mentionedUser = message.mentions.users.first();

            if (!mentionedUser) {
                return message.reply('❌ Please mention a user to whitelist: `!aiwhitelist add @user [reason]`');
            }

            const reason = args.slice(2).join(' ').trim() || 'No reason provided';

            try {
                await aiWhitelist.addToWhitelist(
                    message.guild.id,
                    mentionedUser.id,
                    message.author.id,
                    reason
                );

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ User Whitelisted')
                    .setDescription(`**${mentionedUser.tag}** has been added to the AI whitelist.`)
                    .addFields(
                        { name: 'Rate Limit', value: `${whitelistLimit} messages/hour (instead of ${regularLimit})`, inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('[AI Whitelist] Add error:', error);
                return message.reply(`❌ Error adding user to whitelist: ${error.message}`);
            }
        }

        // ===== REMOVE SUBCOMMAND =====
        if (sub === 'remove' || sub === 'delete') {
            const mentionedUser = message.mentions.users.first();

            if (!mentionedUser) {
                return message.reply('❌ Please mention a user to remove: `!aiwhitelist remove @user`');
            }

            try {
                const removed = await aiWhitelist.removeFromWhitelist(
                    message.guild.id,
                    mentionedUser.id
                );

                if (removed) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('✅ User Removed from Whitelist')
                        .setDescription(`**${mentionedUser.tag}** has been removed from the AI whitelist.`)
                        .addFields(
                            { name: 'Rate Limit', value: `${regularLimit} messages/hour (regular)`, inline: true }
                        )
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                } else {
                    return message.reply(`❌ **${mentionedUser.tag}** is not in the whitelist.`);
                }
            } catch (error) {
                console.error('[AI Whitelist] Remove error:', error);
                return message.reply(`❌ Error removing user from whitelist: ${error.message}`);
            }
        }

        // ===== LIST SUBCOMMAND =====
        if (sub === 'list' || sub === 'show') {
            try {
                const whitelisted = await aiWhitelist.getWhitelistedUsers(message.guild.id);

                if (!whitelisted.length) {
                    return message.reply('📝 No users are currently whitelisted.');
                }

                const userList = await Promise.all(
                    whitelisted.map(async (entry) => {
                        const user = await message.client.users.fetch(entry.user_id).catch(() => null);
                        const username = user ? user.tag : `Unknown (${entry.user_id})`;
                        const addedDate = new Date(entry.added_at).toLocaleDateString();
                        const reason = entry.reason || 'No reason';
                        return `• **${username}**\n  Added: ${addedDate} | Reason: ${reason}`;
                    })
                );

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🎯 AI Whitelist')
                    .setDescription(userList.join('\n\n'))
                    .setFooter({ text: `${whitelisted.length} whitelisted user(s) | ${whitelistLimit} messages/hour` })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('[AI Whitelist] List error:', error);
                return message.reply(`❌ Error listing whitelist: ${error.message}`);
            }
        }

        // ===== CLEAR SUBCOMMAND =====
        if (sub === 'clear') {
            try {
                const count = await aiWhitelist.clearWhitelist(message.guild.id);

                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('✅ Whitelist Cleared')
                    .setDescription(`Removed **${count}** user(s) from the AI whitelist.`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('[AI Whitelist] Clear error:', error);
                return message.reply(`❌ Error clearing whitelist: ${error.message}`);
            }
        }

        return message.reply('❌ Invalid subcommand. Use: `add`, `remove`, `list`, or `clear`');
    }
};
