const { PermissionsBitField, ChannelType } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getStatsChannels, setStatsChannel, removeStatsChannel } = require('../../database/statsChannels');
const statsUpdater = require('../../services/statsUpdater');

module.exports = {
    name: 'setstats',
    description: 'Configure automatic member and voice count channels',
    usage: '!setstats <member|voice> <#channel> [format]',
    examples: [
        '!setstats member #stats',
        '!setstats voice #voice-count',
        '!setstats member #stats 👥 Total: {count}',
        '!setstats view',
        '!setstats remove member'
    ],
    permissions: [PermissionsBitField.Flags.ManageChannels],
    category: 'Moderation',

    async execute(message, args) {
        const ownerId = process.env.OWNER_ID;
        const isOwner = message.author.id === ownerId;

        // Permission check
        if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need the **Manage Channels** permission to use this command.',
                color: 0x23272A,
            });
        }

        // No args or "view" - show current configuration
        if (!args.length || args[0].toLowerCase() === 'view') {
            const config = await getStatsChannels(message.guild.id);

            const memberChannel = config?.member_count_channel_id
                ? `<#${config.member_count_channel_id}>`
                : 'Not Set';
            const voiceChannel = config?.voice_count_channel_id
                ? `<#${config.voice_count_channel_id}>`
                : 'Not Set';

            return sendEmbed(message, {
                title: '📊 Stats Channels Configuration',
                description: 'Automatic member and voice count display channels',
                fields: [
                    {
                        name: '👥 Member Counter',
                        value: `**Channel:** ${memberChannel}\n**Format:** \`${config?.member_count_format || '👥 Members: {count}'}\``,
                        inline: false
                    },
                    {
                        name: '🎤 Voice Counter',
                        value: `**Channel:** ${voiceChannel}\n**Format:** \`${config?.voice_count_format || '🎤 In Voice: {count}'}\``,
                        inline: false
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: false
                    },
                    {
                        name: 'Commands',
                        value:
                            '`!setstats member #channel` - Set member counter\n' +
                            '`!setstats voice #channel` - Set voice counter\n' +
                            '`!setstats member #channel 👥 Total: {count}` - Set with custom format\n' +
                            '`!setstats remove member` - Remove member counter\n' +
                            '`!setstats remove voice` - Remove voice counter',
                        inline: false
                    }
                ],
                color: 0x5865F2,
            });
        }

        const subCommand = args[0].toLowerCase();

        // Handle "remove" command
        if (subCommand === 'remove') {
            const type = args[1]?.toLowerCase();
            if (!type || !['member', 'voice'].includes(type)) {
                return sendEmbed(message, {
                    title: '❌ Invalid Type',
                    description: 'Please specify either `member` or `voice`.\n\n**Example:** `!setstats remove member`',
                    color: 0x23272A,
                });
            }

            await removeStatsChannel(message.guild.id, type);
            return sendEmbed(message, {
                title: '✅ Stats Channel Removed',
                description: `${type === 'member' ? '👥 Member' : '🎤 Voice'} counter has been disabled.`,
                color: 0x23272A,
            });
        }

        // Handle setting stats channels
        if (!['member', 'voice'].includes(subCommand)) {
            return sendEmbed(message, {
                title: '❌ Invalid Command',
                description: 'Please specify either `member` or `voice`.\n\n**Examples:**\n`!setstats member #channel`\n`!setstats voice #channel`',
                color: 0x23272A,
            });
        }

        // Get channel
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.trim());
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            return sendEmbed(message, {
                title: '❌ Invalid Channel',
                description: 'Please mention a valid **voice channel**.\n\n**Note:** Stats channels must be voice channels so they appear in the channel list.',
                color: 0x23272A,
            });
        }

        // Check bot permissions
        const botPerms = channel.permissionsFor(message.guild.members.me);
        if (!botPerms || !botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
            return sendEmbed(message, {
                title: '❌ Missing Permissions',
                description: `I don't have permission to manage ${channel}.\n\nPlease give me the **Manage Channels** permission for that channel.`,
                color: 0x23272A,
            });
        }

        // Get custom format if provided
        const format = args.slice(2).join(' ') || null;
        if (format && !format.includes('{count}')) {
            return sendEmbed(message, {
                title: '❌ Invalid Format',
                description: 'Format must include `{count}` placeholder.\n\n**Example:** `👥 Total Members: {count}`',
                color: 0x23272A,
            });
        }

        // Save configuration
        await setStatsChannel(message.guild.id, subCommand, channel.id, format);

        // Force update the channel immediately
        if (subCommand === 'member') {
            await statsUpdater.forceUpdate(message.guild, 'member');
        } else {
            await statsUpdater.forceUpdate(message.guild, 'voice');
        }

        const displayFormat = format || (subCommand === 'member' ? '👥 Members: {count}' : '🎤 In Voice: {count}');

        return sendEmbed(message, {
            title: '✅ Stats Channel Configured',
            description: `${subCommand === 'member' ? '👥 Member' : '🎤 Voice'} counter has been set to ${channel}`,
            fields: [
                {
                    name: 'Format',
                    value: `\`${displayFormat}\``,
                    inline: false
                },
                {
                    name: 'Note',
                    value: 'The channel will update automatically (with 5-minute cooldown to prevent API rate limits).',
                    inline: false
                }
            ],
            color: 0x00AA55,
        });
    },
};
