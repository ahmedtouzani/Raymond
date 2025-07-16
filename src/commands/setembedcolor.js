const { sendEmbed } = require('../handlers/functions/sendEmbed');
const { setGuildEmbedSetting } = require('../database/guildConfig');

module.exports = {
  name: 'setembedcolor',
  description: 'Set the embed color for this server (admin only).',
  usage: '<hex>',
  async execute(message, args, client) {
    if (!message.member.permissions.has('Administrator')) {
      return sendEmbed(message, { title: 'Permission Denied', description: 'Only administrators can change the embed color.' }, { flags: 64 });
    }
    const hex = args[0]?.replace(/^#/, '');
    if (!/^([A-Fa-f0-9]{6})$/.test(hex)) {
      return sendEmbed(message, { title: 'Invalid Color', description: 'Please provide a valid hex color (e.g. #5865F2).' });
    }
    await setGuildEmbedSetting(message.guild.id, 'color', parseInt(hex, 16));
    return sendEmbed(message, { title: 'Embed Color Updated', description: `Embed color set to **#${hex.toUpperCase()}**.` });
  },
};
