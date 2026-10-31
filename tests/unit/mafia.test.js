const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/load-module.cjs');

const mafia = loadModule('src/commands/utility/mafia.js', {});
function walk(components) { return components.flatMap(component => [component, ...walk(component.components || [])]); }
const parts = payload => walk(payload.components.map(component => component.toJSON()));

test('mafia card links to the game and lists every rules section', () => {
  const card = parts(mafia.renderCard());
  const link = card.find(part => part.type === 2);
  assert.equal(link.url, 'https://mafia.resvyo.com');
  const menu = card.find(part => part.type === 3);
  assert.equal(menu.custom_id, 'mafia:rules');
  assert.equal(JSON.stringify(menu.options.map(option => option.value)), JSON.stringify(Object.keys(mafia.sections)));
});

test('mafia role sections cover all 29 playable roles', () => {
  const count = key => mafia.sections[key].text.split('\n').filter(line => /^\S+ \*\*.+:\*\*/.test(line)).length;
  assert.deepEqual([count('town'), count('mafia'), count('solo')], [19, 7, 3]);
});

test('every section fits in one Discord text display', () => {
  for (const section of Object.values(mafia.sections)) assert.ok(section.text.length <= 4000);
});

test('choosing a section answers privately with that section', async () => {
  let reply;
  await mafia.handleInteraction({ customId: 'mafia:rules', isStringSelectMenu: () => true, values: ['vote'], reply: payload => { reply = payload; } });
  const content = parts(reply).filter(part => part.type === 10).map(part => part.content).join('\n');
  assert.match(content, /التصويت والإعدام/);
  assert.ok(reply.flags & 64, 'reply should be ephemeral');
});
