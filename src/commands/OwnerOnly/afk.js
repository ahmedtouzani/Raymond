const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
    name: 'afk',
    description: 'Makes the bot join your voice channel and go AFK.',
    category: 'OwnerOnly',
    async execute(message, args, client) {
        if (message.author.id !== process.env.OWNER_ID) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'This command is for the bot owner only.',
                color: 0x23272A,
            });
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return sendEmbed(message, {
                title: '❓ No Voice Channel',
                description: 'You need to be in a voice channel to use this command.',
                color: 0x23272A,
            });
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

            return sendEmbed(message, {
                title: '🌙 AFK Mode Activated',
                description: `Joined **${voiceChannel.name}** and going AFK.`,
                color: 0x23272A,
            });

        } catch (error) {
            console.error(error);
            return sendEmbed(message, {
                title: ' Connection Error',
                description: 'Could not join the voice channel.',
                color: 0xFF0000,
            });
        }
    },
};
