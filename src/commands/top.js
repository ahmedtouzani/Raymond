const { AttachmentBuilder } = require('discord.js');
const { asEmbed } = require('../utils/responses');
const { getLeaderboard } = require('../database/levelSystem');
const { hydrateUsers } = require('../services/levelCards');
const { generateTopUsers } = require('../utils/canvasTopUsers');
const logger = require('../utils/logger');
module.exports = {
  name: 'top', aliases: ['top3', 'podium'], guildOnly: true, cooldown: 3, prefixless: true,
  description: 'Celebrate this server’s top three members.', usage: 'top [text|voice|combined]',
  async execute(message, args = []) {
    const type = ['text', 'voice', 'combined'].includes(args[0]?.toLowerCase()) ? args[0].toLowerCase() : 'text';
    try {
      const rows = await getLeaderboard(message.guild.id, type, 3);
      if (!rows.length) return message.reply(asEmbed(`No ${type} XP has been earned in this server yet.`));
      const users = await hydrateUsers(message.guild, rows);
      const image = await generateTopUsers({ users, guild: message.guild, type });
      return await message.reply({ files: [new AttachmentBuilder(image, { name: 'top-users.png' })] });
    } catch (error) {
      logger.warn('Podium could not be displayed', { guildId: message.guild.id, code: error.code || error.name });
      return message.reply(asEmbed('Could not load the podium. Please try again.'));
    }
  },
};
