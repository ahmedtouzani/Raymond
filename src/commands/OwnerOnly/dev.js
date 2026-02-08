const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const devServerConfig = require('../../config/dev-server');
const logger = require('../../utils/logger');

module.exports = {
  name: 'dev',
  description: 'Manages announcements and updates for the development server.',
  usage: '!dev <announce|update>',
  category: 'OwnerOnly',
  ownerOnly: true,

  async execute(message, args) {
    const subCommand = args[0]?.toLowerCase();
    const content = args.slice(1).join(' ');

    if (!devServerConfig.guildId) {
      return sendEmbed(message, { title: 'Error', description: 'Development server ID is not configured.', type: 'error' }, { ephemeral: true });
    }

    const guild = await message.client.guilds.fetch(devServerConfig.guildId).catch(() => null);
    if (!guild) {
      return sendEmbed(message, { title: 'Error', description: 'Could not find the configured development server.', type: 'error' }, { ephemeral: true });
    }

    const guildConfig = await getGuildConfig(devServerConfig.guildId);
    const embedSettings = guildConfig?.settings?.embed_settings || {};

    switch (subCommand) {
      case 'announce': {
        if (!content) {
          const { createUsageEmbed } = require('../../utils/embed');
          const embed = await createUsageEmbed(message.guild.id, {
            command: 'dev announce',
            description: '<a:warningbug:905560995886411806> **Missing Content**\nPlease provide a message to announce.',
            usage: '`!dev announce <message>`',
            examples: '`!dev announce Update coming soon!`'
          });
          return message.reply({ embeds: [embed] });
        }

        const announceChannel = await guild.channels.fetch(devServerConfig.channels.announcements).catch(() => null);
        if (!announceChannel) {
          return sendEmbed(message, { title: 'Error', description: 'Announcements channel not found or configured correctly.', type: 'error' }, { ephemeral: true });
        }

        const announceEmbed = new EmbedBuilder()
          .setColor(embedSettings.announce_color || '#3498DB')
          .setTitle('📢 New Announcement')
          .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
          .setDescription(content)
          .setThumbnail(message.client.user.displayAvatarURL())
          .setTimestamp()
          .setFooter({
            text: embedSettings.footer_text || guild.name,
            iconURL: embedSettings.footer_icon_url || guild.iconURL(),
          });

        try {
          await announceChannel.send({ embeds: [announceEmbed] });
          return sendEmbed(message, { title: 'Success', description: 'Announcement has been posted successfully.', type: 'success' });
        } catch (error) {
          logger.error('Failed to send announcement:', error);
          return sendEmbed(message, { title: 'Error', description: 'An error occurred while trying to post the announcement.', type: 'error' }, { ephemeral: true });
        }
      }

      case 'update': {
        const version = args[1];
        const description = args.slice(2).join(' ');

        if (!version || !description) {
          const { createUsageEmbed } = require('../../utils/embed');
          const embed = await createUsageEmbed(message.guild.id, {
            command: 'dev update',
            description: '<a:warningbug:905560995886411806> **Missing Arguments**\nPlease provide a version and description.',
            usage: '`!dev update <version> <description>`',
            examples: '`!dev update v2.0.0 Major rewrite`'
          });
          return message.reply({ embeds: [embed] });
        }

        const updateChannel = await guild.channels.fetch(devServerConfig.channels.updates).catch(() => null);
        if (!updateChannel) {
          return sendEmbed(message, { title: 'Error', description: 'Updates channel not found or configured correctly.', type: 'error' }, { ephemeral: true });
        }

        const updateEmbed = new EmbedBuilder()
          .setColor(embedSettings.update_color || '#2ECC71')
          .setTitle('⬆️ Bot Update')
          .setAuthor({ name: `Updated by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
          .addFields(
            { name: 'Version', value: `\`${version}\``, inline: true },
            { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
            { name: 'Changes', value: description }
          )
          .setThumbnail(message.client.user.displayAvatarURL())
          .setFooter({
            text: embedSettings.footer_text || guild.name,
            iconURL: embedSettings.footer_icon_url || guild.iconURL(),
          });

        try {
          await updateChannel.send({ embeds: [updateEmbed] });
          return sendEmbed(message, { title: 'Success', description: 'Update log has been posted successfully.', type: 'success' });
        } catch (error) {
          logger.error('Failed to send update log:', error);
          return sendEmbed(message, { title: 'Error', description: 'An error occurred while trying to post the update log.', type: 'error' }, { ephemeral: true });
        }
      }

      case 'pool': {
        // Check API pool health
        const apiKeyManager = require('../../services/apiKeyManager');
        const health = apiKeyManager.getPoolHealth();

        const poolEmbed = new EmbedBuilder()
          .setColor(embedSettings.default_color || '#3498DB')
          .setTitle('🔑 API Pool Health')
          .setDescription('Current status of API key pools')
          .addFields(
            {
              name: '🟢 Groq Pool',
              value: `**Total:** ${health.groq.total}\n**Available:** ${health.groq.available}\n**Failed:** ${health.groq.failed}`,
              inline: true
            },
            {
              name: '🔵 Gemini Pool',
              value: `**Total:** ${health.gemini.total}\n**Available:** ${health.gemini.available}\n**Failed:** ${health.gemini.failed}`,
              inline: true
            }
          )
          .setTimestamp()
          .setFooter({
            text: embedSettings.footer_text || message.guild.name,
            iconURL: embedSettings.footer_icon_url || message.guild.iconURL(),
          });

        return message.reply({ embeds: [poolEmbed] });
      }

      case 'stats': {
        // Memory Agent statistics
        const memoryAgent = require('../../services/memoryAgent');
        const stats = memoryAgent.getStats();

        const statsEmbed = new EmbedBuilder()
          .setColor(embedSettings.default_color || '#9B59B6')
          .setTitle('🧠 Memory Agent Statistics')
          .setDescription('Current Memory Agent status and metrics')
          .addFields(
            { name: 'Status', value: stats.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Processing', value: stats.isProcessing ? '🔄 Active' : '⏸️ Idle', inline: true },
            { name: 'Queue Size', value: `${stats.queueSize} conversations`, inline: true },
            { name: 'Gemini Keys', value: `${stats.geminiKeys} keys`, inline: true },
            { name: 'Batch Interval', value: `${stats.batchInterval}ms`, inline: true },
            { name: 'Message Threshold', value: `${stats.messageThreshold} messages`, inline: true }
          )
          .setTimestamp()
          .setFooter({
            text: embedSettings.footer_text || message.guild.name,
            iconURL: embedSettings.footer_icon_url || message.guild.iconURL(),
          });

        return message.reply({ embeds: [statsEmbed] });
      }

      case 'queue': {
        // View processing queue
        const memoryAgent = require('../../services/memoryAgent');
        const stats = memoryAgent.getStats();

        const queueEmbed = new EmbedBuilder()
          .setColor(embedSettings.default_color || '#E67E22')
          .setTitle('📋 Memory Agent Queue')
          .setDescription(stats.queueSize > 0
            ? `**${stats.queueSize}** conversation(s) waiting to be processed`
            : 'Queue is empty ✅')
          .addFields(
            { name: 'Processing Status', value: stats.isProcessing ? '🔄 Currently processing' : '⏸️ Idle', inline: true },
            { name: 'Batch Interval', value: `${stats.batchInterval / 1000}s`, inline: true },
            { name: 'Message Threshold', value: `${stats.messageThreshold} msgs`, inline: true }
          )
          .setTimestamp()
          .setFooter({
            text: embedSettings.footer_text || message.guild.name,
            iconURL: embedSettings.footer_icon_url || message.guild.iconURL(),
          });

        return message.reply({ embeds: [queueEmbed] });
      }

      case 'status': {
        return sendEmbed(message, { title: 'Deprecated', description: 'This subcommand is deprecated. The bot\'s status is now updated automatically on startup.', type: 'error' }, { ephemeral: true });
      }

      default: {
        const helpEmbed = new EmbedBuilder()
          .setColor(embedSettings.default_color || '#95A5A6')
          .setTitle('ℹ️ Development Command Help')
          .setDescription('Use the subcommands below to manage development server and monitor v4.0 features.')
          .setThumbnail(message.client.user.displayAvatarURL())
          .addFields(
            { name: '📢 Announcements & Updates', value: '━━━━━━━━━━━━━━━━━━━', inline: false },
            { name: '`!dev announce <message>`', value: 'Posts a rich announcement embed to the designated channel.' },
            { name: '`!dev update <version> <description>`', value: 'Posts a structured update log with version and changes.' },
            { name: '\n🔧 v4.0 Monitoring', value: '━━━━━━━━━━━━━━━━━━━', inline: false },
            { name: '`!dev pool`', value: 'Check API pool health (Groq & Gemini)' },
            { name: '`!dev stats`', value: 'Memory Agent statistics' },
            { name: '`!dev queue`', value: 'View Memory Agent processing queue' }
          )
          .setTimestamp()
          .setFooter({
            text: embedSettings.footer_text || `Requested by ${message.author.username}`,
            iconURL: embedSettings.footer_icon_url || guild.iconURL(),
          });

        return message.reply({ embeds: [helpEmbed] });
      }
    }
  },
};
