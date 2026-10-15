const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');

test('development fails closed without a test guild and disables automated events', () => {
  const unset = loadModule('src/config/development.js', {}, { DEVELOPMENT_MODE: 'true' });
  assert.equal(unset.allowsGuild('guild'), false);
  const configured = loadModule('src/config/development.js', {}, { DEVELOPMENT_MODE: 'true', DEVELOPMENT_GUILD_IDS: ' guild ' });
  assert.equal(configured.allowsGuild('guild'), true); assert.equal(configured.allowsGuild('other'), false);
  assert.equal(configured.allowsAutomation('guild'), false);
  const production = loadModule('src/config/development.js', {});
  assert.equal(production.allowsGuild('other'), true); assert.equal(production.allowsAutomation('other'), true);
});

test('development allows declared prefixless commands while ignoring ordinary messages and automation', async () => {
  let commands = 0, xp = 0, reactions = 0;
  const handler = loadModule('src/events/messageCreate.js', {
    '../database/guildConfig': { getGuildConfig: async () => ({ prefix: '=', settings: {} }) },
    '../utils/logger': silentLogger,
    '../database/autoReactSettings': { getAutoReactionsForGuild: async () => { reactions++; return []; } },
    '../config/development': { isDevelopment: () => true, allowsGuild: id => id === 'guild' },
    '../database/levelSystem': { addXp: async () => { xp++; return { leveledUp: false }; } },
    '../database/levelSettings': { getGuildSettingsWithDefaults: async () => ({}) },
    '../utils/levelRoleManager': {},
    '../handlers/commandAuthorization': { authorizeCommand: () => ({ allowed: true }) },
  });
  const message = { author: { id: 'user', bot: false }, guild: { id: 'guild' }, channel: { id: 'channel' }, content: 'clear 1' };
  const client = { user: { id: 'bot' }, commands: new Map([
    ['clear', { name: 'clear', aliases: ['c'], prefixless: true, execute: async () => { commands++; } }],
    ['setup', { name: 'setup', prefixless: false, execute: async () => { commands++; } }],
  ]) };
  await handler.execute(message, client); message.content = 'Raymond hello'; await handler.execute(message, client);
  assert.equal(commands, 1);
  message.content = 'c 1'; await handler.execute(message, client); assert.equal(commands, 2);
  message.content = 'setup'; await handler.execute(message, client); assert.equal(commands, 2);
  message.content = '=clear 1'; await handler.execute(message, client);
  assert.equal(commands, 3); assert.equal(xp, 0); assert.equal(reactions, 0);
  message.guild.id = 'other'; await handler.execute(message, client); assert.equal(commands, 3);
});

test('production ignores former AI triggers without fetching reply context and still runs shortcuts', async () => {
  let executed = 0, fetched = 0, typing = 0;
  const handler = loadModule('src/events/messageCreate.js', {
    '../database/guildConfig': { getGuildConfig: async () => ({ prefix: '=', settings: { spamDetectionEnabled: false } }) },
    '../utils/logger': silentLogger,
    '../database/autoReactSettings': { getAutoReactionsForGuild: async () => [] },
    '../config/development': { isDevelopment: () => false, allowsGuild: () => true },
    '../database/levelSystem': { addXp: async () => ({ leveledUp: false }) },
    '../database/levelSettings': { getGuildSettingsWithDefaults: async () => ({}) },
    '../utils/levelRoleManager': {},
    '../handlers/commandAuthorization': { authorizeCommand: () => ({ allowed: true }) },
  });
  const message = { author: { id: 'user', bot: false }, guild: { id: 'guild' },
    channel: { id: 'chat', messages: { fetch: async () => { fetched++; } }, sendTyping: async () => { typing++; } },
    reference: { messageId: 'old-bot-message' }, mentions: { users: new Map([['bot', {}]]) } };
  const client = { user: { id: 'bot' }, commands: new Map([
    ['avatar', { name: 'avatar', aliases: ['a'], prefixless: true, execute: async () => { executed++; } }],
  ]) };
  for (const content of ['Raymond hello', '<@bot> hello', '=ai hello', '=ask hello', '=gpt hello', '=gemini hello', '=aiwhitelist list']) {
    message.content = content; await handler.execute(message, client);
  }
  assert.equal(executed, 0); assert.equal(fetched, 0); assert.equal(typing, 0);
  message.content = 'a'; await handler.execute(message, client);
  assert.equal(executed, 1);
  message.content = '=avatar'; await handler.execute(message, client);
  assert.equal(executed, 2);
});
