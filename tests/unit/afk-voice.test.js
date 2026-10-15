const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const Status = { Ready: 'ready', Destroyed: 'destroyed', Disconnected: 'disconnected', Signalling: 'signalling', Connecting: 'connecting' };

function fixture() {
  const connections = new Map(), joins = [];
  let waitReady = async connection => { connection.state.status = Status.Ready; };
  const service = loadModule('src/services/afkVoice.js', {
    '../utils/logger': silentLogger,
    '@discordjs/voice': {
      VoiceConnectionStatus: Status,
      getVoiceConnection: id => connections.get(id),
      joinVoiceChannel: options => {
        joins.push(options);
        const connection = new EventEmitter();
        connection.joinConfig = options; connection.state = { status: Status.Connecting }; connection.destroyed = 0;
        connection.destroy = () => { connection.destroyed++; connection.state.status = Status.Destroyed; connections.delete(options.guildId); };
        connections.set(options.guildId, connection); return connection;
      },
      entersState: async (connection, state) => {
        if (state === Status.Ready) { await waitReady(connection); return connection; }
        throw new Error('Reconnect timed out');
      },
    },
  });
  return { service, connections, joins, setWait: fn => { waitReady = fn; }, guild: { id: 'guild', voiceAdapterCreator: {} } };
}

test('AFK waits for Ready, joins muted/deafened and reuses a ready connection', async () => {
  const f = fixture();
  assert.equal((await f.service.joinAfk(f.guild, 'voice')).alreadyJoined, false);
  assert.equal(f.joins[0].selfMute, true); assert.equal(f.joins[0].selfDeaf, true);
  assert.equal((await f.service.joinAfk(f.guild, 'voice')).alreadyJoined, true);
  assert.equal(f.joins.length, 1);
});

test('a failed handshake destroys the incomplete connection and permits retry', async () => {
  const f = fixture(); let failed;
  f.setWait(async connection => { failed = connection; throw new Error('Unexpected server response: 403'); });
  await assert.rejects(f.service.joinAfk(f.guild, 'voice'), /403/);
  assert.equal(failed.destroyed, 1); assert.equal(f.connections.has('guild'), false);
  f.setWait(async connection => { connection.state.status = Status.Ready; });
  await f.service.joinAfk(f.guild, 'voice'); assert.equal(f.joins.length, 2);
});

test('unafk cancels a pending join without a subsequent failure result', async () => {
  const f = fixture(); let reject;
  f.setWait(() => new Promise((_, fail) => { reject = fail; }));
  const joining = f.service.joinAfk(f.guild, 'voice');
  assert.equal(f.service.leaveAfk('guild'), true);
  reject(new Error('Connection destroyed'));
  assert.equal((await joining).cancelled, true);
  assert.equal(f.service.leaveAfk('guild'), false);
});

test('AFK rejects overlapping joins in one guild while other guilds remain independent', async () => {
  const f = fixture(); let finish;
  f.setWait(connection => connection.joinConfig.guildId === 'guild' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve());
  const first = f.service.joinAfk(f.guild, 'voice');
  await assert.rejects(f.service.joinAfk(f.guild, 'other'), error => error.code === 'VOICE_BUSY');
  await f.service.joinAfk({ id: 'other-guild' }, 'other');
  finish(); await first;
});

test('transport errors are handled and unrecoverable disconnected sessions are cleaned up', async () => {
  const f = fixture(); await f.service.joinAfk(f.guild, 'voice');
  const connection = f.connections.get('guild');
  assert.doesNotThrow(() => connection.emit('error', new Error('Transport failure')));
  connection.state.status = Status.Disconnected;
  await connection.listeners(Status.Disconnected)[0]();
  assert.equal(connection.destroyed, 1);
});

function command({ owner = true, permissions = true, failure, responseFailure = false } = {}) {
  const replies = [], joins = [];
  const module = loadModule('src/commands/OwnerOnly/afk.js', {
    '../../handlers/functions/sendEmbed': { sendEmbed: async (_, payload) => { replies.push(payload); if (responseFailure) throw new Error('Cannot send text'); } },
    '../../handlers/commandAuthorization': { isBotOwner: () => owner },
    '../../services/afkVoice': { joinAfk: async (...args) => { joins.push(args); if (failure) throw failure; return {}; } },
    '../../utils/logger': silentLogger,
  });
  const message = { author: { id: 'owner' }, guild: { id: 'guild', members: { fetchMe: async () => ({}) } },
    member: { voice: { channel: { id: 'voice', name: 'Voice', permissionsFor: () => ({ has: () => permissions }) } } } };
  return { module, message, replies, joins };
}

test('AFK rechecks owner and channel permissions before connecting', async () => {
  for (const options of [{ owner: false }, { permissions: false }]) {
    const f = command(options); await f.module.execute(f.message);
    assert.equal(f.joins.length, 0); assert.equal(f.replies.length, 1);
  }
});

test('AFK explains a blocked Voice network and never reports a failed join as successful', async () => {
  const f = command({ failure: new Error('Unexpected server response: 403') }); await f.module.execute(f.message);
  assert.equal(f.replies[0].title, 'Voice Connection Failed');
  assert.match(f.replies[0].description, /hosting network/);
});

test('a successful Voice join followed by text failure does not become a false connection error', async () => {
  const f = command({ responseFailure: true });
  await assert.rejects(f.module.execute(f.message), /Cannot send text/);
  assert.equal(f.replies.length, 1); assert.equal(f.replies[0].title, 'AFK Mode Activated');
});
