const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { setGuildEmbedSetting } = require('../../database/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setembedfooter')
    .setDescription('Set the embed footer text for this server (admin only).')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('The footer text to set')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const text = interaction.options.getString('text');
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendEmbed(interaction, {
        title: 'Permission Denied',
        description: 'Only administrators can change the embed footer.'
      }, true);
    }
    if (!text || text.length > 2048) {
      return sendEmbed(interaction, {
        title: 'Invalid Footer Text',
        description: 'Please provide a valid footer text (max 2048 characters).'
      }, true);
    }
    await setGuildEmbedSetting(interaction.guildId, 'footer', { text });
    await sendEmbed(interaction, {
      title: '<:Done:1305644486453493801> Embed Footer Updated',
      description: `Embed footer set to: \`${text}\``
    });
  }
};
