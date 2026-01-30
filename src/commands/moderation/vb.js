const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getGuildConfig, setGuildConfig } = require('../../database/guildConfig');

module.exports = {
    name: 'vb',
    description: 'Quick verify user as boy. Shortcut for !verify boy @user',
    usage: '!vb @user',
    permissions: [],
    category: 'Moderation',

    async execute(message, args) {
        const ownerId = process.env.OWNER_ID;
        const isOwner = message.author.id === ownerId;

        const config = await getGuildConfig(message.guild.id) || { settings: {} };
        config.settings.verification = config.settings.verification || {};

        // Permission: only verificator or owner
        const vRoleId = config.settings.verification.verificatorRoleId;
        if (!isOwner && (!vRoleId || !message.member.roles.cache.has(vRoleId))) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need the **Verificator** role to verify users.',
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
            return sendEmbed(message, {
                title: '❓ User Not Found',
                description: 'Please mention a user or provide a valid user ID to verify.\n\n**Usage:** `!vb @user`',
                color: 0x23272A,
            });
        }

        // Get role IDs
        const unverified = config.settings.verification.unverifiedRoleId;
        const verified = config.settings.verification.verifiedRoleId;
        const boyRole = config.settings.verification.boyRoleId;
        const logChannelId = config.settings.verification.logChannelId;

        if (!unverified || !verified || !boyRole) {
            return sendEmbed(message, {
                title: '⚠️ Roles Not Set',
                description: 'Please set up all verification roles with `!verify setup` first.',
                color: 0x23272A,
            });
        }

        try {
            await member.roles.remove(unverified);
            await member.roles.add([verified, boyRole]);

            const successEmbed = {
                title: '✅ Successfully Verified as Boy',
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
                        value: '👦 Boy',
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
                color: 0x00FF00,
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
                title: '❌ Error',
                description: `Failed to verify user.\n\`\`\`${err.message}\`\`\``,
                color: 0x23272A,
            });
        }
    },
};
