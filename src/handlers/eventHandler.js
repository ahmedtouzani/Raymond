const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');

function loadEvents(client, eventsPath = path.join(__dirname, '../events')) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));
      if (event && event.disabled) {
        logger.info(`Skipped disabled event: ${file}`);
        continue;
      }
      if (event && event.name && typeof event.execute === 'function') {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args) => event.execute(...args, client));
        }
        logger.info(`Loaded event: ${event.name}`);
      }
    } catch (err) {
      logger.error(`Failed to load event ${file}:`, err);
    }
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
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
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
      logger.info(`Unloaded event: ${event.name}`);
    }
    delete require.cache[require.resolve(file)];
  } catch (err) {
    logger.error(`Failed to unload event ${file}:`, err);
  }
}

module.exports = { loadEvents, setupEventHotReload };
