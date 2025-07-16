const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setGuildEmbedSetting } = require('../../database/guildConfig');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setembedcolor')
    .setDescription('Set the embed color for this server.')
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Hex color code (e.g. #ffcc00)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only admins

  async execute(interaction) {
    const color = interaction.options.getString('color', true);

    // Validate hex color
    if (!/^#?[0-9A-Fa-f]{6}$/.test(color)) {
      return sendEmbed(interaction, {
        title: '❌ Invalid Color',
        description: 'Please provide a valid hex color code (e.g. #ffcc00).',
        color: '#ff0000'
      }, true);
    }

    // Remove # if present
    const cleanColor = color.startsWith('#') ? color : `#${color}`;

    // Update in DB
    await setGuildEmbedSetting(interaction.guildId, 'color', cleanColor);

    // Confirm to user
    await sendEmbed(interaction, {
      title: '<:Done:1305644486453493801> Embed Color Updated',
      description: `Embed color set to \`${cleanColor}\` for this server.`,
      color: cleanColor
    });
  }
};