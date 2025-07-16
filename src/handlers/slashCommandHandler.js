const fs = require('fs');
const path = require('path');
const { Collection, REST, Routes } = require('discord.js');
const logger = require('../utils/logger');

function getAllFiles(dir, ext = '.js', files = []) {
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      getAllFiles(filepath, ext, files);
    } else if (file.endsWith(ext)) {
      files.push(filepath);
    }
  });
  return files;
}

function loadSlashCommands(client, commandsPath = path.join(__dirname, '../interactions/Command')) {
  client.slashCommands = new Collection();
  const commandFiles = getAllFiles(commandsPath);

  for (const file of commandFiles) {
    try {
      delete require.cache[require.resolve(file)];
      const command = require(file);

      if (!command.data || typeof command.execute !== 'function') {
        logger.warn(`Invalid slash command (missing data or execute): ${file}`);
        continue;
      }

      if (client.slashCommands.has(command.data.name)) {
        logger.warn(`Duplicate command name: ${command.data.name}`);
        continue;
      }

      client.slashCommands.set(command.data.name, command);
      logger.info(`Loaded slash command: ${command.data.name}`);
    } catch (err) {
      logger.error(`Failed to load slash command ${file}:`, err);
    }
  }
}

async function registerSlashCommands(client, guildId = null) {
  if (!client.slashCommands) return;
  const commands = Array.from(client.slashCommands.values()).map(cmd => cmd.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(client.token);

  try {
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      logger.info(`Registered slash commands for guild: ${guildId}`);
    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      logger.info('Registered all slash commands globally.');
    }
  } catch (err) {
    logger.error('Failed to register slash commands:', err);
  }
}

module.exports = { loadSlashCommands, registerSlashCommands };

