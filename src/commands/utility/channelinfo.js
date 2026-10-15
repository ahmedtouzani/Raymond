const { createEmbed } = require('../../utils/embed');
const { escapeMarkdown, PermissionsBitField } = require('discord.js');

// Helper: Format boolean with emoji
function formatBoolean(value, trueEmoji = '<:check:1308126149189304330>', falseEmoji = '<:cross:1308126150664912906>') {
  return value ? trueEmoji : falseEmoji;
}

// Helper: Format channel type
function formatChannelType(type) {
  const types = {
    0: 'Text Channel',
    1: 'DM',
    2: 'Voice Channel',
    3: 'Group DM',
    4: 'Category',
    5: 'News Channel',
    10: 'News Thread',
    11: 'Public Thread',
    12: 'Private Thread',
    13: 'Stage Channel',
    14: 'Directory',
    15: 'Forum Channel',
    16: 'Media Channel'
  };
  return types[type] || 'Unknown';
}

// Helper: Format permissions
function formatPermissions(permissions) {
  return new PermissionsBitField(permissions).toArray()
    .map(perm => `• ${perm.replace(/([A-Z])/g, ' $1').trim()}`)
    .join('\n') || 'None';
}

// Helper function to display channel info
async function showChannelInfo(message, channel) {
  if (!channel) {
    const { createUsageEmbed } = require('../../utils/embed');
    const embed = await createUsageEmbed(message.guild?.id, {
      command: 'channelinfo',
      description: '<a:warningbug:1467300628907954300> **Channel Not Found**\nPlease check the channel name or ID and try again.',
      usage: '`!channelinfo [channel]`',
      examples: '`!channelinfo #general`'
    });
    return message.reply({ embeds: [embed] });
  }

  // Handle DM channels
  if (!channel.guild) {
    const dmEmbed = await createEmbed(null, {
      author: {
        name: 'Channel Info: DM Channel',
        iconURL: 'https://discord.com/assets/1f4acd2c2b9de3c36c6b6c1f07c4c8e0.png'
      },
      fields: [
        {
          name: '<:36548namoonlight:1379103329044402257> > General',
          value: [
            `<:arrow:1463991975610024119> **Type:** DM Channel`,
            `<:id:1308126152174563409> **ID:** \`${channel.id}\``,
            `<:created:1308126152174563409> **Created:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>`
          ].join('\n'),
          inline: true
        }
      ],
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      },
      timestamp: true
    });

    return message.reply({ embeds: [dmEmbed] });
  }

  // Format channel information
  const createdAt = Math.floor(channel.createdTimestamp / 1000);
  const channelAge = Math.floor((Date.now() - channel.createdTimestamp) / (1000 * 60 * 60 * 24));

  // Get channel permissions
  const everyonePerms = channel.permissionOverwrites?.cache.get(channel.guild.id);
  const botPerms = channel.permissionOverwrites?.cache.get(channel.guild.me?.id);

  // Build basic info
  const basicInfo = [
    `<:arrow:1463991975610024119> **Name:** ${escapeMarkdown(channel.name)}`,
    `<:arrow:1463991975610024119> **ID:** \`${channel.id}\``,
    `<:arrow:1463991975610024119> **Type:** ${formatChannelType(channel.type)}`,
    channel.topic ? `<:edit:1308126154163482665> **Topic:** ${channel.topic.length > 100 ? `${channel.topic.substring(0, 97)}...` : channel.topic}` : ''
  ].filter(Boolean);

  // Build additional info
  const additionalInfo = [
    `<:black_planet:1310547406697533492> **Created:** <t:${createdAt}:D> (${channelAge} days ago)`,
    channel.parent ? `<:category:1308126155942006784> **Category:** ${channel.parent.name}` : '',
    channel.rateLimitPerUser ? `⏱️ **Slowmode:** ${channel.rateLimitPerUser}s` : '',
    channel.nsfw ? '🔞 **NSFW:** Yes' : '',
    channel.userLimit ? `👥 **User Limit:** ${channel.userLimit} users` : '',
    channel.bitrate ? `🔊 **Bitrate:** ${channel.bitrate / 1000}kbps` : '',
    channel.rtcRegion ? `🌍 **Region:** ${channel.rtcRegion === 'auto' ? 'Auto' : channel.rtcRegion}` : ''
  ].filter(Boolean);

  // Build channel-specific info
  const channelSpecificInfo = [];

  // Thread-specific info
  if (channel.isThread()) {
    channelSpecificInfo.push(
      `🧵 **Thread Type:** ${channel.type === 'GUILD_PUBLIC_THREAD' ? 'Public' : 'Private'} Thread`,
      `📅 **Auto-Archive:** ${channel.autoArchiveDuration ? `${channel.autoArchiveDuration} mins` : 'Not set'}`,
      `👥 **Members:** ${channel.memberCount?.toLocaleString() || 'Unknown'}`,
      `🔒 **Locked:** ${channel.locked ? 'Yes' : 'No'}`,
      `🏷️ **Archived:** ${channel.archived ? 'Yes' : 'No'}`
    );
  }

  // Forum channel specific info
  if (channel.isThreadOnly?.() || channel.type === 'GUILD_FORUM') {
    channelSpecificInfo.push(
      `📝 **Default Auto-Archive:** ${channel.defaultAutoArchiveDuration ? `${channel.defaultAutoArchiveDuration} mins` : 'Not set'}`,
      `⏱️ **Default Slowmode:** ${channel.defaultThreadRateLimitPerUser || 0}s`,
      `🔖 **Available Tags:** ${channel.availableTags?.length || 0}`
    );

    if (channel.defaultReactionEmoji) {
      const emoji = channel.defaultReactionEmoji.id ?
        `<:${channel.defaultReactionEmoji.name}:${channel.defaultReactionEmoji.id}>` :
        channel.defaultReactionEmoji.name;
      channelSpecificInfo.push(`👍 **Default Reaction:** ${emoji}`);
    }

    if (channel.defaultSortOrder) {
      const sortOrders = {
        LATEST_ACTIVITY: 'Latest Activity',
        CREATION_DATE: 'Creation Date'
      };
      channelSpecificInfo.push(`🔢 **Default Sort:** ${sortOrders[channel.defaultSortOrder] || channel.defaultSortOrder}`);
    }
  }

  // Voice channel specific info
  if (channel.isVoiceBased?.()) {
    channelSpecificInfo.push(
      `🔊 **Bitrate:** ${channel.bitrate / 1000}kbps`,
      `👥 **User Limit:** ${channel.userLimit || 'No limit'}`,
      `🎙️ **RTC Region:** ${channel.rtcRegion || 'Automatic'}`
    );
  }

  // Get member count with view channel permission
  let memberCount = 'Calculating...';
  try {
    const members = await channel.guild.members.fetch();
    const canView = members.filter(m => channel.permissionsFor(m).has('ViewChannel'));
    memberCount = canView.size.toLocaleString();
  } catch (e) {
    memberCount = 'Unknown';
  }

  // Build permissions info
  const permissionsInfo = [];
  if (everyonePerms) {
    const allowed = everyonePerms.allow.bitfield ? formatPermissions(everyonePerms.allow.bitfield) : 'None';
    const denied = everyonePerms.deny.bitfield ? formatPermissions(everyonePerms.deny.bitfield) : 'None';

    if (allowed !== 'None' || denied !== 'None') {
      permissionsInfo.push(
        '**@everyone Permissions:**',
        `<:Done:1305644486453493801> Allowed: ${allowed.split('\n').length}`,
        ` Denied: ${denied.split('\n').length}`,
        ''
      );
    }
  }

  if (botPerms) {
    const allowed = botPerms.allow.bitfield ? formatPermissions(botPerms.allow.bitfield) : 'None';
    const denied = botPerms.deny.bitfield ? formatPermissions(botPerms.deny.bitfield) : 'None';

    if (allowed !== 'None' || denied !== 'None') {
      permissionsInfo.push(
        '**Bot Permissions:**',
        `<:Done:1305644486453493801> Allowed: ${allowed.split('\n').length}`,
        ` Denied: ${denied.split('\n').length}`
      );
    }
  }

  // Create embed
  const embed = await createEmbed(channel.guild.id, {
    author: {
      name: `Channel Info: #${channel.name}`,
      iconURL: channel.guild.iconURL({ dynamic: true })
    },
    fields: [
      {
        name: '<:36548namoonlight:1379103329044402257> > General',
        value: [
          ...basicInfo,
          `👥 **Members with Access:** ${memberCount}`
        ].join('\n'),
        inline: true
      },
      {
        name: '<a:utiliti:1466829554055381055> > Details',
        value: additionalInfo.join('\n') || 'No additional information',
        inline: true
      }
    ],
    footer: {
      text: `Requested by ${message.author.tag} • ID: ${channel.id}`,
      iconURL: message.author.displayAvatarURL({ dynamic: true })
    },
    timestamp: true
  });

  // Add channel-specific info if available
  if (channelSpecificInfo.length > 0) {
    embed.addFields({
      name: '📋 Channel Specific',
      value: channelSpecificInfo.join('\n'),
      inline: false
    });
  }

  // Add permissions field if there are any
  if (permissionsInfo.length > 0) {
    embed.addFields({
      name: '<:4298eventer:1379103215857045637> > Permissions',
      value: permissionsInfo.join('\n'),
      inline: false
    });
  }

  return message.reply({ embeds: [embed] });
}

module.exports = {
  name: 'channelinfo',
  aliases: ['ci', 'channel', 'cinfo'],
  description: 'Shows detailed information about a channel.',
  usage: '!channelinfo [channel]',
  category: 'Utility',
  cooldown: 3,
  prefixless: true,

  async execute(message, args) {
    // If no arguments, use current channel
    if (!args[0] && !message.mentions.channels.first()) {
      return showChannelInfo(message, message.channel);
    }

    // Try to find channel by mention
    if (message.mentions.channels.first()) {
      return showChannelInfo(message, message.mentions.channels.first());
    }

    // Try to find channel by ID
    const channelById = message.guild.channels.cache.get(args[0]);
    if (channelById) {
      return showChannelInfo(message, channelById);
    }

    // Try to find channel by name
    const searchTerm = args.join(' ').toLowerCase();
    const channelByName = message.guild.channels.cache.find(
      c => c.name.toLowerCase().includes(searchTerm)
    );

    if (channelByName) {
      return showChannelInfo(message, channelByName);
    }

    // If no channel found
    const { createUsageEmbed } = require('../../utils/embed');
    const embed = await createUsageEmbed(message.guild.id, {
      command: 'channelinfo',
      description: '<a:warningbug:1467300628907954300> **Channel Not Found**\nPlease check the channel name or ID and try again.',
      usage: '`!channelinfo [channel]`',
      examples: '`!channelinfo #general`'
    });
    return message.reply({ embeds: [embed] });
  }
};