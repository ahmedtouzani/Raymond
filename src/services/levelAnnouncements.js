const { AttachmentBuilder } = require('discord.js');
const { handleLevelUpRoles } = require('../utils/levelRoleManager');
const { getUserLevel } = require('../database/levelSystem');
const { generateRankCard } = require('../utils/canvasRankCard');
const { asEmbed } = require('../utils/responses');
async function announceLevelUp(guild, member, type, level, settings, fallback) {
  await handleLevelUpRoles(guild.client, guild.id, member.id, type, level);
  if (!settings.levelup_enabled) return;
  const channel = settings.levelup_channel_id ? guild.channels.cache.get(settings.levelup_channel_id) : fallback;
  if (!channel?.isTextBased()) return;
  const content = (settings.levelup_message || 'Congratulations {user}! You reached level {level}!')
    .replaceAll('{user}', `<@${member.id}>`).replaceAll('{level}', String(level));
  let files;
  if (settings.levelup_include_card) {
    const data = await getUserLevel(guild.id, member.id);
    files = [new AttachmentBuilder(await generateRankCard(data, member, type), { name: 'level-up.png' })];
  }
  await channel.send(asEmbed({ content, ...(files ? { files } : {}) }));
}
module.exports = { announceLevelUp };
