const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const icons = require('../../src/config/setupEmojis');
function componentData(payload) { return payload.components.map(component => component.toJSON()); }
function walk(components) { return components.flatMap(component => [component, ...walk(component.components || []), ...(component.accessory ? walk([component.accessory]) : [])]); }
function textContent(payload) { return walk(componentData(payload)).filter(component => component.type === 10).map(component => component.content).join('\n'); }

const guide = loadModule('src/services/helpCatalog.js', {
  '../handlers/commandAuthorization': { isBotOwner: id => id === 'owner' }, '../config/setupEmojis': icons,
});
function fixtures() {
  const commands = new Map([
    ['help', { name: 'help', aliases: ['h', 'commands'], category: 'Utility', prefixless: true }],
    ['stealemoji', { name: 'stealemoji', aliases: ['se'], prefixless: true }],
    ['move', { name: 'move', aliases: ['aji'], category: 'moderation', prefixless: true, usage: '!move @user' }],
    ['level', { name: 'level', aliases: ['r'], prefixless: true }],
    ['setup', { name: 'setup', category: 'Admin' }],
    ['massdm', { name: 'massdm', category: 'Owner' }],
    ['shutdown', { name: 'shutdown', ownerOnly: true }],
    ['massrole', { name: 'massrole', aliases:['roleswap','mr'], ownerOnly:true, hidden:true }],
    ['avatar', { name: 'avatar', aliases: ['a'], prefixless: true, usage: 'avatar [user]' }],
    ...Array.from({ length: 30 }, (_, i) => [`mod${i}`, { name: `mod${i}`, category: 'Moderation', description: 'A moderation command', usage: '<member>' }]),
  ]);
  const client = { commands, user: { username: 'Raymond', displayAvatarURL: () => 'https://example.com/avatar.png' } };
  const message = { author: { id: 'user' }, guild: { id: 'guild', name: 'Server' } };
  return { client, message };
}
function helpModule() {
  return loadModule('src/commands/utility/help.js', {
    '../../database/guildConfig': { getGuildConfig: async () => ({ prefix: '?' }) },
    '../../services/helpCatalog': guide, '../../config/setupEmojis': icons, '../../utils/logger': silentLogger,
  });
}

test('help resolves aliases against a Map catalog and hides private owner commands everywhere', () => {
  const { client } = fixtures();
  const ordinary = guide.catalog(client, 'user');
  assert.equal(guide.resolveCommand(ordinary, 'se', '?').name, 'stealemoji');
  assert.equal(guide.resolveCommand(ordinary, '?aji', '?').name, 'move');
  assert.equal(guide.resolveCommand(ordinary, 'shutdown', '?'), undefined);
  assert.equal(guide.searchCommands(ordinary, 'massdm', '?').length, 0);
  assert.equal(guide.resolveCommand(guide.catalog(client, 'owner'), 'shutdown', '?'), undefined);
  assert.equal(guide.searchCommands(guide.catalog(client, 'owner'), 'massdm', '?').length, 0);
  assert.equal(guide.resolveCommand(ordinary,'massrole','?'),undefined);
  assert.equal(guide.resolveCommand(guide.catalog(client,'owner'),'mr','?'),undefined);
  assert.equal(ordinary.find(command => command.name === 'move').categoryId, 'moderation');
  assert.equal(ordinary.find(command => command.name === 'level').categoryId, 'leveling');
  assert(ordinary.find(command => command.name === 'setprefix'));
});

test('help normalizes legacy usages and missing command names without rewriting argument values', () => {
  assert.equal(guide.normalizeUsage({ name: 'move', aliases: [], usage: '!move @user | =move @user #voice' }, '?').join('\n'), '?move @user\n?move @user #voice');
  assert.equal(guide.normalizeUsage({ name: 'setembedcolor', aliases: [], usage: '<hex>' }, '$')[0], '$setembedcolor <hex>');
  const { client } = fixtures();
  assert.equal(guide.resolveCommand(guide.catalog(client, 'user'), 'help', 'h').name, 'help');
});

test('all help categories, pages and command details produce valid Discord components', () => {
  const help = helpModule();
  const { client, message } = fixtures();
  const commands = guide.catalog(client, 'user');
  const state = { prefix: '?', category: null, command: null, query: '', page: 0 };
  const check = payload => {
    assert.equal(payload.flags, 32768);
    assert.equal(payload.embeds, undefined);
    const all = walk(componentData(payload));
    assert(all.length <= 40);
    assert(textContent(payload).length <= 4000);
    assert(all.filter(component => component.type === 10).every(component => component.content.length <= 4000));
  };
  check(help.renderHelp(state, message, client));
  for (const command of commands) {
    help.selectQuery(state, commands, command.name);
    check(help.renderHelp(state, message, client));
    state.expanded = true; check(help.renderHelp(state, message, client));
  }
  state.category = 'moderation'; state.command = null; state.query = '';
  for (const page of [0, 1, 2, 3]) { state.page = page; check(help.renderHelp(state, message, client)); }
  help.selectQuery(state, commands, 'doesnotexist'); check(help.renderHelp(state, message, client));
});

test('specific alias help shows real examples, prefix rules and permissions instead of executing anything', async () => {
  const help = helpModule(); const { client, message } = fixtures();
  let executes = 0;
  client.commands.get('stealemoji').execute = () => { executes++; };
  const collector = new EventEmitter(); collector.stop = reason => collector.emit('end', [], reason);
  let payload;
  message.reply = async reply => { payload = reply; return { createMessageComponentCollector: () => collector, edit: async () => {} }; };
  await help.execute(message, ['se'], client);
  const rendered = textContent(payload);
  assert(rendered.includes('stealemoji'));
  assert(rendered.includes('?se'));
  assert(rendered.includes('Prefix optional'));
  assert(rendered.includes('Create Expressions'));
  assert.equal(executes, 0);
  collector.stop('closed');
});

test('help collectors support paging, command selection and search while rejecting other users', async () => {
  const help = helpModule(); const { client, message } = fixtures();
  const collector = new EventEmitter(); collector.ended = false;
  collector.stop = reason => { collector.ended = true; collector.emit('end', [], reason); };
  const edits = [], replies = [];
  let complete;
  const panel = { createMessageComponentCollector: () => collector, edit: async payload => { edits.push(payload); complete?.(); } };
  message.reply = async () => panel;
  await help.execute(message, [], client);
  async function click(action, values = [], user = 'user') {
    const done = new Promise(resolve => { complete = resolve; });
    const interaction = { id: 'id', customId: `help:${action}`, values, user: { id: user }, deferUpdate: async () => {}, reply: async payload => { replies.push(payload); complete(); }, followUp: async () => complete() };
    interaction.awaitModalSubmit = async () => ({ ...interaction, fields: { getTextInputValue: () => values[0] } });
    interaction.showModal = async modal => modal.toJSON();
    collector.emit('collect', interaction); await done;
  }
  await click('category', ['moderation'], 'stranger'); assert.equal(edits.length, 0);
  await click('category', ['moderation']);
  await click('next');
  assert(textContent(edits.at(-1)).includes('Page 2 of'));
  await click('search', ['se']);
  assert(textContent(edits.at(-1)).includes('stealemoji'));
  await click('home');
  assert(textContent(edits.at(-1)).includes('Command Center'));
  await click('close'); assert.equal(walk(componentData(edits.at(-1))).some(component => component.type === 2), false);
});


test('owner-only commands and private categories never appear even in the owner’s Help', () => {
  const { client, message } = fixtures(); message.author.id = 'owner';
  client.commands.get('shutdown').aliases = ['secretalias'];
  const help = helpModule();
  const commands = guide.catalog(client, 'owner');
  for (const query of ['', 'shutdown', 'massdm', 'secretalias']) {
    const state = { prefix: '?', command: null, category: null, query: '', page: 0 };
    if (query) help.selectQuery(state, commands, query);
    const rendered = JSON.stringify(componentData(help.renderHelp(state, message, client)));
    assert.equal(/shutdown|massdm|secretalias|Owner Tools/.test(rendered), false);
  }
  assert.deepEqual(guide.catalog(client, 'owner').map(command => command.name), guide.catalog(client, 'user').map(command => command.name));
});
