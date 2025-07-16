const { EmbedBuilder } = require('discord.js');
const { getUserLevel } = require('../database/levelSystem');

module.exports = {
  name: 'level',
  aliases: ['rank', 'xp'],
  description: 'Show your (or another user\'s) level and XP.',
  usage: 'level [@user',
  prefixless: true,
  async execute(message, args) {
    let target = message.mentions.members.first() || message.member;
    let ladder = 'text';
    if (args[0] && ['text','voice'].includes(args[0].toLowerCase())) ladder = args[0].toLowerCase();
    if (args[1] && ['text','voice'].includes(args[1].toLowerCase())) ladder = args[1].toLowerCase();
    const data = await getUserLevel(message.guild.id, target.id);
    if (!data) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`${target} has no ${ladder} XP yet.`)
            .setColor(0x23272A)
        ]
      });
    }
    // Always show both text and voice stats
    const textLevel = data.text_level;
    const textXp = data.text_xp;
    const textNext = data.text_next_level_xp;
    const textProgress = Math.round((textXp / textNext) * 20);
    const textBar = '▰'.repeat(textProgress) + '▱'.repeat(20 - textProgress);

    const voiceLevel = data.voice_level;
    const voiceXp = data.voice_xp;
    const voiceNext = data.voice_next_level_xp;
    const voiceProgress = Math.round((voiceXp / voiceNext) * 20);
    const voiceBar = '▰'.repeat(voiceProgress) + '▱'.repeat(20 - voiceProgress);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Level Stats for ${target.displayName}`)
          .setDescription(
            `**Text Ladder**\nLevel: **${textLevel}**\nXP: **${textXp}** / **${textNext}**\n${textBar}\n\n` +
            `**Voice Ladder**\nLevel: **${voiceLevel}**\nXP: **${voiceXp}** / **${voiceNext}**\n${voiceBar}`
          )
          .setColor(0x3498DB)
      ]
    });
  }
};
