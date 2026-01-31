const { AttachmentBuilder } = require('discord.js');
const { getUserLevel } = require('../database/levelSystem');
const { generateRankCard } = require('../utils/canvasRankCard');

module.exports = {
  name: 'level',
  aliases: ['rank', 'xp'],
  description: 'Show your (or another user\'s) level and XP with a professional rank card.',
  usage: 'level [@user] [text|voice] [theme]',
  prefixless: true,
  async execute(message, args) {
    // Parse arguments
    let target = message.mentions.members.first() || message.member;
    let type = 'text';
    let theme = null; // Will be fetched from database

    // Check for type argument
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (['text', 'voice'].includes(lower)) {
        type = lower;
      } else if (['dark', 'light', 'neon', 'gradient'].includes(lower)) {
        theme = lower; // Override database preference if specified
      }
    }

    // Fetch user's theme preference if not specified in args
    if (!theme) {
      try {
        const db = require('../services/database');
        const { rows } = await db.query(
          'SELECT rank_card_theme FROM user_preferences WHERE guild_id = $1 AND user_id = $2',
          [message.guild.id, target.id]
        );
        theme = rows[0]?.rank_card_theme || 'dark';
      } catch (error) {
        console.error('Error fetching theme preference:', error);
        theme = 'dark'; // Fallback to dark theme
      }
    }

    // Get user data
    const data = await getUserLevel(message.guild.id, target.id);
    if (!data) {
      return message.reply(`${target} has no ${type} XP yet.`);
    }

    // Check if user has any XP in the selected type
    const hasXP = type === 'text' ? data.text_xp > 0 || data.text_level > 1 : data.voice_xp > 0 || data.voice_level > 1;
    if (!hasXP) {
      return message.reply(`${target} has no ${type} XP yet.`);
    }

    try {
      // Calculate rank
      const { getLeaderboard } = require('../database/levelSystem');
      const leaderboard = await getLeaderboard(message.guild.id, type, 1000);
      const rank = leaderboard.findIndex(u => u.user_id === target.id) + 1;

      // Generate rank card
      const cardBuffer = await generateRankCard(data, target, type, rank, theme);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank-card.png' });

      await message.reply({ files: [attachment] });
    } catch (error) {
      console.error('Error generating rank card:', error);

      // Fallback to text-based display
      const level = type === 'text' ? data.text_level : data.voice_level;
      const xp = type === 'text' ? data.text_xp : data.voice_xp;
      const nextLevelXp = type === 'text' ? data.text_next_level_xp : data.voice_next_level_xp;
      const progress = Math.round((xp / nextLevelXp) * 20);
      const bar = '▰'.repeat(progress) + '▱'.repeat(20 - progress);

      return message.reply(
        `**${target.displayName}** - ${type === 'text' ? '📝 Text' : '🎤 Voice'} Level\n` +
        `Level: **${level}**\n` +
        `XP: **${xp.toLocaleString()}** / **${nextLevelXp.toLocaleString()}**\n` +
        `${bar}\n\n` +
        `*Rank card generation failed. Try again later.*`
      );
    }
  }
};
