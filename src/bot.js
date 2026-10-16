const { Client, GatewayIntentBits, Partials } = require('discord.js');
const logger = require('./utils/logger');
const { updateChangelog } = require('./utils/changelog');
const { retryOperation } = require('./utils/retry');

require('dotenv').config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent, // Privileged: must be enabled in the Discord Developer Portal
  ],
  partials: [
    Partials.User,
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.ThreadMember,
    Partials.GuildScheduledEvent,
  ],
});

const { setGuildConfig } = require('./database/guildConfig');

// --- Auto-create config when bot joins a new guild ---
client.on('guildCreate', async (guild) => {
  try {
    const defaultPrefix = process.env.GLOBAL_PREFIX || process.env.PREFIX;
    await setGuildConfig(guild.id, { prefix: defaultPrefix, settings: {} });
    if (!require('./config/development').isDevelopment()) {
      for (const state of guild.voiceStates.cache.values()) require('./services/voiceXp').sync(state);
    }
    logger.info(`Created config for new guild: ${guild.name} (${guild.id})`);
    updateChangelog('INFO', `Created config for new guild: ${guild.name} (${guild.id})`);
  } catch (err) {
    logger.error('Failed to create config for new guild:', err);
    updateChangelog('ERROR', `Failed to create config for new guild: ${guild.name} (${guild.id}): ${err.message}`);
  }
});



// Initialize AntiNukeSystem

// Load the bot token from the .env file
const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORDTOKEN;
if (!TOKEN) {
  console.error('ERROR: BOT_TOKEN (or DISCORD_TOKEN) is not set in the .env file.');
  process.exit(1);
}




// --- HANDLER SYSTEM: Load commands, events, and slash commands dynamically ---
const { loadCommands, setupCommandHotReload } = require('./handlers/commandHandler');
const { loadEvents, setupEventHotReload } = require('./handlers/eventHandler');
const { loadSlashCommands, registerSlashCommands } = require('./handlers/slashCommandHandler');

loadCommands(client);
loadEvents(client);
client.once('ready', () => require('./services/auditLogs').start(client));
client.once('ready', () => require('./services/voicePresence').start(client).catch(error=>logger.warn('Voice presence startup failed',{code:error.code||error.name})));
client.on('guildAuditLogEntryCreate',(entry,guild)=>require('./services/ownerGuard').onAudit(entry,guild));
client.once('ready',()=>require('./services/ownerGuard').start(client));
loadSlashCommands(client);

if (process.env.NODE_ENV !== 'production') {
  setupCommandHotReload(client);
  setupEventHotReload(client);
}


// Log in to Discord with your client's token
client.login(TOKEN).catch(error => {
  logger.error('Failed to login to Discord:', error);
  updateChangelog('ERROR', 'Failed to login to Discord: ' + error.message);
  process.exit(1); // Exit the process if login fails, as the bot cannot function.
});

// Listen for general errors from the Discord client
client.on('error', error => {
  logger.error('Discord client error:', error);
  updateChangelog('ERROR', 'Discord client error: ' + error.message);
});

// Catch unhandled promise rejections globally
process.on('unhandledRejection', error => {
  logger.error('Unhandled Promise Rejection:', error);
  updateChangelog('ERROR', 'Unhandled Promise Rejection: ' + (error && error.message ? error.message : error));
  // Depending on the error, you might want to gracefully shut down or attempt recovery.
});

// Graceful shutdown integration
const { gracefulShutdown } = require('./utils/gracefulShutdown');

// Listen for termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT', client, require('./services/database')));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', client, require('./services/database')));

// Catch uncaught exceptions globally and shut down gracefully
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  updateChangelog('ERROR', 'Uncaught Exception: ' + (error && error.message ? error.message : error));
  // Gracefully shut down after an uncaught exception
  gracefulShutdown('UNCAUGHT_EXCEPTION', client, require('./services/database'), 1);
});

logger.info('Initializing bot and attempting to log in...');
