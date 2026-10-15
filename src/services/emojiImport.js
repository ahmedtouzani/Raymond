const { PermissionsBitField: { Flags } } = require('discord.js');
const { isBotOwner } = require('../handlers/commandAuthorization');
const MAX_BYTES = 256 * 1024;

function parseEmojis(args) {
  const tokens = args.join(' ').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) throw new Error('Paste a custom emoji or its Discord code.');
  const specs = [];
  let rename = null;
  for (const token of tokens) {
    const match = token.match(/^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/);
    if (match) {
      specs.push({ id: match[3], name: match[2], animated: match[1] === 'a' });
    } else {
      if (rename || !/^[A-Za-z0-9_]{2,32}$/.test(token)) throw new Error('Use custom emoji codes and an optional name of 2–32 letters, numbers, or underscores.');
      rename = token;
    }
  }
  if (!specs.length) throw new Error('Unicode emojis cannot be imported. Paste a Discord custom emoji.');
  if (rename && specs.length !== 1) throw new Error('A custom name is supported when importing one emoji at a time.');
  if (specs.length > 10) throw new Error('Import up to 10 emojis at a time.');
  const unique = [...new Map(specs.map(spec => [spec.id, spec])).values()];
  if (rename) unique[0].name = rename;
  return unique;
}
function slotLimit(guild) {
  const tiers = [50, 100, 150, 250];
  return Math.max(tiers[Number(guild.premiumTier)] || 50, guild.features?.includes('MORE_EMOJI') ? 200 : 0);
}
function planImports(guild, specs) {
  const existing = [...guild.emojis.cache.values()];
  const limit = slotLimit(guild);
  const remaining = {
    static: Math.max(0, limit - existing.filter(emoji => !emoji.managed && !emoji.animated).length),
    animated: Math.max(0, limit - existing.filter(emoji => !emoji.managed && emoji.animated).length),
  };
  const available = { ...remaining }, names = new Set(existing.map(emoji => emoji.name.toLowerCase()));
  const accepted = [], skipped = [];
  for (const spec of specs) {
    let reason = existing.some(emoji => emoji.id === spec.id) ? 'Already in this server' : names.has(spec.name.toLowerCase()) ? 'Name already exists' : null;
    const type = spec.animated ? 'animated' : 'static';
    if (!reason && available[type] < 1) reason = `No ${type} emoji slots left`;
    if (reason) skipped.push({ ...spec, reason });
    else { accepted.push(spec); available[type]--; names.add(spec.name.toLowerCase()); }
  }
  return { accepted, skipped, remaining };
}
function hasImportPermission(member, userId) {
  return isBotOwner(userId) || Boolean(member?.permissions?.has(Flags.ManageGuildExpressions) || member?.permissions?.has(Flags.CreateGuildExpressions));
}
function botCanImport(bot) {
  return Boolean(bot?.permissions?.has(Flags.ManageGuildExpressions) || bot?.permissions?.has(Flags.CreateGuildExpressions));
}
async function downloadEmoji(spec, fetcher = fetch) {
  const response = await fetcher(`https://cdn.discordapp.com/emojis/${spec.id}.${spec.animated ? 'gif' : 'png'}?size=128`,
    { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 404 ? 'Emoji no longer exists' : 'Could not download emoji');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Image exceeds Discord’s 256 KB limit');
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Image exceeds Discord’s 256 KB limit'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  const gif = buffer.subarray(0, 6).toString() === 'GIF89a' || buffer.subarray(0, 6).toString() === 'GIF87a';
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!(spec.animated ? gif : png)) throw new Error('The emoji image is unavailable or has an unexpected format');
  return buffer;
}
function publicError(error) {
  if (error.code === 50013) return 'The bot no longer has permission to create emojis';
  if (error.code === 30008) return 'The server has no emoji slots left';
  if (error.code === 50035) return 'Discord rejected the image or name';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'Download timed out';
  if (/^(Emoji no longer|Could not download|Image exceeds|The emoji image)/.test(error.message || '')) return error.message;
  return 'Could not import this emoji. Try again later';
}
module.exports = { parseEmojis, planImports, hasImportPermission, botCanImport, downloadEmoji, publicError };
