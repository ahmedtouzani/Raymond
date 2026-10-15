const d = require('./cardDesign');
async function generateLeaderboard({ users = [], guild, type = 'text', page = 1, totalPages = 1 }) {
  const entries = users.slice(0, 10);
  return d.frame(JSON.stringify(['board', guild.id, guild.name, type, page, totalPages, entries]), async () => {
    const images = await Promise.all(entries.map(user => d.avatar(user.avatarURL)));
    const height = 190 + entries.length * 83 + 68;
    const { canvas, ctx } = d.base(1120, height), c = d.colors;
    d.text(ctx, 'THE LEADERBOARD', 36, 109, 37, c.text, 'bold');
    d.text(ctx, `${type === 'voice' ? 'Voice' : 'Text'} activity · ${guild.name}`, 38, 140, 18, c.muted, 'normal', 820);
    d.text(ctx, `PAGE ${page} / ${totalPages}`, 909, 108, 16, c.gold, 'bold');
    d.text(ctx, 'RANK / MEMBER', 40, 178, 12, c.muted, 'bold');
    d.text(ctx, 'PROGRESS', 624, 178, 12, c.muted, 'bold'); d.text(ctx, 'LEVEL', 996, 178, 12, c.muted, 'bold');
    for (let i = 0; i < entries.length; i++) {
      const u = entries[i], y = 193 + i * 83, first = u.rank === 1;
      d.rounded(ctx, 30, y, 1060, 74, 13, c.panel, first ? '#746347' : c.line);
      d.text(ctx, `#${u.rank}`, 46, y + 43, 21, first ? c.gold : c.muted, 'bold');
      d.portrait(ctx, images[i], u.username, 116, y + 13, 46, first ? c.gold : c.line);
      d.text(ctx, u.username, 184, y + 33, 23, c.text, 'bold', 400);
      d.text(ctx, u.unavailable ? 'Member unavailable' : `${d.number(u.currentXP)} / ${d.number(u.nextLevelXP)} XP`, 185, y + 56, 14, c.muted);
      d.progress(ctx, 624, y + 33, 276, u.level >= 100 ? 1 : u.currentXP / u.nextLevelXP);
      d.text(ctx, u.level >= 100 ? 'MAX LEVEL' : `${d.number(Math.max(0, u.nextLevelXP - u.currentXP))} XP remaining`, 624, y + 61, 13, c.muted);
      d.text(ctx, String(u.level).padStart(2, '0'), 997, y + 49, 31, c.gold, 'bold');
    }
    d.footer(ctx, 1120, height - 26, `${entries.length} members · ${type === 'voice' ? 'Voice' : 'Text'} ladder`);
    return canvas.encode('png');
  });
}
module.exports = { generateLeaderboard };
