const { asEmbed } = require('../utils/responses');
const { AttachmentBuilder } = require('discord.js');
const { getRankedUserLevel } = require('../database/levelSystem');
const { generateRankCard } = require('../utils/canvasRankCard');
const logger = require('../utils/logger');
module.exports = {
  name: 'level', aliases: ['r', 'rank', 'xp'], guildOnly: true, cooldown: 3, prefixless: true,
  description: 'Show your text or voice level with the Raymond signature rank card.',
  usage: 'level [@member] [text|voice]',
  async execute(message, args = []) {
    const member = message.mentions.members.first() || message.member;
    const type = args.some(arg => arg.toLowerCase() === 'voice') ? 'voice' : 'text';
    const data = await getRankedUserLevel(message.guild.id, member.id, type);
    try {
      const image = await generateRankCard(data, member, type, data.rank);
      return message.reply({ files: [new AttachmentBuilder(image, { name: 'rank-card.png' })] });
    } catch (error) {
      logger.warn('Rank card could not be rendered', { guildId: message.guild.id, code: error.code || error.name });
      return message.reply(asEmbed(`**${member.displayName}** · ${type === 'voice' ? 'Voice' : 'Text'} rank\nLevel **${data[`${type}_level`]}** · Rank **${data.rank || 'Unranked'}**\nXP: **${data[`${type}_xp`]} / ${data[`${type}_next_level_xp`]}**`));
    }
  },
};
