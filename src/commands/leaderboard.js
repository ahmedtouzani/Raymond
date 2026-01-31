const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getLeaderboard } = require('../database/levelSystem');
const { generateRankCard } = require('../utils/canvasRankCard');

// Helper: create a progress bar for XP
function createProgressBar(xp, nextLevelXp, length = 14) {
  const percent = Math.min(1, xp / nextLevelXp);
  const filled = Math.round(percent * length);
  return `▰`.repeat(filled) + `▱`.repeat(length - filled);
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
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

    // Build leaderboard embed
    const medals = ["🥇", "🥈", "🥉"];
    const formatXP = n => n.toLocaleString();

    let description = '';
    for (let i = 0; i < pageData.length; i++) {
      const globalRank = offset + i + 1;
      const user = pageData[i];
      const medal = globalRank <= 3 ? medals[globalRank - 1] : `**${globalRank}.**`;

      try {
        const member = await message.guild.members.fetch(user.user_id);
        const nextLevelXp = user.next_level_xp || calculateNextLevelXp(user.level);
        const bar = createProgressBar(user.xp, nextLevelXp, 12);

        description += `${medal} ${member.user.username}\n`;
        description += `Level **${user.level}** • ${formatXP(user.xp)} / ${formatXP(nextLevelXp)} XP\n`;
        description += `${bar}\n\n`;
      } catch (error) {
        // Skip users who left the server
        continue;
      }
    }

    if (!description) {
      description = 'No active users found.';
    }

    const embed = new EmbedBuilder()
      .setTitle(`${type === 'text' ? '📝 Text' : '🎤 Voice'} Leaderboard`)
      .setDescription(description)
      .setColor(type === 'text' ? 0x5865F2 : 0xED4245)
      .setFooter({ text: `Page ${page}/${totalPages} • ${leaderboard.length} total users` })
      .setTimestamp();

    // Add top user's avatar as thumbnail
    if (leaderboard[0]) {
      try {
        const topMember = await message.guild.members.fetch(leaderboard[0].user_id);
        embed.setThumbnail(topMember.user.displayAvatarURL({ extension: 'png', size: 128 }));
      } catch (error) {
        // Ignore if top user left
      }
    }

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

    // Server stats
    const totalXP = leaderboard.reduce((sum, u) => sum + u.xp, 0);
    const avgLevel = Math.round(leaderboard.reduce((sum, u) => sum + u.level, 0) / leaderboard.length);

    embed.addFields({
      name: '📊 Server Stats',
      value: `Total XP: **${formatXP(totalXP)}**\nAverage Level: **${avgLevel}**`,
      inline: false
    });

    await message.reply({ embeds: [embed], components: [row] });
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