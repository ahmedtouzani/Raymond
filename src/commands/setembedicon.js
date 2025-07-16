const { sendEmbed } = require('../handlers/functions/sendEmbed');
const { setGuildEmbedSetting } = require('../database/guildConfig');

module.exports = {
  name: 'setembedicon',
  description: 'Set the embed footer icon for this server (admin only).',
  usage: '<url>',
  async execute(message, args, client) {
    if (!message.member.permissions.has('Administrator')) {
      return sendEmbed(message, { title: 'Permission Denied', description: 'Only administrators can change the embed icon.' }, { flags: 64 });
    }
    const url = args[0];
    if (!url || !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
      return sendEmbed(message, { title: 'Invalid Icon URL', description: 'Please provide a valid image URL (jpg, png, gif, webp).' });
    }
    await setGuildEmbedSetting(message.guild.id, 'footer', { iconURL: url });
    await setGuildEmbedSetting(message.guild.id, 'thumbnail', url);
    return sendEmbed(message, { title: 'Embed Icon Updated', description: 'Embed footer icon and thumbnail updated.' });
  },
};
