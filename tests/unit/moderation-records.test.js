const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField: { Flags }, EmbedBuilder } = require('discord.js');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const icons = require('../../src/config/setupEmojis');

function rules(createCase = async () => ({})) {
  return loadModule('src/services/moderationRecords.js', {
    './auditLogs': { publish: async () => true },
    '../handlers/commandAuthorization': { isBotOwner: () => false }, '../database/moderationRecords': { createCase }, '../utils/logger': silentLogger,
  });
}

test('moderation history requires staff permissions and elevated edits require admin/manage-server', () => {
  const permissions = rules();
  const staff = { permissions: { has: flag => flag === Flags.ModerateMembers } };
  assert.equal(permissions.canReadRecords(staff, 'staff'), true); assert.equal(permissions.elevated(staff, 'staff'), false);
  staff.permissions.has = flag => flag === Flags.Administrator;
  assert.equal(permissions.elevated(staff, 'staff'), true);
  staff.permissions.has = () => false;
  assert.equal(permissions.canReadRecords(staff, 'staff'), false);
});

test('case recording failures do not retry or reject a completed Discord action', async () => {
  let calls = 0;
  const permissions = rules(async data => { calls++; assert.equal(data.guildId, 'guild'); throw new Error('Database unavailable'); });
  const result = await permissions.recordAction({ guild: { id: 'guild' }, author: { id: 'mod' }, id: 'message' }, 'target', 'ban', 'Reason');
  assert.equal(result, null); assert.equal(calls, 1);
});

test('internal record details go only to requester DMs and never to the public channel', async () => {
  const privateMessages = [], publicMessages = [];
  const command = loadModule('src/commands/moderation/case.js', {
    '../../database/moderationRecords': {}, '../../services/moderationRecords': {}, '../../config/setupEmojis': icons,
    '../../utils/embed': { createEmbed: async (_, options) => new EmbedBuilder().setTitle(options.title).setDescription(options.description) },
  });
  const message = { guild: { id: 'guild' }, author: { send: async payload => privateMessages.push(payload) },
    channel: { send: async payload => publicMessages.push(payload) }, deletable: true, delete: async () => {} };
  await command.privateReply(message, { title: 'Notes', description: 'Sensitive staff context' });
  assert.equal(privateMessages.length, 1); assert.equal(publicMessages.length, 1);
  assert.equal(privateMessages[0].embeds[0].toJSON().description, 'Sensitive staff context');
  assert.equal(JSON.stringify(publicMessages).includes('Sensitive staff context'), false);
});

test('a saved note survives disabled DMs without leaking its contents', async () => {
  let saves = 0;
  const publicMessages = [];
  const caseCommand = loadModule('src/commands/moderation/case.js', {
    '../../database/moderationRecords': {}, '../../services/moderationRecords': {}, '../../config/setupEmojis': icons,
    '../../utils/embed': { createEmbed: async (_, options) => new EmbedBuilder().setTitle(options.title).setDescription(options.description) },
  });
  const command = loadModule('src/commands/moderation/modnote.js', {
    '../../database/moderationRecords': { addNote: async (_, __, ___, content) => { saves++; return { note_id: '1', content }; } },
    '../../services/moderationRecords': { canReadRecords: () => true }, './case': caseCommand, '../../config/setupEmojis': icons,
  });
  const message = { guild: { id: 'guild' }, member: {}, author: { id: 'mod', send: async () => { throw new Error('DMs blocked'); } },
    mentions: { users: { first: () => null } }, channel: { send: async payload => publicMessages.push(payload) }, deletable: true, delete: async () => {} };
  await command.execute(message, ['add', '123456789012345678', 'Private', 'note']);
  assert.equal(saves, 1); assert.equal(JSON.stringify(publicMessages).includes('Private note'), false);
  assert(publicMessages[0].content.includes('Enable DMs'));
});

test('ban records a case only after the Discord ban succeeds', async () => {
  const events = [];
  let rejectBan = false;
  const command = loadModule('src/commands/moderation/ban.js', {
    '../../services/moderationRecords': { recordAction: async (_, __, action) => events.push(action) },
    '../../handlers/functions/sendEmbed': { sendEmbed: async () => {} },
    '../../handlers/functions/botProtection': { protectBotTarget: () => false },
    '../../utils/embed': { createUsageEmbed: async () => ({}) },
  });
  const target = { id: 'target', user: { tag: 'Target' }, bannable: true, ban: async () => { if (rejectBan) throw new Error('Denied'); events.push('api'); } };
  const message = { guild: { id: 'guild' }, author: { id: 'mod', tag: 'Mod' }, member: { permissions: { has: () => true } }, mentions: { members: { first: () => target } } };
  await command.execute(message, ['target', 'Reason'], { user: { id: 'bot' } });
  assert.equal(events.join(','), 'api,ban');
  rejectBan = true; events.length = 0;
  await command.execute(message, ['target', 'Reason'], { user: { id: 'bot' } });
  assert.equal(events.length, 0);
});
