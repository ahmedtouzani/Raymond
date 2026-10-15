const { PermissionsBitField: { Flags } } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { isBotOwner } = require('../../handlers/commandAuthorization');
const { joinAfk } = require('../../services/afkVoice');
const logger = require('../../utils/logger');

module.exports = {
    name: 'afk', ownerOnly: true, guildOnly: true,
    description: 'Makes the bot join your voice channel and go AFK.',
    category: 'OwnerOnly',
    async execute(message) {
        if (!isBotOwner(message.author.id)) return sendEmbed(message, {
            title: 'Permission Denied', description: 'This command is for the bot owner only.', color: 0x23272A,
        });
        const channel = message.member.voice.channel;
        if (!channel) return sendEmbed(message, {
            title: 'No Voice Channel', description: 'You need to be in a voice channel to use this command.', color: 0x23272A,
        });
        const bot = await message.guild.members.fetchMe();
        if (!channel.permissionsFor(bot)?.has([Flags.ViewChannel, Flags.Connect])) return sendEmbed(message, {
            title: 'Missing Voice Permissions', description: 'I need View Channel and Connect in your voice channel.', color: 0xFF0000,
        });
        let result;
        try {
            result = await joinAfk(message.guild, channel.id);
        } catch (error) {
            const blocked = /unexpected server response: 403/i.test(error.message || '');
            logger.warn('AFK connection failed', { guildId: message.guild.id, code: blocked ? 'VOICE_HTTP_403' : error.code || error.name });
            return sendEmbed(message, {
                title: error.code === 'VOICE_BUSY' ? 'Connection in Progress' : 'Voice Connection Failed',
                description: error.code === 'VOICE_BUSY' ? 'Please wait for the current connection attempt, or use unafk to cancel it.'
                    : blocked ? 'The hosting network rejected the Discord Voice connection. Check outbound Voice WebSocket and UDP access.'
                        : 'The Discord Voice connection did not become ready. The incomplete connection was closed. Check host networking and bot logs, then try again.',
                color: 0xFF0000,
            });
        }
        if (result.cancelled) return;
        return sendEmbed(message, {
            title: 'AFK Mode Activated',
            description: `${result.alreadyJoined ? 'Already connected to' : 'Connected to'} **${channel.name}**. Staying AFK, muted and deafened.`,
            color: 0x23272A,
        });
    },
};
