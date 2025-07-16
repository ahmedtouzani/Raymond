const { sendEmbed } = require('../handlers/functions/sendEmbed');
const { setGuildEmbedSetting } = require('../database/guildConfig');

module.exports = {
  name: 'setembedfooter',
  description: 'Set the embed footer text for this server (admin only).',
  usage: '<text>',
  async execute(message, args, client) {
    if (!message.member.permissions.has('Administrator')) {
      return sendEmbed(message, { title: 'Permission Denied', description: 'Only administrators can change the embed footer.' }, { flags: 64 });
    }
    const text = args.join(' ');
    if (!text || text.length > 100) {
      return sendEmbed(message, { title: 'Invalid Footer', description: 'Please provide a valid footer text (max 100 chars).' });
    }
    await setGuildEmbedSetting(message.guild.id, 'footer', { text });
    return sendEmbed(message, { title: 'Embed Footer Updated', description: `Embed footer set to **${text}**.` });
  },
};
