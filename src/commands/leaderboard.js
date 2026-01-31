const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getLeaderboard } = require('../database/levelSystem');
const { generateLeaderboard } = require('../utils/canvasLeaderboard');
const { getGuildTheme } = require('../database/levelSettings');

// Helper: create a progress bar for XP
function createProgressBar(xp, nextLevelXp, length = 14) {
  const percent = Math.min(1, xp / nextLevelXp);
  const filled = Math.round(percent * length);
  return `▰`.repeat(filled) + `▱`.repeat(length - filled);
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb'],
  description: 'Show the top users by level (text or voice) in this server.',
  usage: 'leaderboard [text|voice] [page]',
  prefixless: true,
  async execute(message, args) {
    // Parse arguments
    let type = 'text';
    let page = 1;

    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (['text', 'voice'].includes(lower)) {
        type = lower;
      } else if (!isNaN(arg)) {
        page = Math.max(1, parseInt(arg));
      }
    }

    const usersPerPage = 10;
    const offset = (page - 1) * usersPerPage;

    // Fetch leaderboard data
    let leaderboard = [];
    try {
      leaderboard = await getLeaderboard(message.guild.id, type, 100);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return message.reply('❌ Failed to fetch leaderboard data.');
    }

    if (!leaderboard || leaderboard.length === 0) {
      return message.reply(`No ${type} XP data available yet.`);
    }

    const totalPages = Math.ceil(leaderboard.length / usersPerPage);
    page = Math.min(page, totalPages);

    const pageData = leaderboard.slice(offset, offset + usersPerPage);

    // Prepare user data for Canvas
    const users = [];
    for (let i = 0; i < pageData.length; i++) {
      const globalRank = offset + i + 1;
      const user = pageData[i];

      try {
        const member = await message.guild.members.fetch(user.user_id);
        const nextLevelXp = user.next_level_xp || calculateNextLevelXp(user.level);

        users.push({
          rank: globalRank,
          username: member.user.username,
          avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
          level: user.level,
          currentXP: user.xp,
          nextLevelXP: nextLevelXp,
          totalXP: user.xp // For display purposes
        });
      } catch (error) {
        // Skip users who left the server
        continue;
      }
    }

    if (users.length === 0) {
      return message.reply('No active users found on this page.');
    }

    // Get server theme
    const theme = await getGuildTheme(message.guild.id);

    // Generate Canvas leaderboard
    let imageBuffer;
    try {
      imageBuffer = await generateLeaderboard({
        users,
        guild: message.guild,
        type,
        page,
        totalPages,
        theme
      });
    } catch (error) {
      console.error('[Leaderboard] Error generating Canvas:', error);
      return message.reply('❌ Failed to generate leaderboard image.');
    }

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

    // Navigation buttons
    const row = new ActionRowBuilder();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lb_${type}_${Math.max(1, page - 1)}`)
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),

      new ButtonBuilder()
        .setCustomId(`lb_page_${type}_${page}`)
        .setLabel(`Page ${page}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId(`lb_${type}_${Math.min(totalPages, page + 1)}`)
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),

      new ButtonBuilder()
        .setCustomId(`lb_refresh_${type}_${page}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Success)
    );

    await message.reply({ files: [attachment], components: [row] });
  }
};

// Helper function to calculate next level XP
function calculateNextLevelXp(level) {
  if (level >= 100) return 0;
  if (level < 30) {
    return 500 * level * level - 500 * level + 1000;
  } else {
    return 200000 + (level - 30) * 50000;
  }
}