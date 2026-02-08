const { Events, ActivityType, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { registerSlashCommands } = require('../handlers/slashCommandHandler');
const { initializeGuildConfigs, getGuildConfig, setGuildConfig } = require('../database/guildConfig'); // CORRECTED
const { getAllTempChannels, removeTempChannel } = require('../database/tempVoice');
const inviteTracker = require('../services/inviteTracker');
const devServerConfig = require('../config/dev-server');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`Ready! Logged in as ${client.user.tag}`);
    logger.info(`Bot is now online and ready to serve in ${client.guilds.cache.size} guilds.`);

    // v4.0 Rotating Status Messages
    const statusMessages = [
      { name: 'v4.0 - The Intelligence Update', type: ActivityType.Playing },
      { name: 'conversations with Memory Agent 🧠', type: ActivityType.Watching },
      { name: 'your server | !help', type: ActivityType.Listening },
      { name: 'Zero Rate Limits ✨', type: ActivityType.Competing }
    ];

    let currentStatus = 0;
    const rotateStatus = () => {
      client.user.setPresence({
        activities: [statusMessages[currentStatus]],
        status: 'online',
      });
      currentStatus = (currentStatus + 1) % statusMessages.length;
    };

    // Set initial status
    rotateStatus();

    // Rotate every 30 seconds
    setInterval(rotateStatus, 30000);

    try {
      await registerSlashCommands(client);
      await initializeGuildConfigs(client);
      await cleanupOrphanedChannels(client);
      await cacheAllInvites(client);
      await updateDevServerStatus(client);
    } catch (error) {
      logger.error('Error during ready event execution:', error);
    }
  },
};

/**
 * Cache invites for all guilds to enable invite tracking
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function cacheAllInvites(client) {
  try {
    logger.info('Caching invites for all guilds...');
    let cachedCount = 0;
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await inviteTracker.cacheGuildInvites(guild);
        cachedCount++;
      } catch (error) {
        logger.error(`Failed to cache invites for guild ${guild.name}:`, error);
      }
    }
    logger.info(`Successfully cached invites for ${cachedCount}/${client.guilds.cache.size} guilds`);
  } catch (error) {
    logger.error('Error caching invites:', error);
  }
}

/**
 * Finds and deletes any temporary voice channels that were not cleaned up
 * during a previous session (e.g., due to a crash).
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function cleanupOrphanedChannels(client) {
  try {
    const tempChannels = await getAllTempChannels();
    if (tempChannels.length > 0) {
      logger.info(`Found ${tempChannels.length} orphaned temp channels. Cleaning up...`);
      for (const tempChannel of tempChannels) {
        try {
          const channel = await client.channels.fetch(tempChannel.channelId);
          if (channel && channel.members.size === 0) {
            await channel.delete('Cleaning up orphaned temp channel on startup.');
          }
        } catch (error) {
          if (error.code !== 10003) { // 10003 = Unknown Channel
            logger.error(`Error fetching orphaned temp channel ${tempChannel.channelId}:`, error);
          }
        }
        await removeTempChannel(tempChannel.channelId);
      }
      logger.info('Orphaned temp channel cleanup complete.');
    }
  } catch (err) {
    logger.error('Failed to run orphaned temp channel cleanup:', err);
  }
}

/**
 * Updates or creates the persistent status message in the development server.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function updateDevServerStatus(client) {
  if (!devServerConfig.guildId || !devServerConfig.channels.status) {
    logger.warn('Dev server Guild ID or Status Channel ID is not configured. Skipping status update.');
    return;
  }

  try {
    const guild = await client.guilds.fetch(devServerConfig.guildId).catch(() => null);
    if (!guild) return logger.warn(`Could not find the dev server with ID: ${devServerConfig.guildId}`);

    const statusChannel = await guild.channels.fetch(devServerConfig.channels.status).catch(() => null);
    if (!statusChannel) return logger.warn(`Could not find the status channel with ID: ${devServerConfig.channels.status}`);

    const guildConfig = await getGuildConfig(devServerConfig.guildId);
    const embedSettings = guildConfig?.settings?.embed_settings || {};
    const statusMessageId = guildConfig?.settings?.dev_status_message_id;

    const statusEmbed = new EmbedBuilder()
      .setColor(embedSettings.online_color || '#57F287')
      .setTitle('<a:online:1306260975359496253> System Status: Online')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: 'Servers', value: `\`${client.guilds.cache.size}\``, inline: true },
        { name: 'API Latency', value: `\`${client.ws.ping}ms\``, inline: true },
        { name: 'Session Start', value: `<t:${Math.floor(client.readyAt / 1000)}:R>`, inline: true }
      )
      .setTimestamp()
      .setFooter({
        text: embedSettings.footer_text || 'ParalelBot Live Status',
        iconURL: embedSettings.footer_icon_url || client.user.displayAvatarURL(),
      });

    if (statusMessageId) {
      try {
        const oldMessage = await statusChannel.messages.fetch(statusMessageId).catch(() => null);
        if (oldMessage) {
          if (oldMessage.author.id === client.user.id) {
            await oldMessage.edit({ embeds: [statusEmbed] });
            logger.info('Successfully updated dev server status message.');
            return;
          } else {
            // Message exists but not ours (e.g. from previous bot instance/token)
            // Try to delete it (might fail if no perms) or just ignore and send new one
            await oldMessage.delete().catch(() => { });
          }
        }
      } catch (err) {
        // If error is 50005 (Cannot edit), 10008 (Unknown Message), or 404, we just carry on to send a new one
        logger.warn(`Could not edit existing status message, sending a new one. Reason: ${err.message}`);
      }
    }

    const newMessage = await statusChannel.send({ embeds: [statusEmbed] });
    // Update config with new message ID
    await setGuildConfig(devServerConfig.guildId, { settings: { dev_status_message_id: newMessage.id } });
    logger.info(`Posted new dev server status message and saved its ID: ${newMessage.id}`);

  } catch (error) {
    logger.error('Failed to update dev server status:', error);
  }
}