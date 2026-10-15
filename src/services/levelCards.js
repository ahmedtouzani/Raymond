const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLeaderboardPage } = require('../database/levelSystem');
const { generateLeaderboard } = require('../utils/canvasLeaderboard');
const icons = require('../config/setupEmojis');
const { asEmbed } = require('../utils/responses');
const unavailable = new Map(), loading = new Map();
async function resolveMember(guild, id) {
  const cached = guild.members.cache?.get(id);
  if (cached) return cached;
  const key = `${guild.id}:${id}`;
  if (unavailable.get(key) > Date.now()) return null;
  if (loading.has(key)) return loading.get(key);
  const promise = guild.members.fetch(id).catch(() => {
    unavailable.set(key, Date.now() + 30000);
    while (unavailable.size > 512) unavailable.delete(unavailable.keys().next().value);
    return null;
  });
  loading.set(key, promise);
  try { return await promise; } finally { loading.delete(key); }
}
async function hydrateUsers(guild, rows, offset = 0) {
  const users = Array(rows.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (index < rows.length) {
      const i = index++, row = rows[i], member = await resolveMember(guild, row.user_id);
      users[i] = { rank: offset + i + 1, username: member?.displayName || member?.user.username || `Member ${row.user_id.slice(-6)}`,
        avatarURL: member?.user.displayAvatarURL({ extension: 'png', size: 128 }) || null,
        unavailable: !member, level: Number(row.level), currentXP: Number(row.xp), nextLevelXP: Number(row.next_level_xp), totalXP: Number(row.total_xp) };
    }
  }));
  return users;
}
function navigation(type, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lb_${type}_${Math.max(1, page - 1)}_prev`).setLabel('Previous').setEmoji(icons.arrow).setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`lb_page_${type}_${page}`).setLabel(`${page} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`lb_${type}_${Math.min(totalPages, page + 1)}_next`).setLabel('Next').setEmoji(icons.arrow).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
    new ButtonBuilder().setCustomId(`lb_refresh_${type}_${page}`).setLabel('Refresh').setEmoji(icons.utility).setStyle(ButtonStyle.Primary),
  );
}
async function leaderboardMessage(guild, type, page, refresh = false) {
  const result = await getLeaderboardPage(guild.id, type, page, refresh);
  if (!result.total) return asEmbed({ content: `No ${type} XP has been earned in this server yet.`, components: [], attachments: [] });
  const users = await hydrateUsers(guild, result.users, result.offset);
  const image = await generateLeaderboard({ users, guild, type, page: result.page, totalPages: result.totalPages });
  return { content: '', embeds: [], attachments: [], files: [new AttachmentBuilder(image, { name: 'leaderboard.png' })], components: [navigation(type, result.page, result.totalPages)], allowedMentions: { parse: [] } };
}
module.exports = { hydrateUsers, navigation, leaderboardMessage };
