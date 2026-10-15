// THIS COMMANDS IS FOR BLACKLIST SERVER
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getGuildConfig, setGuildConfig } = require('../../database/guildConfig');

const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'autoban',
  description: 'Automod: Manage blacklist of server invite links for autoban (per guild config).',
  usage: '!autoban set <invite> | !autoban remove <invite> | !autoban list | !autoban log #channel/id',
  permissions: ['ADMINISTRATOR'],
  cooldown: 5,

  async execute(message, args) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Administrator** permission to use this command.',
        color: 0x23272A,
      });
    }
    const sub = args[0]?.toLowerCase();
    const config = await getGuildConfig(message.guild.id) || { settings: {} };
    config.settings.autobanBlacklist = config.settings.autobanBlacklist || [];

    if (sub === 'set' && args[1]) {
      const invite = args[1].trim();
      let inviteCode = invite.match(/discord\.(gg|com\/invite)\/(\w+)/i);
      inviteCode = inviteCode ? inviteCode[2] : invite;
      try {
        const fetched = await message.client.fetchInvite(inviteCode);
        const targetGuild = fetched.guild;
        if (!targetGuild) {
          const { createUsageEmbed } = require('../../utils/embed');
          const embed = await createUsageEmbed(message.guild.id, {
            command: 'autoban set',
            description: '<a:warningbug:1467300628907954300> **Invalid Invite**\nCould not resolve a target server for this invite.',
            usage: '`!autoban set <invite>`',
            examples: '`!autoban set discord.gg/invite`'
          });
          return message.reply({ embeds: [embed] });
        }
        config.settings.autobanBlacklist = config.settings.autobanBlacklist.filter(e => e && e.guildId);
        if (config.settings.autobanBlacklist.some(e => e.guildId === targetGuild.id)) {
          return sendEmbed(message, {
            title: 'Already Blacklisted',
            description: `Server **${targetGuild.name}** is already blacklisted.`,
            color: 0x23272A,
          });
        }
        config.settings.autobanBlacklist.push({ guildId: targetGuild.id, name: targetGuild.name });
        await setGuildConfig(message.guild.id, config);
        return sendEmbed(message, {
          title: '<:Done:1305644486453493801> Blacklist Updated',
          description: `Added **${targetGuild.name}** to the autoban blacklist.`,
          color: 0x23272A,
        });
      } catch (e) {
        const { createUsageEmbed } = require('../../utils/embed');
        const embed = await createUsageEmbed(message.guild.id, {
          command: 'autoban set',
          description: '<a:warningbug:1467300628907954300> **Invalid Invite**\nCould not resolve this invite. Make sure it is a valid, non-expired invite.',
          usage: '`!autoban set <invite>`',
          examples: '`!autoban set discord.gg/invite`'
        });
        return message.reply({ embeds: [embed] });
      }
    }
    if (sub === 'remove' && args[1]) {
      const target = args.slice(1).join(' ').trim();

      // Get fresh config from database
      const currentConfig = await getGuildConfig(message.guild.id) || { settings: {} };
      currentConfig.settings.autobanBlacklist = (currentConfig.settings.autobanBlacklist || []).filter(e => e && e.guildId);

      // Try to find by ID first, then by name (case insensitive)
      const index = currentConfig.settings.autobanBlacklist.findIndex(entry => {
        if (!entry) return false;
        // Check if target matches the stored ID (exact match)
        if (entry.guildId === target) return true;
        // Check if target matches the stored name (case insensitive)
        if (entry.name && entry.name.toLowerCase() === target.toLowerCase()) return true;
        return false;
      });

      if (index === -1) {
        const { createUsageEmbed } = require('../../utils/embed');
        const embed = await createUsageEmbed(message.guild.id, {
          command: 'autoban remove',
          description: '<a:warningbug:1467300628907954300> **Not Found**\nThis server is not in the blacklist.',
          usage: '`!autoban remove <serverID|name>`',
          examples: '`!autoban remove 123456789012345678`'
        });
        return message.reply({ embeds: [embed] });
      }

      const removed = currentConfig.settings.autobanBlacklist.splice(index, 1)[0];

      try {
        await setGuildConfig(message.guild.id, currentConfig);
        // Update local config to match
        config.settings.autobanBlacklist = [...currentConfig.settings.autobanBlacklist];

        return sendEmbed(message, {
          title: '<:Done:1305644486453493801> Blacklist Updated',
          description: `Removed **${removed.name || `Server (${removed.guildId})`}** from the autoban blacklist.`,
          color: 0x23272A,
        });
      } catch (error) {
        console.error('Failed to update database:', error);
        return sendEmbed(message, {
          title: ' Database Error',
          description: 'Failed to update the blacklist in the database. Please try again.',
          color: 0x23272A,
        });
      }
    }
    if (sub === 'list') {
      const list = config.settings.autobanBlacklist.filter(e => e && e.guildId);
      const spamStatus = config.settings.spamDetectionEnabled === false ? ' Disabled' : '<:Done:1305644486453493801> Enabled';
      return sendEmbed(message, {
        title: 'Autoban Blacklist',
        description: (list.length ? list.map(i => `• ${i.name || i.guildId} (${i.guildId})`).join('\n') : 'No servers blacklisted.') + `\n\n**Spam Detection:** ${spamStatus}`,
        color: 0x23272A,
      });
    }
    // Set log channel: !autoban log <#channel/id>
    if (sub === 'log') {
      if (args[1]) {
        let logChannel = message.mentions.channels.first();
        if (!logChannel) {
          const channelId = args[1].replace(/[<#>]/g, '');
          logChannel = message.guild.channels.cache.get(channelId);
        }
        if (!logChannel) {
          const { createUsageEmbed } = require('../../utils/embed');
          const embed = await createUsageEmbed(message.guild.id, {
            command: 'autoban log',
            description: '<a:warningbug:1467300628907954300> **Channel Not Found**\nPlease mention a valid channel or provide a valid channel ID.',
            usage: '`!autoban log <#channel/id>`',
            examples: '`!autoban log #autoban-logs`'
          });
          return message.reply({ embeds: [embed] });
        }
        config.settings.autobanLogChannel = logChannel.id;
        await setGuildConfig(message.guild.id, config);
        return sendEmbed(message, {
          title: '<:Done:1305644486453493801> Log Channel Set',
          description: `Autoban log channel set to ${logChannel}.`,
          color: 0x23272A,
        });
      } else {
        const logChannelId = config.settings.autobanLogChannel;
        const logChannel = logChannelId ? message.guild.channels.cache.get(logChannelId) : null;
        return sendEmbed(message, {
          title: 'Autoban Log Channel',
          description: logChannel ? `Current log channel: ${logChannel}` : 'No log channel set. Use `!autoban log <#channel/id>` to set.',
          color: 0x23272A,
        });
      }
    }
    // Check if a server is blacklisted
    if (sub === 'check' && args[1]) {
      const target = args.slice(1).join(' ').trim();
      const currentConfig = await getGuildConfig(message.guild.id) || { settings: {} };
      const blacklist = (currentConfig.settings.autobanBlacklist || []).filter(e => e && e.guildId);

      // Check if the target is in the blacklist
      const isBlacklisted = blacklist.some(entry => {
        if (!entry) return false;
        return entry.guildId === target ||
          (entry.name && entry.name.toLowerCase() === target.toLowerCase());
      });

      if (isBlacklisted) {
        const entry = blacklist.find(e =>
          e.guildId === target ||
          (e.name && e.name.toLowerCase() === target.toLowerCase())
        );
        return sendEmbed(message, {
          title: '🔴 Server Blacklisted',
          description: `**${entry.name || `Server (${entry.guildId})`}** is in the blacklist.`,
          color: 0x23272A,
        });
      } else {
        return sendEmbed(message, {
          title: '<a:online:1306260975359496253> Server Not Blacklisted',
          description: `The server is not in the blacklist.`,
          color: 0x23272A,
        });
      }
    }

    return sendEmbed(message, {
      title: 'Autoban Blacklist Help',
      description: 'Add: `!autoban set <invite>` (by invite link/code; the server will be resolved and blacklisted)\n' +
        'Remove: `!autoban remove <server id|name>`\n' +
        'Check: `!autoban check <server id|name>`\n' +
        'List: `!autoban list`\n' +
        'Log: `!autoban log <#channel/id>`\n' +
        'Spam: `!autoban spam <on|off>` (toggle spam detection for this server)',
      color: 0x23272A,
    });
  },
};
