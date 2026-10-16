const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');

test('shutdown closes audit worker, client and database exactly once', async () => {
  const closed = [], exits = [];
  const module = loadModule('src/utils/gracefulShutdown.js', {
    '../services/auditLogs': { stop: async () => { closed.push('audit'); } },
    '../services/voiceXp': { stop: async () => {} },
    '../services/voicePresence': { stop: async () => {} },
    '../services/ownerGuard': { stop: async () => {} },
    '../services/massRoles': { stop: async () => {} },
    './logger': silentLogger,
  }, {}, { process: { exit: code => exits.push(code) } });
  const client = { destroy: async () => { closed.push('client'); } }, db = { end: async () => { closed.push('database'); } };
  await module.gracefulShutdown('SIGTERM', client, db); await module.gracefulShutdown('SIGTERM', client, db);
  assert.deepEqual(closed, ['audit', 'client', 'database']); assert.deepEqual(exits, [0]);
});

test('shutdown closes remaining resources after a failure and exits nonzero', async () => {
  const exits = []; let databaseClosed = false;
  const module = loadModule('src/utils/gracefulShutdown.js', {
    '../services/auditLogs': { stop: async () => { throw new Error('failure'); } },
    '../services/voiceXp': { stop: async () => {} },
    '../services/voicePresence': { stop: async () => {} },
    '../services/ownerGuard': { stop: async () => {} },
    '../services/massRoles': { stop: async () => {} },
    './logger': silentLogger,
  }, {}, { process: { exit: code => exits.push(code) } });
  await module.gracefulShutdown('UNCAUGHT_EXCEPTION', { destroy: async () => {} }, { end: async () => { databaseClosed = true; } }, 1);
  assert(databaseClosed); assert.deepEqual(exits, [1]);
});
