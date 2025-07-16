const { EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../database/levelSystem');

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
  usage: 'leaderboard',
  prefixless: true,
  async execute(message, args) {
    // Defensive: always default to array
    let textTop = [];
    let voiceTop = [];
    try {
      const [text, voice] = await Promise.all([
        getLeaderboard(message.guild.id, 'text', 10),
        getLeaderboard(message.guild.id, 'voice', 10)
      ]);
      // Only assign if they're arrays
      if (Array.isArray(text)) textTop = text;
      if (Array.isArray(voice)) voiceTop = voice;
    } catch {
      // If any error, keep as empty arrays
    }

    const medals = ["<:60486gold:1379102737874030744>", "<:11128bronze:1379102709944156180>", "<:11128silver:1379102714490912901>"];
    const formatXP = n => n.toLocaleString();
    const fetchAvatar = async userId => {
      try {
        const member = await message.guild.members.fetch(userId);
        return member.user.displayAvatarURL({ extension: 'png', size: 64 });
      } catch { return null; }
    };

    // Modern text ladder
    let textDescArr = [];
    if (textTop.length) {
      textDescArr = await Promise.all(textTop.map(async (u, i) => {
        try {
          const medal = medals[i] || `**${i+1}.**`;
          const avatar = await fetchAvatar(u.user_id);
          const nextLevelXp = u.next_level_xp || (u.level < 100 ? 500 * u.level * u.level - 500 * u.level + 1000 : 0);
          const bar = createProgressBar(u.xp, nextLevelXp);
          return `${medal} <@${u.user_id}>\nLevel **${u.level}**\n${formatXP(u.xp)} / ${formatXP(nextLevelXp)} XP\n${bar}`;
        } catch {
          return null;
        }
      }));
    }
    // Filter to only non-empty strings, ensure fallback is always a valid string
    let textDesc = Array.isArray(textDescArr) ? textDescArr.filter(x => typeof x === 'string' && x.trim()).join("\n\n") : '';
    if (!textDesc || typeof textDesc !== 'string' || textDesc.trim().length === 0) textDesc = 'No data.';

    // Modern voice ladder
    let voiceDescArr = [];
    if (Array.isArray(voiceTop) && voiceTop.length) {
      voiceDescArr = await Promise.all(voiceTop.map(async (u, i) => {
        try {
          const medal = medals[i] || `**${i+1}.**`;
          const avatar = await fetchAvatar(u.user_id);
          const nextLevelXp = u.next_level_xp || (u.level < 100 ? 500 * u.level * u.level - 500 * u.level + 1000 : 0);
          const bar = createProgressBar(u.xp, nextLevelXp);
          return `${medal} <@${u.user_id}>\nLevel **${u.level}**\n${formatXP(u.xp)} / ${formatXP(nextLevelXp)} XP\n${bar}`;
        } catch {
          return null;
        }
      }));
    }
    // Filter to only non-empty strings, ensure fallback is always a valid string
    let voiceDesc = Array.isArray(voiceDescArr) ? voiceDescArr.filter(x => typeof x === 'string' && x.trim()).join("\n\n") : '';
    if (!voiceDesc || typeof voiceDesc !== 'string' || voiceDesc.trim().length === 0) voiceDesc = 'No data.';

    // Truncate embed fields to Discord's 1024 character limit
    function truncateField(str, max = 1024) {
      if (typeof str !== 'string') return 'No data.';
      if (str.length <= max) return str;
      const cut = str.lastIndexOf('\n\n', max - 10);
      return (cut > 0 ? str.slice(0, cut) : str.slice(0, max - 3)) + '\n...';
    }
    const safeTextDesc = truncateField(textDesc);
    const safeVoiceDesc = truncateField(voiceDesc);


    const embed = new EmbedBuilder()
      .setTitle('<:mvp:1305642262079868969> Server Leaderboards')
      .setColor(0x5865F2)
      .addFields(
        { name: '<a:arrow_gn2:1309168756827623525> Text Ladder', value: safeTextDesc, inline: true },
        { name: '<a:arrow_gn2:1309168756827623525> Voice Ladder', value: safeVoiceDesc, inline: true }
      )
      .setTimestamp(Date.now())
      .setFooter({ text: `Leaderboard • ${message.guild.name}` });

    // Show top text user avatar as thumbnail if available
    try {
      if (textTop[0]) {
        const member = await message.guild.members.fetch(textTop[0].user_id);
        embed.setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
      }
    } catch {}
    return message.reply({ embeds: [embed] });
  }
};