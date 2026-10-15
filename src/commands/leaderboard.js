const { asEmbed } = require('../utils/responses');
const { leaderboardMessage } = require('../services/levelCards');
const logger = require('../utils/logger');
module.exports = {
  name: 'leaderboard', aliases: ['lb'], guildOnly: true, cooldown: 3, prefixless: true,
  description: 'Browse this server’s text or voice leaderboard.', usage: 'leaderboard [text|voice] [page]',
  async execute(message, args = []) {
    const type = args.some(arg => arg.toLowerCase() === 'voice') ? 'voice' : 'text';
    const page = Number(args.find(arg => /^\d+$/.test(arg)) || 1);
    try { return await message.reply(await leaderboardMessage(message.guild, type, page)); }
    catch (error) {
      logger.warn('Leaderboard could not be displayed', { guildId: message.guild.id, code: error.code || error.name });
      return message.reply(asEmbed('Could not load the leaderboard. Please try again.'));
    }
  },
};
