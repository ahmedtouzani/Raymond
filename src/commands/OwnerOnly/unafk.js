const { getVoiceConnection } = require('@discordjs/voice');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
    name: 'unafk',
    description: 'Makes the bot leave the voice channel.',
    category: 'OwnerOnly',
    async execute(message, args, client) {
        if (message.author.id !== process.env.OWNER_ID) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'This command is for the bot owner only.',
                color: 0x23272A,
            });
        }

        const connection = getVoiceConnection(message.guild.id);

        if (!connection) {
            return sendEmbed(message, {
                title: '❓ Not in Voice Channel',
                description: 'I am not currently in a voice channel.',
                color: 0x23272A,
            });
        }

        try {
            connection.destroy();

            return sendEmbed(message, {
                title: '☀️ AFK Mode Deactivated',
                description: 'Left the voice channel.',
                color: 0x23272A,
            });

        } catch (error) {
            console.error(error);
            return sendEmbed(message, {
                title: '❌ Disconnection Error',
                description: 'Could not leave the voice channel.',
                color: 0xFF0000,
            });
        }
    },
};
