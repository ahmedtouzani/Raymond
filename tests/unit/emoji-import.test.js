const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { EmbedBuilder, PermissionsBitField: { Flags } } = require('discord.js');
const service = require('../../src/services/emojiImport');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const code = '<a:warningbug:1467300628907954300>';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

test('emoji parser supports animation, renaming and deduplicates IDs', () => {
  const parsed = service.parseEmojis([code, 'Warning']);
  assert.equal(parsed[0].animated, true); assert.equal(parsed[0].name, 'Warning');
  assert.equal(service.parseEmojis([code, code]).length, 1);
  assert.throws(() => service.parseEmojis(['👍']));
  assert.throws(() => service.parseEmojis([code, '<:other:123456789012345678>', 'rename']));
  assert.throws(() => service.parseEmojis([code, 'bad-name']));
});

test('import plan respects duplicate names, separate animation slots and boost capacity', () => {
  const guild = { premiumTier: 0, features: [], emojis: { cache: new Map(Array.from({ length: 50 }, (_, i) => [String(i), { id: String(i), name: `existing_${i}`, animated: false, managed: false }])) } };
  const plan = service.planImports(guild, [
    { id: 'a', name: 'new', animated: false }, { id: 'b', name: 'animation', animated: true }, { id: 'c', name: 'existing_1', animated: true },
  ]);
  assert.equal(plan.accepted.length, 1); assert.equal(plan.accepted[0].animated, true);
  assert.equal(plan.skipped.length, 2);
  guild.premiumTier = 1;
  assert.equal(service.planImports(guild, []).remaining.static, 50);
});

test('downloads use a fixed Discord CDN path, reject missing/oversized images and preserve GIFs', async () => {
  const spec = { id: '123456789012345678', animated: false };
  const result = await service.downloadEmoji(spec, async url => {
    assert.equal(url, 'https://cdn.discordapp.com/emojis/123456789012345678.png?size=128');
    return new Response(png);
  });
  assert(result.equals(png));
  await assert.rejects(service.downloadEmoji(spec, async () => new Response('', { status: 404 })), /no longer exists/);
  await assert.rejects(service.downloadEmoji(spec, async () => new Response(Buffer.alloc(256 * 1024 + 1))), /256 KB/);
  await assert.rejects(service.downloadEmoji(spec, async () => new Response('not an image')), /unexpected format/);
  const gif = await service.downloadEmoji({ ...spec, animated: true }, async () => new Response(Buffer.from('GIF89aimage')));
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
});

async function preview({ allowed = true, failSecond = false } = {}) {
  let permission = allowed;
  const added = [], replies = [], edits = [];
  const collector = new EventEmitter();
  collector.stop = reason => collector.emit('end', [], reason);
  let finish;
  const complete = new Promise(resolve => { finish = resolve; });
  const panel = { createMessageComponentCollector: () => collector, edit: async payload => {
    edits.push(payload);
    const title = payload.embeds[0].toJSON().title;
    if (['Emoji Import Complete', 'Import Cancelled', 'Import Stopped', 'Preview Expired'].includes(title)) finish();
  } };
  const guild = { id: 'guild', name: 'Guild', premiumTier: 0, features: [],
    members: { me: { permissions: { has: () => true } }, fetchMe: async () => {}, fetch: async () => ({ permissions: { has: () => permission } }) },
    emojis: { cache: new Map(), fetch: async () => {}, create: async options => {
      if (failSecond && added.length === 1) throw { code: 50013 };
      added.push(options); return { toString: () => '<a:imported:123456789012345678>' };
    } },
  };
  const command = loadModule('src/commands/moderation/stealemoji.js', {
    '../../utils/embed': { createEmbed: async (_, options) => new EmbedBuilder().setTitle(options.title).setDescription(options.description).addFields(options.fields || []), createUsageEmbed: async () => new EmbedBuilder().setTitle('Usage') },
    '../../services/emojiImport': { ...service, hasImportPermission: member => member.permissions.has(Flags.CreateGuildExpressions), downloadEmoji: async () => Buffer.from('GIF89aimage') },
    '../../config/setupEmojis': require('../../src/config/setupEmojis'), '../../utils/logger': silentLogger,
  });
  const message = { guild, author: { id: 'user' }, member: { permissions: { has: () => permission } }, reply: async payload => { replies.push(payload); return panel; } };
  await command.execute(message, [code, '<a:other:123456789012345678>']);
  function click(action, user = 'user') {
    collector.emit('collect', { customId: `emojiimport:${action}`, user: { id: user }, deferUpdate: async () => {}, reply: async payload => replies.push(payload) });
  }
  return { added, replies, edits, collector, click, complete, revoke: () => { permission = false; } };
}

test('emoji preview creates nothing until the requester confirms and cancel creates nothing', async () => {
  const session = await preview();
  for (const row of session.replies[0].components) row.toJSON();
  assert.equal(session.added.length, 0);
  session.click('confirm', 'stranger');
  assert.equal(session.added.length, 0);
  session.click('cancel'); await session.complete;
  assert.equal(session.added.length, 0);
});

test('confirmation imports each emoji once despite repeated clicks and reports partial failures', async () => {
  const session = await preview({ failSecond: true });
  session.click('confirm'); session.click('confirm'); await session.complete;
  assert.equal(session.added.length, 1);
  const result = session.edits.at(-1).embeds[0].toJSON();
  assert(result.fields.find(field => field.name === 'Not Added').value.includes('permission'));
});

test('revoked permissions and expired previews never create emojis', async () => {
  const revoked = await preview(); revoked.revoke(); revoked.click('confirm'); await revoked.complete;
  assert.equal(revoked.added.length, 0);
  const expired = await preview(); expired.collector.emit('end'); await expired.complete;
  assert.equal(expired.added.length, 0);
});
