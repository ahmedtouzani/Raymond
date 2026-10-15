const { recordAction } = require('../../services/moderationRecords');
const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getGuildConfig, setGuildConfig } = require('../../database/guildConfig');
const { canVerify } = require('../../services/verificationPermissions');

module.exports = {
    name: 'vg',
    description: 'Quick verify user as girl. Shortcut for !verify girl @user',
    usage: '!vg @user',
    permissions: [],
    guildOnly: true,
    category: 'Moderation',

    async execute(message, args) {
        const config = await getGuildConfig(message.guild.id) || { settings: {} };
        config.settings.verification = config.settings.verification || {};

        // Administrators, the bot owner, and the configured Verificator role can verify.
        if (!canVerify(message.member, message.author.id, config.settings.verification)) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need **Administrator** permission or the **Verificator** role to verify users.',
                color: 0x23272A,
            });
        }

        // Get target member
        let member = message.mentions.members.first();
        if (!member && args[0]) {
            try {
                member = await message.guild.members.fetch(args[0]);
            } catch (e) { }
        }

        if (!member) {
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'vg',
                description: '<a:warningbug:1467300628907954300> **User Not Found**\nPlease mention a user or provide a valid user ID to verify.',
                usage: '`!vg <@user>`',
                examples: '`!vg @User`'
            });
            return message.reply({ embeds: [embed] });
        }

        // Get role IDs
        const unverified = config.settings.verification.unverifiedRoleId;
        const verified = config.settings.verification.verifiedRoleId;
        const girlRole = config.settings.verification.girlRoleId;
        const logChannelId = config.settings.verification.logChannelId;

        if (!unverified || !verified || !girlRole) {
            return sendEmbed(message, {
                title: '<a:warningbug:1467300628907954300> Roles Not Set',
                description: 'Please set up all verification roles with `!verify setup` first.',
                color: 0x23272A,
            });
        }

        try {
            await member.roles.remove(unverified);
            await member.roles.add([verified, girlRole]);
            await recordAction(message, member.id, 'verify', 'Verified as girl', { type: 'girl' });

            const successEmbed = {
                title: '<a:okey:1467170671351173121> Successfully Verified as Girl',
                thumbnail: {
                    url: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
                },
                fields: [
                    {
                        name: 'Member Details:',
                        value: `${member.toString()}`,
                        inline: true,
                    },
                    {
                        name: 'Verified By:',
                        value: `${message.author.toString()}\n${message.author.id}`,
                        inline: true,
                    },
                    {
                        name: 'Server Join Time:',
                        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                        inline: true,
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: false,
                    },
                    {
                        name: 'Verification Time:',
                        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
                        inline: true,
                    },
                    {
                        name: 'Gender:',
                        value: '👧 Girl',
                        inline: true,
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: false,
                    },
                    {
                        name: 'Command Used in:',
                        value: `#${message.channel.name} [Click here to Navigate](${message.url})`,
                        inline: false,
                    },
                ],
                footer: {
                    text: `Verified By: ${message.author.tag} • <t:${Math.floor(message.createdTimestamp / 1000)}:f>`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true }),
                },
                timestamp: false,
                color: 0xFF69B4,
            };

            // Send to current channel
            sendEmbed(message, successEmbed);

            // Send to log channel if configured
            if (logChannelId) {
                const logChannel = message.guild.channels.cache.get(logChannelId);
                if (logChannel) {
                    logChannel.send({ embeds: [successEmbed] }).catch(err => console.error('Failed to send verification log:', err));
                }
            }

        } catch (err) {
            sendEmbed(message, {
                title: '<a:warningbug:1467300628907954300> Error',
                description: `Failed to verify user.\n\`\`\`${err.message}\`\`\``,
                color: 0x23272A,
            });
        }
    },
};
