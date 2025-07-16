const { SlashCommandBuilder } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

    async execute(interaction) {
      await sendEmbed(interaction, {
        title: '🏓 Pong!',
        description: 'The bot is online and responsive (slash command).',
      });
    },
};




  


