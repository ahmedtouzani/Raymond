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
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'setjailvoice',
                description: '<a:warningbug:905560995886411806> **Invalid Channel**\nPlease provide a valid voice channel ID or mention.',
                usage: '`!setjailvoice <channel_id>`',
                examples: '`!setjailvoice 123456789012345678`'
            });
            return message.reply({ embeds: [embed] });
        }

        try {
            await setJailVoiceChannel(message.guild.id, channelId);
            return sendEmbed(message, {
                title: '<a:okey:1467170671351173121> Jail Voice Channel Set',
                description: `Jailed users will now be moved to <#${channelId}>.`,
                color: 0x23272A,
            });
        } catch (error) {
            return sendEmbed(message, {
                title: '<a:warningbug:905560995886411806> Error',
                description: `Failed to set jail voice channel.\n\`\`\`${error.message}\`\`\``,
                color: 0x23272A,
            });
        }
    },
};