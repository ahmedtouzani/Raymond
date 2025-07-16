const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { setJailVoiceChannel } = require('../../database/jailSetting');

module.exports = {
    name: 'setjailvoice',
    description: 'Set the voice channel to be used for jailed users.',
    usage: '=setjailvoice <channel_id>',
    cooldown: 5,
    permissions: [PermissionsBitField.Flags.ManageGuild],
    category: 'Moderation',
    async execute(message, args) {
        const ownerId = process.env.OWNER_ID;
        const isOwner = message.author.id === ownerId;

        if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need the **Manage Server** permission to use this command.',
                color: 0x23272A,
            });
        }

        const channelId = args[0]?.replace(/[<#>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);

        if (!channel || channel.type !== 2) {
            return sendEmbed(message, {
                title: '❌ Invalid Channel',
                description: 'Please provide a valid voice channel ID or mention.',
                color: 0x23272A,
            });
        }

        try {
            await setJailVoiceChannel(message.guild.id, channelId);
            return sendEmbed(message, {
                title: '✅ Jail Voice Channel Set',
                description: `Jailed users will now be moved to <#${channelId}>.`,
                color: 0x23272A,
            });
        } catch (error) {
            return sendEmbed(message, {
                title: '❌ Error',
                description: `Failed to set jail voice channel.\n\`\`\`${error.message}\`\`\``,
                color: 0x23272A,
            });
        }
    },
};