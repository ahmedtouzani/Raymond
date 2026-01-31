const { PermissionsBitField, ChannelType } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getStatsChannels, setStatsChannel, removeStatsChannel } = require('../../database/statsChannels');
const statsUpdater = require('../../services/statsUpdater');

module.exports = {
    name: 'setstats',
    description: 'Configure automatic member and voice count channels',
    usage: '!setstats <member|voice> <#channel> [base name]',
    examples: [
        '!setstats member #stats',
        '!setstats voice #voice-count',
        '!setstats member #stats 👥 Members',
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
                        value: `**Channel:** ${memberChannel}\n**Base Name:** \`${config?.member_count_format || 'Not Set'}\`\n**Example:** \`${config?.member_count_format || 'Members'}: 1,234\``,
                        inline: false
                    },
                    {
                        name: '🎤 Voice Counter',
                        value: `**Channel:** ${voiceChannel}\n**Base Name:** \`${config?.voice_count_format || 'Not Set'}\`\n**Example:** \`${config?.voice_count_format || 'In Voice'}: 42\``,
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
                            '`!setstats member #channel 👥 Members` - Set with custom base name\n' +
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
                const { createUsageEmbed } = require('../../utils/embed');
                const embed = await createUsageEmbed(message.guild.id, {
                    command: 'setstats',
                    description: '<a:warningbug:905560995886411806> **Invalid Type**\nPlease specify either `member` or `voice`.',
                    usage: '`!setstats remove <member|voice>`',
                    examples: '`!setstats remove member`'
                });
                return message.reply({ embeds: [embed] });
            }

            await removeStatsChannel(message.guild.id, type);
            return sendEmbed(message, {
                title: '<a:okey:1467170671351173121> Stats Channel Removed',
                description: `${type === 'member' ? '👥 Member' : '🎤 Voice'} counter has been disabled.`,
                color: 0x23272A,
            });
        }

        // Handle setting stats channels
        if (!['member', 'voice'].includes(subCommand)) {
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'setstats',
                description: '<a:warningbug:905560995886411806> **Invalid Command**\nPlease specify either `member` or `voice`.',
                usage: '`!setstats <member|voice> <#channel>`',
                examples: '`!setstats member #stats`\n`!setstats voice #voice-count`'
            });
            return message.reply({ embeds: [embed] });
        }

        // Get channel
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.trim());
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'setstats',
                description: '<a:warningbug:905560995886411806> **Invalid Channel**\nPlease mention a valid **voice channel**.\n(Stats channels must be voice channels)',
                usage: '`!setstats <member|voice> <#channel>`',
                examples: '`!setstats member #stats`'
            });
            return message.reply({ embeds: [embed] });
        }

        // Check bot permissions
        const botPerms = channel.permissionsFor(message.guild.members.me);
        if (!botPerms || !botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
            return sendEmbed(message, {
                title: ' Missing Permissions',
                description: `I don't have permission to manage ${channel}.\n\nPlease give me the **Manage Channels** permission for that channel.`,
                color: 0x23272A,
            });
        }

        // Get custom base name if provided, otherwise use current channel name
        const baseName = args.slice(2).join(' ') || channel.name;

        // Save configuration with base name
        await setStatsChannel(message.guild.id, subCommand, channel.id, baseName);

        // Force update the channel immediately
        if (subCommand === 'member') {
            await statsUpdater.forceUpdate(message.guild, 'member');
        } else {
            await statsUpdater.forceUpdate(message.guild, 'voice');
        }

        return sendEmbed(message, {
            title: '<a:okey:1467170671351173121> Stats Channel Configured',
            description: `${subCommand === 'member' ? '👥 Member' : '🎤 Voice'} counter has been set to ${channel}`,
            fields: [
                {
                    name: 'Base Name',
                    value: `\`${baseName}\``,
                    inline: false
                },
                {
                    name: 'Example Output',
                    value: `\`${baseName}: 1,234\``,
                    inline: false
                },
                {
                    name: 'Note',
                    value: 'The channel will update automatically (with 5-minute cooldown to prevent API rate limits).\n\nThe count will be appended to the base name.',
                    inline: false
                }
            ],
            color: 0x00AA55,
        });
    },
};
