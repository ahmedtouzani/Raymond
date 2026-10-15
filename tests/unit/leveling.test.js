const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');

function presentation() {
  return loadModule('src/services/levelCards.js', {
    '../database/levelSystem': {}, '../utils/canvasLeaderboard': {},
    '../config/setupEmojis': require('../../src/config/setupEmojis'),
  });
}
test('leaderboard boundary pages have unique button IDs, including one-page ladders', () => {
  for (const [page, pages] of [[1, 1], [1, 3], [3, 3]]) {
    const buttons = presentation().navigation('text', page, pages).toJSON().components;
    assert.equal(new Set(buttons.map(button => button.custom_id)).size, 4);
    assert.equal(buttons[0].disabled, page === 1); assert.equal(buttons[2].disabled, page === pages);
  }
});
test('leaderboard resolves members with bounded concurrency and keeps unavailable rank positions', async () => {
  const service = presentation(); let active = 0, peak = 0;
  const guild = { id: 'guild', members: { cache: new Map(), fetch: async id => {
    active++; peak = Math.max(active, peak); await Promise.resolve(); active--;
    if (id === 'missing') throw new Error('Unknown member');
    return { displayName: id, user: { username: id, displayAvatarURL: () => null } };
  } } };
  const rows = Array.from({ length: 10 }, (_, i) => ({ user_id: i === 4 ? 'missing' : `user-${i}`, xp: 100, level: 2, next_level_xp: 2000, total_xp: 1100 }));
  const users = await service.hydrateUsers(guild, rows, 20);
  assert(peak <= 4); assert.equal(users.length, 10);
  assert.equal(users[4].unavailable, true); assert.equal(users[4].rank, 25);
  assert.equal(users[9].rank, 30);
});
test('simultaneous settings reads share one query and legacy nulls use real defaults', async () => {
  let reads = 0;
  const settings = loadModule('src/database/levelSettings.js', { '../services/database': { query: async () => { reads++; return { rows: [{ text_xp_min: null, voice_xp_enabled: null }] }; } } });
  const results = await Promise.all(Array.from({ length: 12 }, () => settings.getGuildSettingsWithDefaults('guild')));
  assert.equal(reads, 1); assert.equal(results[0].text_xp_min, 15); assert.equal(results[0].voice_xp_enabled, true);
});
test('signature cards handle max-level and empty progress and reuse identical rendered data', async () => {
  const { generateRankCard } = require('../../src/utils/canvasRankCard');
  const member = { id: 'render-test', guild: { id: 'render-guild', name: 'Render Guild' }, displayName: 'عضو with a long display name to fit', user: { username: 'member', displayAvatarURL: () => null } };
  const data = { voice_level: 100, voice_xp: 500, voice_next_level_xp: 0 };
  const buffer = await generateRankCard(data, member, 'voice', 1205);
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  assert.equal(await generateRankCard(data, member, 'voice', 1205), buffer);
  const changed = await generateRankCard({ ...data, voice_xp: 600 }, member, 'voice', 1205);
  assert.notEqual(changed, buffer);
});

function voiceFixture(overrides = {}) {
  const { createVoiceXpScheduler } = loadModule('src/services/voiceXp.js', { '../utils/logger': silentLogger });
  let clock = 1000000, timers = 0, cleared = 0, reads = 0;
  const awards = [], guild = { id: 'guild', afkChannelId: 'afk', voiceStates: { cache: new Map() } };
  const settings = { voice_xp_enabled: true, voice_xp_rate: 10, xp_multiplier: 2, voice_min_members: 2, voice_ignore_muted: false, voice_ignore_deafened: true, excluded_channels: [], ...overrides.settings };
  const scheduler = createVoiceXpScheduler({ now: () => clock, setInterval: () => { timers++; return { unref() {} }; }, clearInterval: () => { cleared++; },
    settingsFor: async () => { reads++; return settings; },
    award: overrides.award || (async (...args) => { awards.push(args); return { leveledUp: false }; }), leveled: async () => {},
  });
  function add(id, changes = {}) {
    const channelId = changes.channelId || 'voice';
    const state = { id, guild, channelId, channel: { id: channelId, type: ChannelType.GuildVoice }, member: { id, user: { bot: false } }, ...changes };
    guild.voiceStates.cache.set(id, state); scheduler.sync(state); return state;
  }
  return { scheduler, add, guild, settings, awards, advance: () => { clock += 60000; }, counts: () => ({ timers, cleared, reads }) };
}
test('voice XP uses one timer and one settings lookup per guild tick, with no member fetches', async () => {
  const f = voiceFixture(); f.add('one'); f.add('two'); f.advance(); await f.scheduler.tick('guild');
  assert.equal(f.counts().timers, 1); assert.equal(f.counts().reads, 1);
  assert.equal(f.awards.length, 2); assert.equal(f.awards[0].join(','), 'guild,one,20,voice');
  await f.scheduler.stop(); assert.equal(f.counts().cleared, 1);
});
test('voice XP excludes AFK, deafened, excluded channels and configurable muted members', async () => {
  for (const changes of [{ channelId: 'afk' }, { selfDeaf: true }, { serverDeaf: true }, { channelId: 'excluded' }, { selfMute: true }, { serverMute: true }]) {
    const f = voiceFixture({ settings: { voice_min_members: 1, voice_ignore_muted: true, excluded_channels: ['excluded'] } });
    f.add('one', changes); f.advance(); await f.scheduler.tick('guild');
    assert.equal(f.awards.length, 0, JSON.stringify(changes)); await f.scheduler.stop();
  }
});
test('voice XP minimum participants and enable switch are respected without farming bot members', async () => {
  const f = voiceFixture(); f.add('one'); f.add('bot', { member: { id: 'bot', user: { bot: true } } });
  f.advance(); await f.scheduler.tick('guild'); assert.equal(f.awards.length, 0);
  f.add('two'); f.advance(); await f.scheduler.tick('guild'); assert.equal(f.awards.length, 2);
  f.settings.voice_xp_enabled = false; f.advance(); await f.scheduler.tick('guild'); assert.equal(f.awards.length, 2);
  await f.scheduler.stop();
});
test('leaving voice removes tracking before any further XP can be awarded', async () => {
  const f = voiceFixture({ settings: { voice_min_members: 1 } }); f.add('one');
  f.guild.voiceStates.cache.delete('one'); f.scheduler.sync({ id: 'one', guild: f.guild, channelId: null });
  f.advance(); await f.scheduler.tick('guild'); assert.equal(f.awards.length, 0); assert.equal(f.counts().cleared, 1);
  await f.scheduler.stop();
});
test('overlapping voice ticks reuse the in-flight job instead of awarding twice', async () => {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; }); let calls = 0;
  const f = voiceFixture({ settings: { voice_min_members: 1 }, award: () => { calls++; entered(); return new Promise(resolve => { release = resolve; }); } });
  f.add('one'); f.advance(); const first = f.scheduler.tick('guild'), second = f.scheduler.tick('guild');
  assert.equal(first, second); await ready; assert.equal(calls, 1);
  release({ leveledUp: false }); await first; await f.scheduler.stop();
});
test('disabling Text XP stops XP writes while prefixless commands still run', async () => {
  let awards = 0, ran = 0;
  const handler = loadModule('src/events/messageCreate.js', {
    '../database/guildConfig': { getGuildConfig: async () => ({ prefix: '=', settings: { spamDetectionEnabled: false } }) },
    '../database/autoReactSettings': { getAutoReactionsForGuild: async () => [] },
    '../database/levelSettings': { getGuildSettingsWithDefaults: async () => ({ text_xp_enabled: false }) },
    '../database/levelSystem': { addXp: async () => { awards++; } },
    '../config/development': { isDevelopment: () => false, allowsGuild: () => true },
    '../handlers/commandAuthorization': { authorizeCommand: () => ({ allowed: true }) }, '../utils/logger': silentLogger,
  });
  await handler.execute({ content: 'r', author: { id: 'user', bot: false }, guild: { id: 'guild' }, channel: { id: 'chat' } },
    { commands: new Map([['level', { name: 'level', aliases: ['r'], prefixless: true, execute: async () => { ran++; } }]]) });
  assert.equal(awards, 0); assert.equal(ran, 1);
});

function legacyButtons() {
  const settings = { getGuildSettingsWithDefaults: async () => ({ xp_multiplier: 1, role_rewards: {}, text_xp_min: 15, text_xp_max: 25, voice_xp_rate: 10 }) };
  return loadModule('src/handlers/buttons/buttonHandlers.js', {
    '../../database/guildConfig': {}, '../../utils/embed': {}, fs: { readdirSync: () => [] }, path: require('node:path'),
    '../../database/levelSettings': settings, '../../database/levelRoles': {}, '../../utils/canvasRankCard': {},
  });
}
test('all legacy level configuration handlers reject non-admin interactions before editing settings', async () => {
  const handlers = legacyButtons();
  for (const [name, handler] of Object.entries(handlers).filter(([name]) => name.startsWith('levelsetup_'))) {
    let denied = false;
    await handler({ memberPermissions: { has: () => false }, reply: async payload => { denied = true; assert.equal(payload.flags, 64); } });
    assert.equal(denied, true, name);
  }
});
test('legacy level menu has one preview control and no duplicate IDs', async () => {
  const handlers = legacyButtons(); let response;
  const interaction = { guild: { id: 'guild' }, memberPermissions: { has: () => true }, deferUpdate: async () => { interaction.deferred = true; }, editReply: async payload => { response = payload; } };
  await handlers.levelsetup_back(interaction);
  const buttons = response.components.flatMap(row => row.toJSON().components);
  assert.equal(new Set(buttons.map(button => button.custom_id)).size, buttons.length);
  assert.equal(buttons.filter(button => button.custom_id === 'levelsetup_preview').length, 1);
});
test('levelsetup opens the consolidated Levels editor without a separate theme menu', async () => {
  let args;
  const command = loadModule('src/commands/Admin/levelsetup.js', { './setup': { execute: async (_, selected) => { args = selected; } } });
  await command.execute({}); assert.equal(args.join(','), 'levels');
});
test('identical card renders coalesce and render concurrency is bounded', async () => {
  const { frame } = require('../../src/utils/cardDesign');
  let active = 0, maximum = 0, draws = 0;
  const draw = async () => { active++; draws++; maximum = Math.max(maximum, active); await new Promise(resolve => setImmediate(resolve)); active--; return Buffer.from('card'); };
  await Promise.all(Array.from({ length: 12 }, (_, i) => frame(`render-limit-${i}`, draw)));
  assert(maximum <= 4); assert.equal(draws, 12);
  draws = 0; await Promise.all(Array.from({ length: 6 }, () => frame('same-render', draw))); assert.equal(draws, 1);
});
