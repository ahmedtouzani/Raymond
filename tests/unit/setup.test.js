const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PermissionsBitField: { Flags }, ChannelType } = require('discord.js');
const validation = require('../../src/services/setupValidation');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');

function walk(components) { return components.flatMap(component => [component, ...walk(component.components || []), ...(component.accessory ? walk([component.accessory]) : [])]); }
function data(payload) { return walk(payload.components.map(component => component.toJSON())); }
function moduleMenu(payload) { return data(payload).find(component => component.custom_id === 'setup:module'); }
function checkV2(payload) {
  assert.equal(payload.flags, 32768);
  assert.equal(payload.embeds, undefined);
  const components = data(payload);
  assert(components.length <= 40, `Too many components: ${components.length}`);
  assert(components.filter(component => component.type === 10).reduce((sum, component) => sum + component.content.length, 0) <= 4000);
  for (const component of components.filter(component => component.type === 1)) assert(component.components.length <= 5);
}

function fixture() {
  const roles = new Map(['unverified', 'verified', 'boy', 'girl', 'staff', 'jail'].map(id => [id, { id, managed: false }]));
  const bot = { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } };
  const channels = new Map([
    ['logs', { type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }) }],
    ['voice', { type: ChannelType.GuildVoice, permissionsFor: () => ({ has: () => true }) }],
  ]);
  const guild = { id: 'guild', roles: { cache: roles, fetch: async () => {} }, channels: { cache: channels, fetch: async () => {} },
    members: { me: bot, fetchMe: async () => bot, fetch: async () => ({ id: 'admin', permissions: { has: () => true } }) } };
  const settings = { verification: { unverifiedRoleId: 'unverified', verifiedRoleId: 'verified', boyRoleId: 'boy',
    girlRoleId: 'girl', verificatorRoleId: 'staff' }, jail: { jail_role_id: 'jail', jail_voice_channel_id: null } };
  return { guild, settings, bot, roles, channels };
}

test('setup supports required verification roles and optional logs/voice channels', () => {
  const { guild, settings } = fixture();
  assert.equal(validation.validateSetup('verification', settings.verification, guild).ready, true);
  assert.equal(validation.validateSetup('jail', settings.jail, guild).ready, true);
  delete settings.verification.boyRoleId;
  assert.deepEqual(validation.validateSetup('verification', settings.verification, guild).missing, ['Boy Role']);
});

test('setup rejects deleted, managed, duplicate and unreachable roles', () => {
  const { guild, settings, bot, roles } = fixture();
  settings.verification.unverifiedRoleId = 'verified';
  assert.equal(validation.validateSetup('verification', settings.verification, guild).ready, false);
  roles.get('jail').managed = true;
  assert.equal(validation.validateSetup('jail', settings.jail, guild).ready, false);
  roles.get('jail').managed = false;
  bot.roles.highest.comparePositionTo = () => 0;
  assert.equal(validation.validateSetup('jail', settings.jail, guild).ready, false);
  roles.delete('jail');
  assert.match(validation.validateSetup('jail', settings.jail, guild).errors.join(), /does not exist/);
});

test('setup checks channel type, overwrites and bot permissions', () => {
  const { guild, settings, bot, channels } = fixture();
  settings.jail.jail_voice_channel_id = 'logs';
  assert.equal(validation.validateSetup('jail', settings.jail, guild).ready, false);
  settings.jail.jail_voice_channel_id = 'voice';
  channels.get('voice').permissionsFor = () => ({ has: () => false });
  assert.equal(validation.validateSetup('jail', settings.jail, guild).ready, false);
  settings.verification.logChannelId = 'logs';
  channels.get('logs').permissionsFor = () => ({ has: () => false });
  assert.equal(validation.validateSetup('verification', settings.verification, guild).ready, false);
  bot.permissions.has = permission => permission !== Flags.ManageRoles;
  assert.equal(validation.validateSetup('verification', settings.verification, guild).ready, false);
});

async function openPanel({ premium = false, owner = false, provisioning = require('../../src/services/auditProvisioning') } = {}) {
  const { guild, settings } = fixture();
  const collector = new EventEmitter();
  collector.ended = false;
  collector.stop = reason => { collector.ended = true; collector.emit('end', null, reason); };
  const edits = [], writes = [], replies = [];
  const panel = { url: 'panel-url', edit: async payload => { edits.push(payload); }, createMessageComponentCollector: () => collector };
  const command = loadModule('src/commands/Admin/setup.js', {
    '../../services/auditRoutes':require('../../src/services/auditRoutes'),
    '../../services/auditProvisioning':provisioning,
    '../../services/setupValidation': validation,
    '../../services/setupRegistry': require('../../src/services/setupRegistry'),
    '../../config/setupEmojis': require('../../src/config/setupEmojis'),
    '../../database/setupSettings': { readSetupSettings: async () => structuredClone(settings),
      saveSetupSettings: async (...args) => { writes.push(args); return true; } },
    '../../handlers/commandAuthorization': { isBotOwner: () => owner, authorizeCommand: () => ({ allowed: true }) }, '../../utils/logger': silentLogger,
    '../../premium/premium': { hasStellarOrHigher: async () => premium },
  }, {}, { structuredClone });
  await command.execute({ guild, author: { id: 'admin' }, url: 'message-url', reply: async payload => { replies.push(payload); return panel; } });
  async function click(action, values = [], user = 'admin') {
    let done;
    const finished = new Promise(resolve => { done = resolve; });
    const interaction = { id: 'interaction-id', customId: `setup:${action}`, user: { id: user }, values,
      deferUpdate: async () => {}, reply: async payload => { replies.push(payload); done(); }, followUp: async payload => { replies.push(payload); done(); } };
    interaction.awaitModalSubmit = async () => ({ ...interaction, customId: 'setup:modal:interaction-id', fields: { getTextInputValue: () => values[0] || '' } });
    interaction.showModal = async modal => { modal.toJSON(); };
    const edit = panel.edit;
    panel.edit = async payload => { await edit(payload); done(); };
    collector.emit('collect', interaction);
    await finished;
  }
  return { guild, collector, edits, writes, replies, click, command, settings };
}

test('setup renders valid Discord components and cancels without saving draft changes', async () => {
  const session = await openPanel();
  for (const component of session.replies[0].components) component.toJSON();
  await session.click('module', ['verification']);
  for (const component of session.edits.at(-1).components) component.toJSON();
  await session.click('field', ['logChannelId']);
  await session.click('value', ['logs']);
  assert.equal(session.writes.length, 0);
  await session.click('cancel');
  assert.equal(session.writes.length, 0);
  checkV2(session.edits.at(-1));
  assert.equal(data(session.edits.at(-1)).some(component => component.custom_id), false);
});

test('audit wizard requires a selected category and a reviewed preview before creating and saving',async()=>{
  const actual=require('../../src/services/auditProvisioning');let creates=0;
  const session=await openPanel({provisioning:{plan:actual.plan,create:async(guild,options)=>{
    creates++;assert.equal(options.categoryId,'category');assert.equal(await options.authorized(),true);
    const config={...options.config,enabled:true,defaultChannelId:'logs',routes:{warnings:'logs'}};
    assert.equal(await options.persist(config),true);
    return{config,created:1,reused:0};
  }}});
  session.settings.auditlogs={};
  session.guild.channels.cache.set('category',{id:'category',type:ChannelType.GuildCategory,permissionsFor:()=>({has:()=>true})});
  await session.click('module',['auditlogs']);
  await session.click('audit-wizard');
  checkV2(session.edits.at(-1));
  await session.click('audit-create');assert.equal(creates,0);
  await session.click('audit-category',['category']);
  await session.click('audit-staff',['staff']);
  await session.click('audit-review');
  const preview=session.edits.at(-1);checkV2(preview);
  assert(data(preview).some(component=>component.custom_id==='setup:audit-create'&&!component.disabled));
  assert.equal(session.writes.length,0);assert.equal(creates,0);
  await session.click('audit-create');
  assert.equal(creates,1);assert.equal(session.writes.length,1);assert.equal(session.writes[0][1],'auditlogs');
  await session.click('audit-create');assert.equal(creates,1);
  await session.click('cancel');
});

test('detailed route editor keeps channel choices in a draft until saving',async()=>{
  const session=await openPanel();session.settings.auditlogs={};
  await session.click('module',['auditlogs']);
  await session.click('audit-routes');checkV2(session.edits.at(-1));
  await session.click('audit-route',['warnings']);
  await session.click('audit-route-channel',['logs']);
  assert.equal(session.writes.length,0);
  await session.click('audit-return');await session.click('save');
  assert.equal(session.writes.length,1);assert.equal(session.writes[0][2].routes.warnings,'logs');
  await session.click('cancel');
});

test('setup saves a selected module only and prevents other users changing it', async () => {
  const session = await openPanel();
  await session.click('module', ['jail'], 'stranger');
  assert.equal(session.edits.length, 0);
  await session.click('module', ['jail']);
  await session.click('field', ['jail_voice_channel_id']);
  await session.click('value', ['voice']);
  await session.click('save');
  assert.equal(session.writes.length, 1);
  assert.equal(session.writes[0][1], 'jail');
  assert.equal(session.writes[0][2].jail_voice_channel_id, 'voice');
  assert.equal(session.writes[0][3].jail_voice_channel_id, null);
  await session.click('cancel');
});

test('setup rechecks administrator permission and validation before saving', async () => {
  const session = await openPanel();
  await session.click('module', ['jail']);
  session.guild.roles.cache.delete('jail');
  await session.click('save');
  assert.equal(session.writes.length, 0);
  session.guild.members.fetch = async () => ({ id: 'admin', permissions: { has: () => false } });
  await session.click('save');
  assert.equal(session.collector.ended, true);
  assert.equal(session.writes.length, 0);
});

test('legacy verify set log writes the channel field used by verification', async () => {
  const config = { settings: {} };
  const command = loadModule('src/commands/moderation/verify.js', {
    '../../handlers/functions/sendEmbed': { sendEmbed: async () => {} },
    '../../services/moderationRecords': { recordAction: async () => null },
    '../../services/verificationPermissions': require('../../src/services/verificationPermissions'),
    '../../database/guildConfig': { getGuildConfig: async () => config, setGuildConfig: async () => {} },
  });
  await command.execute({ guild: { id: 'guild' }, author: { id: 'admin' }, member: { permissions: { has: () => true } },
    mentions: { channels: { first: () => ({ id: 'logs' }) } } }, ['set', 'log']);
  assert.equal(config.settings.verification.logChannelId, 'logs');
  assert.equal(config.settings.verification.logRoleId, undefined);
});

const registry = require('../../src/services/setupRegistry');
test('all setup modules serialize valid components for every field and paginated collection', async () => {
  const session = await openPanel({ owner: true, premium: true });
  const check = checkV2;
  const settings = Object.fromEntries(Object.entries(registry.modules).map(([name, definition]) =>
    [name, definition.collection ? [] : registry.defaults(definition)]));
  const state = { settings, module: null, access: {}, premium: true };
  check(session.command.renderPanel(state, session.guild));
  for (const section of ['safety', 'community', 'engagement', 'server']) {
    state.section = section; check(session.command.renderPanel(state, session.guild));
  }
  for (const [name, definition] of Object.entries(registry.modules)) {
    state.module = name;
    state.draft = definition.collection ? [registry.defaults(definition)] : registry.defaults(definition);
    state.item = definition.collection ? 0 : null;
    if (definition.launcher) { check(session.command.renderPanel(state, session.guild)); continue; }
    for (const field of definition.fields) {
      state.field = field.key;
      check(session.command.renderPanel(state, session.guild));
    }
    if (definition.collection) {
      state.item = null;
      state.draft = Array.from({ length: 60 }, () => registry.defaults(definition));
      for (const page of [0, 1, 2]) { state.page = page; check(session.command.renderPanel(state, session.guild)); }
    }
  }
  await session.click('cancel');
});

test('numeric modal values and choices stay in a draft until save', async () => {
  const session = await openPanel();
  session.settings.levels = registry.defaults(registry.modules.levels);
  await session.click('module', ['levels']);
  await session.click('field', ['xp_multiplier']);
  await session.click('edit', ['2.5']);
  await session.click('field', ['levelup_enabled']);
  await session.click('value', ['true']);
  assert.equal(session.writes.length, 0);
  await session.click('save');
  assert.equal(session.writes.length, 1);
  assert.equal(session.writes[0][2].xp_multiplier, 2.5);
  assert.equal(session.writes[0][2].levelup_enabled, true);
  await session.click('cancel');
});

test('collection records can be added and removed without persisting until save', async () => {
  const session = await openPanel();
  session.settings.rewards = [];
  await session.click('module', ['rewards']);
  await session.click('item', ['new']);
  await session.click('field', ['role_id']);
  await session.click('value', ['verified']);
  await session.click('done');
  assert.equal(session.writes.length, 0);
  await session.click('save');
  assert.equal(session.writes[0][2].length, 1);
  assert.equal(session.writes[0][2][0].role_id, 'verified');
  await session.click('module', ['rewards']);
  await session.click('item', ['new']);
  await session.click('remove');
  assert.equal(session.writes.length, 1);
  await session.click('cancel');
});

test('setup preserves premium and owner restrictions', async () => {
  const session = await openPanel();
  await session.click('module', ['modmail']);
  await session.click('module', ['reactions']);
  assert.equal(session.edits.length, 0);
  assert.equal(session.writes.length, 0);
  const menu = moduleMenu(session.replies[0]);
  assert.equal(menu.options.some(option => option.value === 'reactions'), false);
  await session.click('cancel');
});

test('invalid ranges, duplicate identities and non-voice counters prevent saving', () => {
  const { guild } = fixture();
  const levels = registry.defaults(registry.modules.levels);
  levels.text_xp_min = 30; levels.text_xp_max = 20;
  assert.equal(validation.validateSetup('levels', levels, guild).ready, false);
  levels.text_xp_max = 40; levels.xp_multiplier = 0;
  assert.equal(validation.validateSetup('levels', levels, guild).ready, false);
  const reward = { ladder: 'text', level: 5, role_id: 'verified' };
  assert.equal(validation.validateSetup('rewards', [reward, reward], guild).ready, false);
  const stats = { ...registry.defaults(registry.modules.stats), member_count_channel_id: 'logs' };
  assert.equal(validation.validateSetup('stats', stats, guild).ready, false);
});

test('invite editor resolves links, retains stored IDs and deduplicates target servers', async () => {
  const session = await openPanel();
  const field = registry.modules.automod.fields.find(field => field.kind === 'invites');
  const client = { fetchInvite: async code => { assert.equal(code, 'abc'); return { guild: { id: '123456789012345678', name: 'Server' } }; } };
  const result = await session.command.parseInput(field, 'discord.gg/abc\n123456789012345678', client,
    [{ guildId: '123456789012345678', name: 'Server' }]);
  assert.equal(result.length, 1);
  await session.click('cancel');
});

test('stats channel names render count placeholders and retain plain base names', async () => {
  const changes = [];
  let format = 'Members: {count}';
  const updater = loadModule('src/services/statsUpdater.js', {
    '../database/statsChannels': { getStatsChannels: async () => ({ member_count_channel_id: 'counter', member_count_format: format }), updateLastUpdate: async () => {} },
    '../utils/logger': silentLogger,
  });
  const guild = { id: 'stats', name: 'Stats', memberCount: 123, channels: { cache: new Map([['counter', { name: '', setName: async name => changes.push(name) }]]) } };
  await updater.updateMemberCount(guild);
  assert.equal(changes[0], 'Members: 123');
  updater.lastUpdates.clear(); format = 'Members';
  await updater.updateMemberCount(guild);
  assert.equal(changes[1], 'Members: 123');
});

test('level reward removal follows the configured switch', async () => {
  let remove = false;
  const removed = [], added = [];
  const member = { roles: { cache: new Map([['old', {}]]), remove: async ids => removed.push(ids), add: async role => added.push(role) } };
  const manager = loadModule('src/utils/levelRoleManager.js', {
    '../database/levelRoles': { getLevelRoles: async () => [{ level: 1, role_id: 'old' }, { level: 2, role_id: 'new' }], getRoleForLevel: async () => 'new' },
    '../database/levelSettings': { getGuildSettingsWithDefaults: async () => ({ role_rewards_remove_previous: remove }) },
  });
  const guild = { members: { fetch: async () => member }, roles: { cache: new Map([['new', { id: 'new' }]]) } };
  const client = { guilds: { fetch: async () => guild } };
  await manager.handleLevelUpRoles(client, 'guild', 'user', 'text', 2);
  assert.equal(removed.length, 0); assert.equal(added.length, 1);
  remove = true;
  await manager.handleLevelUpRoles(client, 'guild', 'user', 'text', 2);
  assert.equal(removed.length, 1); assert.equal(removed[0][0], 'old');
});

test('Verificator role can verify without Manage Roles while configuration remains protected', async () => {
  const results = [];
  const command = loadModule('src/commands/moderation/verify.js', {
    '../../handlers/functions/sendEmbed': { sendEmbed: async (_, payload) => results.push(payload.title) },
    '../../services/moderationRecords': { recordAction: async () => null },
    '../../services/verificationPermissions': require('../../src/services/verificationPermissions'),
    '../../database/guildConfig': { getGuildConfig: async () => ({ settings: { verification: { verificatorRoleId: 'staff' } } }) },
    '../../utils/embed': { createUsageEmbed: async () => ({ title: 'User Not Found' }) },
  });
  const message = { guild: { id: 'guild', members: { fetch: async () => null } }, author: { id: 'staff-user' },
    member: { permissions: { has: () => false }, roles: { cache: new Map([['staff', {}]]) } },
    mentions: { members: { first: () => null } }, reply: async payload => results.push(payload.embeds[0].title) };
  await command.execute(message, ['boy', 'missing-user']);
  assert.equal(results[0], 'User Not Found');
  await command.execute(message, ['setup']);
  assert.match(results[1], /Permission Denied/);
  message.member.roles.cache.clear();
  await command.execute(message, ['girl', 'missing-user']);
  assert.match(results[2], /Permission Denied/);
});

test('auto reaction configuration accepts one emoji and rejects text or multiple emojis', () => {
  const { guild } = fixture();
  const rule = { target_type: 'channel', target_id: 'logs', emoji: '👍' };
  assert.equal(validation.validateSetup('reactions', rule, guild).ready, true);
  rule.emoji = 'hello 👍';
  assert.equal(validation.validateSetup('reactions', rule, guild).ready, false);
  rule.emoji = '👍❤️';
  assert.equal(validation.validateSetup('reactions', rule, guild).ready, false);
  rule.emoji = '👨‍👩‍👧‍👦';
  assert.equal(validation.validateSetup('reactions', rule, guild).ready, true);
});

test('setup category navigation filters features and keeps the chosen category after returning', async () => {
  const session = await openPanel();
  await session.click('section:safety');
  let menu = moduleMenu(session.edits.at(-1));
  assert.equal(menu.options.map(option => option.value).join(','), 'verification,jail,automod');
  await session.click('module:jail');
  await session.click('back');
  menu = moduleMenu(session.edits.at(-1));
  assert.equal(menu.options.length, 3);
  await session.click('section:all');
  menu = moduleMenu(session.edits.at(-1));
  assert(menu.options.length > 3);
  await session.click('cancel');
});

test('every numeric XP and level reward field opens a valid Discord modal', async () => {
  const session = await openPanel();
  session.settings.levels = registry.defaults(registry.modules.levels);
  session.settings.rewards = [];
  await session.click('module', ['levels']);
  for (const field of registry.modules.levels.fields.filter(field => field.kind === 'number')) {
    await session.click('field', [field.key]);
    await session.click('edit', [String(field.default)]);
  }
  await session.click('back');
  await session.click('module', ['rewards']);
  await session.click('item', ['new']);
  await session.click('field', ['level']);
  await session.click('edit', ['100000']);
  assert.equal(session.writes.length, 0);
  await session.click('cancel');
});
