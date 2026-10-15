const design = require('./cardDesign');
async function generateRankCard(data, member, type = 'text', rank = 0) {
  const level = Number(data[`${type}_level`]) || 1, xp = Number(data[`${type}_xp`]) || 0;
  const next = Number(data[`${type}_next_level_xp`]) || 0;
  const max = level >= 100, ratio = max ? 1 : next > 0 ? xp / next : 0;
  const name = member.displayName || member.user.username;
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 128 });
  const key = JSON.stringify(['rank', member.guild.id, member.guild.name, member.id, name, member.user.username, avatarURL, type, level, xp, next, rank]);
  return design.frame(key, async () => {
    const image = await design.avatar(avatarURL);
    const { canvas, ctx } = design.base(1000, 360), c = design.colors;
    design.text(ctx, `${type.toUpperCase()} RANK`, 790, 48, 16, c.muted, 'bold');
    ctx.strokeStyle = c.line; ctx.beginPath(); ctx.moveTo(36, 76); ctx.lineTo(964, 76); ctx.stroke();
    design.portrait(ctx, image, name, 42, 110, 124, c.gold);
    design.text(ctx, name, 202, 145, 34, c.text, 'bold', 540);
    design.text(ctx, `@${member.user.username}`, 204, 174, 17, c.muted, 'normal', 530);
    design.rounded(ctx, 804, 103, 156, 94, 16, c.panel, c.line);
    design.text(ctx, 'LEVEL', 825, 128, 13, c.muted, 'bold');
    design.text(ctx, String(level).padStart(2, '0'), 823, 178, 46, c.gold, 'bold');
    design.text(ctx, rank > 0 ? `SERVER RANK  #${design.number(rank)}` : 'LEVEL PROGRESS', 204, 218, 15, c.gold, 'bold');
    design.text(ctx, max ? 'MAX LEVEL' : `${Math.round(Math.min(1, ratio) * 100)}% TO NEXT LEVEL`, 747, 218, 13, c.muted, 'bold');
    design.progress(ctx, 204, 237, 756, ratio, 12);
    design.text(ctx, max ? `${design.number(xp)} XP · Level cap reached` : `${design.number(xp)} / ${design.number(next)} XP`, 204, 279, 20, c.text, 'bold');
    design.text(ctx, max ? 'You reached the summit.' : `${design.number(Math.max(0, next - xp))} XP to level ${level + 1}`, 640, 279, 17, c.muted, 'normal', 320);
    design.footer(ctx, 1000, 333, member.guild.name);
    return canvas.encode('png');
  });
}
module.exports = { generateRankCard };
