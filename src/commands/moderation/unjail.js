const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getJailSettings, getJailedUser, unjailUser } = require('../../database/jailSetting');

module.exports = {
    name: 'unjail',
    description: 'Unjail a user by restoring their roles.',
    usage: '=unjail @user',
    cooldown: 5,
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
            return sendEmbed(message, {
                title: '❓ User Not Found',
                description: 'Please mention a user or provide a valid user ID to mute.',
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

        const jailedUser = await getJailedUser(message.guild.id, member.id);
        if (!jailedUser) {
            return sendEmbed(message, {
                title: 'Not Jailed',
                description: `${member.user.tag} is not jailed.`,
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

        try {
            // Remove jail role
            await member.roles.remove(jailRole);

            // Restore roles
            const rolesToRestore = jailedUser.saved_role_ids.filter(roleId => message.guild.roles.cache.has(roleId));
            await member.roles.add(rolesToRestore);

            // Remove from DB
            await unjailUser(message.guild.id, member.id);

            sendEmbed(message, {
                title: 'User Unjailed',
                description: `${member.user.tag} has been unjailed and roles restored.`,
                color: 0x23272A,
            });
        } catch (error) {
            sendEmbed(message, {
                title: 'Error',
                description: `Failed to unjail user: ${error.message}`,
                color: 0x23272A,
            });
        }
    },
};
