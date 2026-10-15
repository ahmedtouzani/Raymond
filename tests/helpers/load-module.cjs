const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

// Exercise the real module while substituting its external side effects.
function loadModule(file, dependencies, env = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports,
    __dirname: path.dirname(path.join(root, file)), __filename: path.join(root, file),
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name === 'discord.js') return require('discord.js');
      if (name === '../config/development') return require('../../src/config/development');
      throw new Error(`Unexpected dependency in ${file}: ${name}`);
    },
    process: { env }, console: { ...silentLogger, log() {} }, global: {},
    Date, Map, Set, Promise, AbortSignal, AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval, ...globals,
  }, { filename: file });
  return module.exports;
}
module.exports = { loadModule, silentLogger };
