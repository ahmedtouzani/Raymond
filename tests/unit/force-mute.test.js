const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/load-module.cjs');

const isBotOwner = (id, owner = 'botowner') => id === owner;
const load = () => loadModule('src/services/forceMute.js', { '../handlers/commandAuthorization': { isBotOwner } }, { OWNER_ID: 'botowner' });

function voiceMember(id, { muted = false, bot = false, channelId = 'room', fail = false } = {}) {
  const member = { id, user: { bot, tag: id }, calls: [], toString: () => `<@${id}>` };
  member.voice = {
    serverMute: muted, channelId,
    async setMute(value) { if (fail) throw new Error('nope'); member.calls.push(value); member.voice.serverMute = value; },
  };
  return member;
}
function room(members) {
  const guild = { id: 'g', ownerId: 'serverowner', members: { cache: new Map(members.map(m => [m.id, m])), fetch: async () => null } };
  return { guild, channel: { name: 'room', guild, members: new Map(members.map(m => [m.id, m])) } };
}
const ids = list => JSON.stringify(list.map(member => member.id).sort());

test('only the bot owner, the server owner and administrators may force mute', () => {
  const fm = load();
  const member = (admin, id = 'x') => ({ guild: { ownerId: 'serverowner' }, permissions: { has: () => admin }, id });
  assert.equal(fm.canForceMute(member(false), 'botowner', 'botowner'), true);
  assert.equal(fm.canForceMute(member(false), 'serverowner', 'botowner'), true);
  assert.equal(fm.canForceMute(member(true), 'admin', 'botowner'), true);
  assert.equal(fm.canForceMute(member(false), 'mod', 'botowner'), false);
});

test('forcemute mutes everyone in the room except the issuer, owners and bots', async () => {
  const fm = load();
  const people = { issuer: voiceMember('issuer'), a: voiceMember('a'), b: voiceMember('b'), bot: voiceMember('bot', { bot: true }),
    owner: voiceMember('botowner'), server: voiceMember('serverowner'), punished: voiceMember('punished', { muted: true }), broken: voiceMember('broken', { fail: true }) };
  const { channel } = room(Object.values(people));
  const result = await fm.muteRoom(channel, people.issuer, 'botowner');
  assert.equal(ids(result.muted), JSON.stringify(['a', 'b']));
  assert.equal(ids(result.already), JSON.stringify(['punished']));
  assert.equal(ids(result.failed), JSON.stringify(['broken']));
  for (const key of ['issuer', 'bot', 'owner', 'server', 'punished']) assert.deepEqual(people[key].calls, [], key);
});

test('forceunmute lifts only forcemute mutes, and defers members who left voice', async () => {
  const fm = load();
  const issuer = voiceMember('issuer'), a = voiceMember('a'), gone = voiceMember('gone'), punished = voiceMember('punished', { muted: true });
  const { guild, channel } = room([issuer, a, gone, punished]);
  await fm.muteRoom(channel, issuer, 'botowner');
  gone.voice.channelId = null;
  const result = await fm.unmuteForced(guild, issuer);
  assert.equal(ids(result.unmuted), JSON.stringify(['a']));
  assert.equal(ids(result.pending), JSON.stringify(['gone']));
  assert.equal(a.voice.serverMute, false);
  assert.equal(punished.voice.serverMute, true, 'an earlier punishment stays');
  assert.equal(fm.forcedCount('g'), 0);

  let lifted = false;
  await fm.onVoiceState({ channelId: null }, { id: 'gone', guild, channelId: 'room', serverMute: true, setMute: async v => { lifted = v === false; } });
  assert.equal(lifted, true, 'unmuted on rejoin');
});

test('forceunmute all also unmutes other server mutes in the room', async () => {
  const fm = load();
  const issuer = voiceMember('issuer'), punished = voiceMember('punished', { muted: true }), owner = voiceMember('botowner', { muted: true });
  const { channel } = room([issuer, punished, owner]);
  const result = await fm.unmuteRoom(channel, issuer, 'botowner');
  assert.equal(ids(result.unmuted), JSON.stringify(['punished']));
  assert.equal(owner.voice.serverMute, true, 'owner mutes are left to Owner Guard');
});
