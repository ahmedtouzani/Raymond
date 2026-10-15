const { leaveAfk } = require('../../services/afkVoice');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { isBotOwner } = require('../../handlers/commandAuthorization');

module.exports = {
    name: 'unafk', ownerOnly: true, guildOnly: true,
    description: 'Makes the bot leave the voice channel.',
    category: 'OwnerOnly',
    async execute(message) {
        if (!isBotOwner(message.author.id)) return sendEmbed(message, {
            title: 'Permission Denied', description: 'This command is for the bot owner only.', color: 0x23272A,
        });
        const left = leaveAfk(message.guild.id);
        return sendEmbed(message, {
            title: left ? 'AFK Mode Deactivated' : 'Not in Voice Channel',
            description: left ? 'Left the voice channel. Any pending AFK connection was cancelled.' : 'I am not currently in a voice channel.',
            color: 0x23272A,
        });
    },
};
