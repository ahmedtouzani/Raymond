const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');

function getAllCommandFiles(dir, files = []) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllCommandFiles(fullPath, files);
    } else if (file.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadCommands(client, commandsPath = path.join(__dirname, '../commands')) {
  client.commands = new Map();
  const commandFiles = getAllCommandFiles(commandsPath);
  for (const file of commandFiles) {
    try {
      const command = require(file);
      if (command && command.name) {
        client.commands.set(command.name, command);
        logger.info(`Loaded command: ${command.name}`);
      }
    } catch (err) {
      logger.error(`Failed to load command ${file}:`, err);
    }
  }
}

function setupCommandHotReload(client, commandsPath = path.join(__dirname, '../commands')) {
  const watcher = chokidar.watch(commandsPath, { ignoreInitial: true });
  watcher.on('add', file => reloadCommand(client, file));
  watcher.on('change', file => reloadCommand(client, file));
  watcher.on('unlink', file => unloadCommand(client, file));
}

function reloadCommand(client, file) {
  try {
    delete require.cache[require.resolve(file)];
    const command = require(file);
    if (command && command.name) {
      client.commands.set(command.name, command);
      logger.info(`Reloaded command: ${command.name}`);
    }
  } catch (err) {
    logger.error(`Failed to reload command ${file}:`, err);
  }
}

function unloadCommand(client, file) {
  try {
    const command = require(file);
    if (command && command.name) {
      client.commands.delete(command.name);
      logger.info(`Unloaded command: ${command.name}`);
    }
    delete require.cache[require.resolve(file)];
  } catch (err) {
    logger.error(`Failed to unload command ${file}:`, err);
  }
}

module.exports = { loadCommands, setupCommandHotReload };
