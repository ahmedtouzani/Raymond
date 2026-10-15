const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const auditEvents = require('../services/auditEvents');

function dispatch(client, name, execute) {
  return async (...args) => {
    try { await auditEvents.observe(name, args, client); } catch (error) { logger.error(`Audit observation ${name} failed:`, error); }
    try { await execute(...args, client); } catch (error) { logger.error(`Event ${name} failed:`, error); }
  };
}

function loadEvents(client, eventsPath = path.join(__dirname, '../events')) {
  const loadedNames = new Set();
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));
      if (event && event.disabled) {
        logger.info(`Skipped disabled event: ${file}`);
        continue;
      }
      if (event && event.name && typeof event.execute === 'function') {
        loadedNames.add(event.name);
        if (event.once) {
          client.once(event.name, dispatch(client, event.name, event.execute));
        } else {
          client.on(event.name, dispatch(client, event.name, event.execute));
        }
        logger.info(`Loaded event: ${event.name}`);
      }
    } catch (err) {
      logger.error(`Failed to load event ${file}:`, err);
    }
  }
  for (const name of auditEvents.supported) {
    if (!loadedNames.has(name)) client.on(name, dispatch(client, name, async () => {}));
  }
}

function setupEventHotReload(client, eventsPath = path.join(__dirname, '../events')) {
  const watcher = chokidar.watch(eventsPath, { ignoreInitial: true });
  watcher.on('add', file => reloadEvent(client, file));
  watcher.on('change', file => reloadEvent(client, file));
  watcher.on('unlink', file => unloadEvent(client, file));
}

function reloadEvent(client, file) {
  try {
    delete require.cache[require.resolve(file)];
    const event = require(file);
    if (event && event.disabled) {
      logger.info(`Skipped disabled event on reload: ${path.basename(file)}`);
      return;
    }
    if (event && event.name && typeof event.execute === 'function') {
      client.removeAllListeners(event.name);
      if (event.once) {
        client.once(event.name, dispatch(client, event.name, event.execute));
      } else {
        client.on(event.name, dispatch(client, event.name, event.execute));
      }
      logger.info(`Reloaded event: ${event.name}`);
    }
  } catch (err) {
    logger.error(`Failed to reload event ${file}:`, err);
  }
}

function unloadEvent(client, file) {
  try {
    const event = require(file);
    if (event && event.name) {
      client.removeAllListeners(event.name);
      if (auditEvents.supported.includes(event.name)) client.on(event.name, dispatch(client, event.name, async () => {}));
      logger.info(`Unloaded event: ${event.name}`);
    }
    delete require.cache[require.resolve(file)];
  } catch (err) {
    logger.error(`Failed to unload event ${file}:`, err);
  }
}

module.exports = { loadEvents, setupEventHotReload };
