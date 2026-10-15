const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/load-module.cjs');

function startup(failure) {
  const calls = [];
  class Migrator {
    constructor() { calls.push('constructor'); if (failure === 'constructor') throw new Error('Missing database'); }
    async run() { calls.push('migrate'); if (failure === 'migrate') throw new Error('Migration failed'); }
    async close() { calls.push('close'); if (failure === 'close') throw new Error('Database did not close'); }
  }
  const bot = {};
  const dependencies = { '../scripts/migrate': Migrator };
  Object.defineProperty(dependencies, './bot', { get() { calls.push('load bot'); return bot; } });
  return { calls, bot, ...loadModule('src/startup.js', dependencies) };
}

test('startup loads the bot only after successful migrations and connection cleanup', async () => {
  const instance = startup();
  assert.equal(await instance.startBot(), instance.bot);
  assert.deepEqual(instance.calls, ['constructor', 'migrate', 'close', 'load bot']);
});
for (const failure of ['constructor', 'migrate', 'close']) {
  test(`startup refuses to load the bot after ${failure} fails`, async () => {
    const instance = startup(failure);
    await assert.rejects(instance.startBot());
    assert.equal(instance.calls.includes('load bot'), false);
    if (failure === 'migrate') assert.deepEqual(instance.calls, ['constructor', 'migrate', 'close']);
  });
}
