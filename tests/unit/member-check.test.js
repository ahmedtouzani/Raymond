const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const service = require('../../src/services/memberCheck');
const DAY = 86400000;

function member() {
  const guild = { id: 'current', name: 'Current Server', ownerId: 'owner' };
  return { id: 'member', guild, joinedTimestamp: Date.now() - DAY,
    user: { id: 'member', username: 'Member', tag: 'Member', bot: false, createdTimestamp: Date.now() - 10 * DAY, displayAvatarURL: () => 'https://example.com/avatar.png' },
    roles: { cache: new Map() }, permissions: { has: () => false } };
}

test('member report includes account/join ages and moderation data scoped to the current server', () => {
  const target = member();
  const data = { inviteAvailable: true, invite: { inviter_id: 'inviter', join_method: 'invite', joined_at: new Date(target.joinedTimestamp) }, warnings: 2, jail: true };
  const report = service.buildMemberReport(target, data, { status: 'Verified', type: 'Boy', issues: [] });
  assert(report.fields.find(field => field.name === 'Account Created').value.includes('10 days old'));
  assert(report.fields.find(field => field.name === 'Joined This Server').value.includes('1 days here'));
  assert(report.fields.find(field => field.name === 'Join Source').value.includes('<@inviter>'));
  assert.equal(report.fields.some(field => field.name.startsWith('Shared Servers')), false);
  assert(report.fields.find(field => field.name === 'Review Notes').value.includes('2 recorded warning'));
});

test('inviter attribution does not invent history or reuse an earlier join record', () => {
  const target = member();
  assert.match(service.joinSource(target, { inviteAvailable: true, invite: null }), /No recorded invite/);
  assert.match(service.joinSource(target, { inviteAvailable: false }), /temporarily unavailable/);
  assert.match(service.joinSource(target, { inviteAvailable: true, invite: { joined_at: new Date(target.joinedTimestamp - DAY), inviter_id: 'old' } }), /earlier join/);
  assert.match(service.joinSource(target, { inviteAvailable: true, invite: { joined_at: new Date(target.joinedTimestamp), join_method: 'vanity' } }), /No individual inviter/);
});

test('checker never accesses another guild or discloses cross-server membership', async () => {
  const target = member(); target.id = '123456789012345678';
  target.user.id = target.id;
  const reports = [], queries = [];
  const bot = {};
  const guild = { id: target.guild.id, members: {
    me: bot, fetchMe: async () => bot,
    fetch: async options => { assert.equal(options.user, target.id); return target; },
  } };
  const command = loadModule('src/commands/moderation/checker.js', {
    '../../database/guildConfig': { getGuildConfig: async () => ({ settings: { verification: {} } }) },
    '../../database/memberCheck': { getMemberCheckData: async (...args) => {
      queries.push(args); return { inviteAvailable: true, invite: null, warnings: 0, jail: false };
    } },
    '../../services/verificationPermissions': { canVerify: () => true },
    './verifycheck': { inspectMember: () => ({ status: 'Verified', type: 'Boy', issues: [] }) },
    '../../services/memberCheck': service,
    '../../handlers/functions/sendEmbed': { sendEmbed: async (_, report) => reports.push(report) },
    '../../services/moderationRecords': { canReadRecords: () => true },
  });
  const client = {};
  Object.defineProperty(client, 'guilds', { get() { throw new Error('Cross-guild access forbidden'); } });
  await command.execute({ guild, client, author: { id: 'staff' }, member: {},
    mentions: { members: { first: () => target } }, channel: { sendTyping: async () => {} },
  });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0], [guild.id, target.id, true]);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].fields.some(field => /shared servers/i.test(field.name)), false);
  assert.equal(service.visibleServers, undefined);
});

test('checker database queries stay scoped to one guild/user and keep unavailable data explicit', async () => {
  const queries = [];
  const profile = loadModule('src/database/memberCheck.js', { '../services/database': { query: async (sql, parameters) => {
    queries.push({ sql, parameters });
    if (sql.includes('user_warnings')) throw new Error('Unavailable');
    return { rows: [] };
  } } });
  const data = await profile.getMemberCheckData('guild', 'user');
  assert.equal(data.warnings, null); assert.equal(data.jail, false); assert.equal(data.invite, null);
  assert.equal(queries.length, 3);
  for (const query of queries) assert.equal(query.parameters.join(','), 'guild,user');
});

function tracker(invites, cached) {
  const instance = loadModule('src/services/inviteTracker.js', { '../utils/logger': silentLogger, './database': { query: async () => ({ rows: [] }) } });
  instance.inviteCache.set('guild', new Map(cached.map(invite => [invite.code, invite])));
  const saves = [];
  instance.saveMemberInvite = async (_, __, data) => saves.push(data);
  instance.saveInviteToDb = async () => {};
  instance.cacheGuildInvites = async () => {};
  return { instance, saves, guild: { id: 'guild', invites: { fetch: async () => new Map(invites.map(invite => [invite.code, invite])) } } };
}

test('invite tracker ignores newly created invites that have never been used', async () => {
  const context = tracker([{ code: 'unused', uses: 0, inviter: { id: 'wrong' } }], []);
  const result = await context.instance.findUsedInvite(context.guild, { id: 'member' });
  assert.equal(result.method, 'unknown'); assert.equal(context.saves[0].inviterId, null);
});

test('invite tracker refuses ambiguous multi-join attribution', async () => {
  const context = tracker([{ code: 'used', uses: 3, inviter: { id: 'inviter' } }], [{ code: 'used', uses: 1 }]);
  const result = await context.instance.findUsedInvite(context.guild, { id: 'member' });
  assert.equal(result.method, 'unknown'); assert.equal(result.inviter, null);
});

test('development records a join source without assigning roles or posting join logs', async () => {
  let tracked = 0;
  const handler = loadModule('src/events/guildMemberAdd.js', {
    '../config/development': { allowsGuild: () => true, allowsAutomation: () => false },
    '../database/guildConfig': {}, '../database/autoRole': { getAutoRoleSettings: async () => { throw new Error('Automation must stay disabled'); } },
    '../services/inviteTracker': { findUsedInvite: async () => { tracked++; return { method: 'unknown' }; } },
    '../services/statsUpdater': {}, '../utils/logger': silentLogger,
  });
  await handler.execute({ guild: { id: 'guild' }, user: { id: 'user' } });
  assert.equal(tracked, 1);
});
