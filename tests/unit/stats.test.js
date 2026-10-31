const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/load-module.cjs');

const stats = loadModule('src/commands/utility/stats.js', {});
function walk(components) { return components.flatMap(component => [component, ...walk(component.components || []), ...(component.accessory ? [component.accessory] : [])]); }
function guild(icon = 'https://example.com/icon.png') {
  const states = [{ channelId: 'a' }, { channelId: 'b' }, { channelId: null }];
  return {
    name: 'Parallel Universe', memberCount: 2098, premiumSubscriptionCount: 14, iconURL: () => icon,
    voiceStates: { cache: { filter: fn => ({ size: states.filter(fn).length }) } },
  };
}

test('stats counts members, members connected to voice and boosters', () => {
  assert.deepEqual({ ...stats.countStats(guild()) }, { members: 2098, voice: 2, boosters: 14 });
});

test('stats renders the statistics card with disabled counter buttons', () => {
  const payload = stats.renderStats(guild(), { members: 2098, voice: 36, boosters: 14 });
  const parts = walk(payload.components.map(component => component.toJSON()));
  const content = parts.filter(part => part.type === 10).map(part => part.content).join('\n');
  assert.match(content, /## Parallel Universe Statistics/);
  assert.match(content, /Total Members:\*\* `2098`/);
  assert.match(content, /Active in Voice:\*\* `36`/);
  assert.match(content, /Boosters:\*\* `14`/);
  assert.match(content, /Stay active, and enjoy your time in Parallel Universe/);
  assert.equal(parts.find(part => part.type === 11).media.url, 'https://example.com/icon.png');
  const buttons = parts.filter(part => part.type === 2);
  assert.equal(JSON.stringify(buttons.map(button => [button.label, button.disabled])), JSON.stringify([['Members: 2098', true], ['in Voice: 36', true]]));
});

test('stats falls back to plain text when the server has no icon', () => {
  const parts = walk(stats.renderStats(guild(null), { members: 1, voice: 0, boosters: 0 }).components.map(c => c.toJSON()));
  assert.equal(parts.some(part => part.type === 11), false);
});
