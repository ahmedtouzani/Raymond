const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');
const { getJailSettings, jailUser, getJailedUser } = require('../../database/jailSetting');

module.exports = {
    name: 'jail',
    aliases: ['tla7'],
    description: 'Jail a user by removing their roles and assigning the jail role.',
    usage: '=jail @user [reason]',
    cooldown: 5,
    prefixless: true,
    permissions: [PermissionsBitField.Flags.ManageRoles],
    category: 'Moderation',

    async execute(message, args, client) {
        const ownerId = process.env.OWNER_ID;
        const isOwner = message.author.id === ownerId;

        if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need the **Manage Roles** permission to use this command.',
                color: 0x23272A,
            });
        }

        const member = message.mentions.members.first();
        if (!member && args[0]) {
            try {
                member = await message.guild.members.fetch(args[0]);
            } catch (e) {
                // Ignore fetch error, handled below
            }
        }
        if (!member) {
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'jail',
                description: '<a:warningbug:905560995886411806> **User Not Found**\nPlease mention a user to jail or provide a valid user ID.',
                usage: '`!jail <@user> [reason]`',
                examples: '`!jail @User Spamming`'
            });
            return message.reply({ embeds: [embed] });
        }

        if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
            return sendEmbed(message, {
                title: 'Action Denied',
                description: 'You cannot jail the bot or yourself.',
                color: 0x23272A,
            });
        }

        const guildSettings = await getJailSettings(message.guild.id);
        if (!guildSettings?.jail_role_id) {
            return sendEmbed(message, {
                title: 'Setup Required',
                description: 'The jail role is not configured for this server.',
                color: 0x23272A,
            });
        }

        const jailRole = message.guild.roles.cache.get(guildSettings.jail_role_id);
        if (!jailRole) {
            return sendEmbed(message, {
                title: 'Setup Required',
                description: 'Configured jail role not found in the server.',
                color: 0x23272A,
            });
        }

        // Save user roles (excluding @everyone and jail role)
        const rolesToRemove = member.roles.cache.filter(role => role.id !== message.guild.id && role.id !== jailRole.id);
        const savedRoleIds = rolesToRemove.map(role => role.id);

        try {
            // Save to DB
            await jailUser(message.guild.id, member.id, savedRoleIds);

            // Remove roles
            await member.roles.remove(rolesToRemove);

            // Add jail role
            await member.roles.add(jailRole);

            // Optionally move to jail voice channel or handle permissions

            sendEmbed(message, {
                title: 'User Jailed',
                description: `${member.user.tag} has been jailed.`,
                color: 0x23272A,
            });
        } catch (error) {
            sendEmbed(message, {
                title: 'Error',
                description: `Failed to jail user: ${error.message}`,
                color: 0x23272A,
            });
        }
    },
};
