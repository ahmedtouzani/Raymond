const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { setGuildEmbedSetting } = require('../../database/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setembedicon')
    .setDescription('Set the embed footer icon for this server (admin only).')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('The image URL for the embed icon')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const url = interaction.options.getString('url');
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendEmbed(interaction, {
        title: 'Permission Denied',
        description: 'Only administrators can change the embed icon.'
      }, true);
    }
    if (!url ||
      !/^https?:\/\/.+(\.(jpg|jpeg|png|gif|webp)(\?.*)?$|[?&]format=(jpg|jpeg|png|gif|webp))/i.test(url)) {
      return sendEmbed(interaction, {
        title: 'Invalid Icon URL',
        description: 'Please provide a valid image URL (jpg, png, gif, webp).'
      }, true);
    }
    await setGuildEmbedSetting(interaction.guildId, 'footer', { iconURL: url });
    await setGuildEmbedSetting(interaction.guildId, 'thumbnail', url);
    await sendEmbed(interaction, {
      title: '<:Done:1305644486453493801> Embed Icon Updated',
      description: 'Embed footer icon and thumbnail updated.'
    });
  }
};
