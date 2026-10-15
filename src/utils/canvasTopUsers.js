const d = require('./cardDesign');
async function generateTopUsers({ users = [], guild, type = 'text' }) {
  const entries = users.slice(0, 3);
  return d.frame(JSON.stringify(['podium', guild.id, guild.name, type, entries]), async () => {
    const images = await Promise.all(entries.map(user => d.avatar(user.avatarURL)));
    const { canvas, ctx } = d.base(1120, 640), c = d.colors;
    d.text(ctx, 'THE TOP THREE', 36, 112, 39, c.text, 'bold');
    d.text(ctx, `${guild.name} · ${type === 'combined' ? 'Combined lifetime XP' : `${type === 'voice' ? 'Voice' : 'Text'} ladder`}`, 38, 146, 18, c.muted, 'normal', 1000);
    const positions = [[404, 184, 1], [48, 224, 2], [760, 244, 3]];
    entries.forEach((u, i) => {
      const [x, y] = positions[i], height = 566 - y;
      d.rounded(ctx, x, y, 312, height, 20, c.panel, i === 0 ? '#887149' : c.line);
      d.text(ctx, `#0${i + 1}`, x + 24, y + 38, 22, i === 0 ? c.gold : c.muted, 'bold');
      d.portrait(ctx, images[i], u.username, x + 108, y + 58, 96, i === 0 ? c.gold : c.line);
      d.text(ctx, u.username, x + 24, y + 196, 24, c.text, 'bold', 264);
      d.text(ctx, `LEVEL ${u.level}`, x + 24, y + 234, 19, c.gold, 'bold');
      d.text(ctx, `${d.number(u.totalXP)} lifetime XP`, x + 24, y + 268, 17, c.muted);
    });
    d.footer(ctx, 1120, 612, 'Earn your place. Keep your progress.');
    return canvas.encode('png');
  });
}
module.exports = { generateTopUsers };
