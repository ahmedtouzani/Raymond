const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField, SlashCommandBuilder } = require('discord.js');
const { isBotOwner, createCommandAuthorizer } = require('../../src/handlers/commandAuthorization');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const flags = PermissionsBitField.Flags;
function context(user = 'user', bits = 0n, botBits = 0n) {
  return {
    author: { id: user }, guild: { id: 'guild', members: { me: { permissions: new PermissionsBitField(botBits) } } },
    member: { permissions: new PermissionsBitField(bits) },
  };
}

test('owner-only commands fail closed when owner is absent or caller differs', () => {
  for (const owner of [undefined, '', ' ', 'owner']) {
    const authorize = createCommandAuthorizer({ getOwnerId: () => owner });
    assert.equal(authorize({ ownerOnly: true }, context()).allowed, false);
  }
  assert.equal(isBotOwner('user', undefined), false);
  assert.equal(isBotOwner('owner', ' owner '), true);
  assert.equal(createCommandAuthorizer({ getOwnerId: () => 'owner' })({ ownerOnly: true }, context('owner')).allowed, true);
});

test('declared member permissions and legacy uppercase names are enforced', () => {
  const authorize = createCommandAuthorizer({ getOwnerId: () => 'owner' });
  for (const permissions of [[flags.Administrator], ['ADMINISTRATOR'], ['ManageMessages']]) {
    assert.equal(authorize({ permissions }, context()).allowed, false);
    assert.equal(authorize({ permissions }, context('user', flags.Administrator)).allowed, true);
  }
  assert.equal(authorize({ permissions: ['unknown-permission'] }, context()).allowed, false);
  assert.equal(authorize({ permissions: [flags.BanMembers] }, context('owner')).allowed, true);
});

test('effective channel permissions override guild-wide permissions', () => {
  const authorize = createCommandAuthorizer();
  const member = context('user', flags.ManageMessages);
  member.channel = { permissionsFor: () => new PermissionsBitField(0n) };
  assert.equal(authorize({ permissions: [flags.ManageMessages] }, member).allowed, false);
  member.channel.permissionsFor = () => null;
  assert.equal(authorize({ permissions: [flags.ManageMessages] }, member).allowed, false);
});

test('bot permissions are required even for owner and guild-only commands deny DMs', () => {
  const authorize = createCommandAuthorizer({ getOwnerId: () => 'owner' });
  const command = { botPermissions: [flags.ManageRoles] };
  assert.equal(authorize(command, context('owner')).allowed, false);
  assert.equal(authorize(command, context('owner', 0n, flags.ManageRoles)).allowed, true);
  const unresolved = context('owner', 0n, flags.ManageRoles);
  unresolved.channel = { permissionsFor: () => null };
  assert.equal(authorize(command, unresolved).allowed, false);
  assert.equal(authorize({ guildOnly: true }, { user: { id: 'owner' } }).allowed, false);
  assert.equal(authorize({}, {}).allowed, false);
});

test('slash default member permissions are enforced', () => {
  const authorize = createCommandAuthorizer();
  const command = { data: new SlashCommandBuilder().setName('settings').setDescription('Settings').setDefaultMemberPermissions(flags.Administrator) };
  assert.equal(authorize(command, context()).allowed, false);
  assert.equal(authorize(command, context('user', flags.Administrator)).allowed, true);
});

test('cooldown is shared for a command, expires, and isolates users and guilds', () => {
  let time = 1000;
  const authorize = createCommandAuthorizer({ now: () => time });
  const command = { name: 'clear', cooldown: 5 };
  assert.equal(authorize(command, context()).allowed, true);
  assert.equal(authorize(command, context()).allowed, false);
  assert.equal(authorize(command, context('other')).allowed, true);
  const otherGuild = context(); otherGuild.guild.id = 'other-guild';
  assert.equal(authorize(command, otherGuild).allowed, true);
  time += 5000;
  assert.equal(authorize(command, context()).allowed, true);
});

test('message dispatcher blocks actual shutdown module for a non-owner', async () => {
  let shutdowns = 0, embeds = 0, denials = 0;
  const command = loadModule('src/commands/OwnerOnly/shutdown.js', {
    '../../handlers/functions/sendEmbed': { sendEmbed: async () => { embeds++; } },
    '../../utils/gracefulShutdown': { gracefulShutdown() { shutdowns++; } },
    '../../services/database': {},
  });
  const handler = loadModule('src/events/messageCreate.js', {
    '../database/guildConfig': { getGuildConfig: async () => ({ prefix: '=', settings: { spamDetectionEnabled: false } }) },
    '../utils/logger': silentLogger,
    '../database/autoReactSettings': { getAutoReactionsForGuild: async () => [] },
    '../database/levelSystem': { addXp: async () => ({ leveledUp: false }) },
    '../database/levelSettings': { getGuildSettingsWithDefaults: async () => ({}) },
    '../utils/levelRoleManager': { handleLevelUpRoles: async () => {} },
    '../handlers/commandAuthorization': { authorizeCommand: createCommandAuthorizer({ getOwnerId: () => 'owner' }) },
  });
  const message = { ...context(), content: '=shutdown', channel: { id: 'channel' }, reply: async () => { denials++; } };
  await handler.execute(message, { user: { id: 'bot' }, commands: new Map([['shutdown', command]]) });
  assert.equal(denials, 1); assert.equal(shutdowns, 0); assert.equal(embeds, 0);
  message.author.id = 'owner';
  await handler.execute(message, { user: { id: 'bot' }, commands: new Map([['shutdown', command]]) });
  assert.equal(shutdowns, 1); assert.equal(embeds, 1);
});

test('slash dispatcher uses slash callbacks and blocks owner-only callbacks', async () => {
  let slashCalls = 0, prefixCalls = 0, denials = 0;
  const handler = loadModule('src/events/interactionCreate.js', {
    '../utils/logger': silentLogger, '../premium/premium': {}, '../database/guildConfig': {},
    '../handlers/buttons/buttonHandlers': {}, './reactionRoles': {},
    '../handlers/commandAuthorization': { authorizeCommand: createCommandAuthorizer({ getOwnerId: () => 'owner' }) },
  });
  const command = { execute: async () => { slashCalls++; } };
  const interaction = { ...context(), isCommand: () => true, commandName: 'ping', reply: async () => { denials++; },
    client: { commands: new Map([['ping', { execute: async () => { prefixCalls++; } }]]), slashCommands: new Map([['ping', command]]) } };
  await handler.execute(interaction);
  assert.equal(slashCalls, 1); assert.equal(prefixCalls, 0);
  command.ownerOnly = true;
  await handler.execute(interaction);
  assert.equal(slashCalls, 1); assert.equal(denials, 1);
});
