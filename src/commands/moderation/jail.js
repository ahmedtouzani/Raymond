const { asEmbed } = require('../../utils/responses');
const { recordAction } = require('../../services/moderationRecords');
const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');
const { getJailSettings, jailUser, getJailedUser, setJailRole, setJailVoiceChannel } = require('../../database/jailSetting');
const { createUsageEmbed } = require('../../utils/embed');

module.exports = {
    name: 'jail',
    aliases: ['tla7', 'jailsetup'],
    description: 'Jail a user or configure the jail system.',
    usage: '=jail @user [reason] | =jail setup',
    cooldown: 5,
    prefixless: true,
    permissions: [PermissionsBitField.Flags.ManageRoles],
    category: 'Moderation',

    async execute(message, args, client) {
        // 1. Permission Check
        const ownerId = process.env.OWNER_ID;
        const isOwner = message.author.id === ownerId;
        const hasPerms = message.member.permissions.has(PermissionsBitField.Flags.ManageRoles);

        if (!isOwner && !hasPerms) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need the **Manage Roles** permission to use this command.',
                color: 0x23272A,
            });
        }

        const subcommand = args[0]?.toLowerCase();

        // 2. Handle Subcommands (Setup)
        if (subcommand === 'setup' || subcommand === 'config') {
            const settings = await getJailSettings(message.guild.id);
            const role = settings?.jail_role_id ? `<@&${settings.jail_role_id}>` : '❌ Not Set';
            const channel = settings?.jail_voice_channel_id ? `<#${settings.jail_voice_channel_id}>` : '❌ Not Set';

            return sendEmbed(message, {
                title: '🔒 Jail System Configuration',
                description: `**Current Settings:**\n• **Jail Role:** ${role}\n• **Jail Voice:** ${channel}\n\n**How to Configure:**\n\`!jail setrole @Role\` - Set the jail role\n\`!jail setvoice #Channel\` - Set the jail voice channel`,
                color: 0x23272A
            });
        }

        if (subcommand === 'setrole') {
            const role = message.mentions.roles.first();
            if (!role) return message.reply(asEmbed('Please mention a role. Usage: `!jail setrole @Role`'));
            await setJailRole(message.guild.id, role.id);
            return sendEmbed(message, { title: '✅ Success', description: `Jail role set to ${role}.`, color: 0x23272A });
        }

        if (subcommand === 'setvoice') {
            const channelId = args[1]?.replace(/[<#>]/g, '');
            const channel = message.guild.channels.cache.get(channelId);
            if (!channel || channel.type !== 2) return message.reply(asEmbed('Please mention a valid voice channel. Usage: `!jail setvoice #Channel`'));
            await setJailVoiceChannel(message.guild.id, channel.id);
            return sendEmbed(message, { title: '✅ Success', description: `Jail voice channel set to ${channel}.`, color: 0x23272A });
        }

        // 3. Handle Main Command (Jail User)
        let member = message.mentions.members.first();
        if (!member && args[0]) {
            try { member = await message.guild.members.fetch(args[0]); } catch (e) { }
        }

        if (!member) {
            // Show usage if no valid subcommand or member found
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'jail',
                description: '<a:warningbug:1467300628907954300> **User Not Found**',
                usage: '`!jail <@user> [reason]`\n`!jail setup` - Configure settings',
                examples: '`!jail @User Spamming`\n`!jail setup`'
            });
            return message.reply({ embeds: [embed] });
        }

        // 4. Protection Checks
        if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
            return sendEmbed(message, { title: 'Action Denied', description: 'You cannot jail this user.', color: 0x23272A });
        }

        // 5. Check Settings
        const guildSettings = await getJailSettings(message.guild.id);
        const jailRole = guildSettings?.jail_role_id ? message.guild.roles.cache.get(guildSettings.jail_role_id) : null;

        if (!jailRole) {
            return sendEmbed(message, {
                title: '<a:warningbug:1467300628907954300> System Not Ready',
                description: 'The Jail Role is not configured!\nRun `!jail setup` to configure it.',
                color: 0xFF0000
            });
        }

        // 6. Execute Jail
        const rolesToRemove = member.roles.cache.filter(role => role.id !== message.guild.id && role.id !== jailRole.id);
        const savedRoleIds = rolesToRemove.map(role => role.id);

        try {
            await jailUser(message.guild.id, member.id, savedRoleIds);
            await member.roles.remove(rolesToRemove);
            await member.roles.add(jailRole);
            await recordAction(message, member.id, 'jail', args.slice(1).join(' ') || 'No reason provided');

            // Optional: Move to voice
            if (guildSettings.jail_voice_channel_id && member.voice.channel) {
                await member.voice.setChannel(guildSettings.jail_voice_channel_id).catch(() => { });
            }

            sendEmbed(message, {
                title: '🔒 User Jailed',
                description: `${member} has been jailed.`,
                fields: [{ name: 'Reason', value: args.slice(1).join(' ') || 'No reason provided' }],
                color: 0x23272A,
            });
        } catch (error) {
            sendEmbed(message, { title: 'Error', description: `Failed to jail user: ${error.message}`, color: 0x23272A });
        }
    },
};
