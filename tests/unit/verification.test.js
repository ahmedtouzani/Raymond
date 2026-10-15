const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField: { Flags } } = require('discord.js');
const { loadModule } = require('../helpers/load-module.cjs');
const { canVerify } = require('../../src/services/verificationPermissions');
const emojis = require('../../src/config/setupEmojis');
const validation = require('../../src/services/setupValidation');

function dependencies(config = {}) {
  return {
    '../../services/moderationRecords': { recordAction: async () => null },
    '../../services/verificationPermissions': { canVerify },
    '../../database/guildConfig': { getGuildConfig: async () => ({ settings: { verification: config } }) },
    '../../services/setupValidation': validation,
    '../../config/setupEmojis': emojis,
    '../../handlers/functions/sendEmbed': { sendEmbed: async (_, options) => options },
    '../../utils/embed': { createUsageEmbed: async () => ({ title: 'User Not Found' }) },
  };
}

test('verification allows Administrator, owner or Verificator and rejects ordinary members', () => {
  const member = { permissions: { has: flag => flag === Flags.Administrator }, roles: { cache: new Map() } };
  assert.equal(canVerify(member, 'admin', {}, ''), true);
  member.permissions.has = () => false;
  assert.equal(canVerify(member, 'owner', {}, 'owner'), true);
  member.roles.cache.set('staff', {});
  assert.equal(canVerify(member, 'staff-user', { verificatorRoleId: 'staff' }, ''), true);
  member.roles.cache.clear();
  assert.equal(canVerify(member, 'ordinary', { verificatorRoleId: 'staff' }, ''), false);
  assert.equal(canVerify(member, 'ordinary', {}, ''), false);
});

test('verify, vb and vg all allow an administrator without the Verificator role', async () => {
  const message = { author: { id: 'admin' }, guild: { id: 'guild', members: { fetch: async () => null } },
    member: { permissions: { has: flag => flag === Flags.Administrator }, roles: { cache: new Map() } },
    mentions: { members: { first: () => null } }, reply: async options => options.embeds[0] };
  for (const name of ['verify', 'vb', 'vg']) {
    const command = loadModule(`src/commands/moderation/${name}.js`, dependencies());
    const result = await command.execute(message, name === 'verify' ? ['boy', 'missing-user'] : ['missing-user']);
    assert.equal(result.title, 'User Not Found', name);
    message.member.permissions.has = () => false;
    const denied = await command.execute(message, name === 'verify' ? ['boy', 'missing-user'] : ['missing-user']);
    assert.match(denied.title, /Permission Denied/, name);
    message.member.permissions.has = flag => flag === Flags.Administrator;
  }
});

test('verification checker detects conflicting roles and hierarchy without changing any roles', () => {
  const checker = loadModule('src/commands/moderation/verifycheck.js', dependencies());
  const member = { id: 'member', guild: { ownerId: 'owner' }, user: { bot: false },
    roles: { cache: new Map(['verified', 'unverified', 'boy', 'girl'].map(id => [id, {}])), highest: {} } };
  const settings = { verifiedRoleId: 'verified', unverifiedRoleId: 'unverified', boyRoleId: 'boy', girlRoleId: 'girl' };
  const bot = { roles: { highest: { comparePositionTo: () => 0 } } };
  const report = checker.inspectMember(member, settings, bot);
  assert.equal(report.status, 'Verified');
  assert.equal(report.issues.length, 3);
  assert(report.issues.some(issue => issue.includes('Verified and Unverified')));
  assert(report.issues.some(issue => issue.includes('Boy and Girl')));
  bot.roles.highest.comparePositionTo = () => 1;
  member.roles.cache.delete('unverified'); member.roles.cache.delete('girl');
  assert.equal(checker.inspectMember(member, settings, bot).issues.length, 0);
});

test('verification setup can be ready without an optional Verificator role', () => {
  const settings = { unverifiedRoleId: 'unverified', verifiedRoleId: 'verified', boyRoleId: 'boy', girlRoleId: 'girl' };
  const guild = { id: 'guild', roles: { cache: new Map(Object.values(settings).map(id => [id, { id, managed: false }])) },
    members: { me: { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } } } };
  assert.equal(validation.validateSetup('verification', settings, guild).ready, true);
});

test('checker shows setup and member status to admins, but rejects ordinary members', async () => {
  const settings = { unverifiedRoleId: 'unverified', verifiedRoleId: 'verified', boyRoleId: 'boy', girlRoleId: 'girl' };
  const checker = loadModule('src/commands/moderation/verifycheck.js', dependencies(settings));
  const roles = new Map(Object.values(settings).map(id => [id, { id, managed: false }]));
  const bot = { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } };
  let refreshes = 0;
  const member = { id: 'target', user: { bot: false }, guild: { ownerId: 'owner' }, roles: { cache: new Map([['verified', {}], ['boy', {}]]), highest: {} } };
  const message = { author: { id: 'admin' }, member: { permissions: { has: flag => flag === Flags.Administrator }, roles: { cache: new Map() } },
    guild: { id: 'guild', roles: { cache: roles, fetch: async () => { refreshes++; } }, channels: { fetch: async () => {} }, members: { me: bot, fetchMe: async () => bot } },
    mentions: { members: { first: () => member } } };
  const report = await checker.execute(message, []);
  assert.equal(report.title, 'Verification Check');
  assert(report.fields.find(field => field.name === 'Member').value.includes('Verified'));
  assert(report.fields.find(field => field.name === 'Member Checklist').value.includes('consistent'));
  assert.equal(refreshes, 1);
  message.member.permissions.has = () => false;
  const denied = await checker.execute(message, []);
  assert.equal(denied.title, 'Permission Denied');
  assert.equal(refreshes, 1);
});
