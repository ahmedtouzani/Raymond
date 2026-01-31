const { createEmbed } = require('../../utils/embed');
const { ChannelType, GuildVerificationLevel, GuildExplicitContentFilter, GuildNSFWLevel } = require('discord.js');

module.exports = {
  name: 'serverinfo',
  aliases: ['si', 'server', 'guildinfo'],
  description: 'Displays detailed information about the server.',
  usage: '=serverinfo',
  category: 'Utility',
  cooldown: 5,
  prefixless: true,

  async execute(message, args, client) {
    const guild = message.guild;
    if (!guild) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(null, {
        command: 'serverinfo',
        description: '<a:warningbug:905560995886411806> **DM Not Supported**\nThis command can only be used in a server.',
        usage: '`!serverinfo`',
        examples: '`!serverinfo`'
      });
      return message.reply({ embeds: [embed] });
    }

    // Fetch guild members to get accurate counts (especially for presence)
    await guild.members.fetch();

    const owner = await guild.fetchOwner();
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    // Member stats
    const totalMembers = guild.memberCount;
    const humanMembers = guild.members.cache.filter(member => !member.user.bot).size;
    const botMembers = guild.members.cache.filter(member => member.user.bot).size;
    const onlineMembers = guild.members.cache.filter(member => member.presence?.status === 'online').size;

    // Channel stats
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categoryChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
    const stageChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice).size;
    const forumChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildForum).size;
    const threadChannels = guild.channels.cache.filter(c => c.isThread()).size;

    // Verification level mapping
    const verificationLevels = {
      [GuildVerificationLevel.None]: 'None',
      [GuildVerificationLevel.Low]: 'Low',
      [GuildVerificationLevel.Medium]: 'Medium',
      [GuildVerificationLevel.High]: 'High (╯°□°）╯︵ ┻━┻',
      [GuildVerificationLevel.VeryHigh]: 'Very High (┻━┻ミヽ(ಠ益ಠ)ノ┻━┻)',
    };

    // Explicit Content Filter mapping
    const explicitFilterLevels = {
      [GuildExplicitContentFilter.Disabled]: 'Disabled',
      [GuildExplicitContentFilter.MembersWithoutRoles]: 'Members Without Roles',
      [GuildExplicitContentFilter.AllMembers]: 'All Members',
    };

    // NSFW Level mapping
    const nsfwLevels = {
      [GuildNSFWLevel.Default]: 'Default',
      [GuildNSFWLevel.Explicit]: 'Explicit',
      [GuildNSFWLevel.Safe]: 'Safe',
      [GuildNSFWLevel.AgeRestricted]: 'Age Restricted',
    };

    const embed = await createEmbed(guild.id, {
      title: `<:36548namoonlight:1379103329044402257> Server Info: ${guild.name}`,
      description: 'Here\'s a detailed overview of this server.',
      fields: [
        {
          name: '<a:endlessspinne:1463992178010230906> General',
          value: [
            `<:arrow:1463991975610024119> **ID:** \`${guild.id}\``,
            `<:arrow:1463991975610024119> **Owner:** ${owner.user.tag} (${owner.id})`,
            `<:arrow:1463991975610024119> **Created:** <t:${createdAt}:D> (<t:${createdAt}:R>)`,
            `<:arrow:1463991975610024119> **Verification Level:** ${verificationLevels[guild.verificationLevel] || 'Unknown'}`,
            `<:arrow:1463991975610024119> **Explicit Filter:** ${explicitFilterLevels[guild.explicitContentFilter] || 'Unknown'}`,
            `<:arrow:1463991975610024119> **NSFW Level:** ${nsfwLevels[guild.nsfwLevel] || 'Unknown'}`,
            `<:arrow:1463991975610024119> **Locale:** ${guild.preferredLocale || 'en-US'}`
          ].join('\n'),
          inline: false
        },
        {
          name: '\u200B', // Empty field for spacing
          value: '\u200B',
          inline: false
        },
        {
          name: '<a:utiliti:1466829554055381055> Member Stats',
          value: [
            `<:arrow:1463991975610024119> **Total Members:** ${totalMembers.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Humans:** ${humanMembers.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Bots:** ${botMembers.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Online:** ${onlineMembers.toLocaleString()}`
          ].join('\n'),
          inline: true
        },
        {
          name: '\u200B', // Empty field for spacing
          value: '\u200B',
          inline: true // Keep inline to save space if adjacent to another inline field
        },
        {
          name: '<:4298eventer:1379103215857045637> Channel Stats',
          value: [
            `<:arrow:1463991975610024119> **Text:** ${textChannels.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Voice:** ${voiceChannels.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Categories:** ${categoryChannels.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Stages:** ${stageChannels.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Forums:** ${forumChannels.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Threads:** ${threadChannels.toLocaleString()}`
          ].join('\n'),
          inline: true
        },
        {
          name: '\u200B', // Empty field for spacing
          value: '\u200B',
          inline: false
        },
        {
          name: '<:79914memberroleicom:1379108661367931071> Roles & Emojis',
          value: [
            `<:arrow:1463991975610024119> **Roles:** ${guild.roles.cache.size.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Emojis:** ${guild.emojis.cache.size.toLocaleString()}`,
            `<:arrow:1463991975610024119> **Stickers:** ${guild.stickers.cache.size.toLocaleString()}`
          ].join('\n'),
          inline: true
        },
        {
          name: '\u200B', // Empty field for spacing
          value: '\u200B',
          inline: true
        },
        {
          name: '<:8569booster:1379103272488403115> Boost Status',
          value: [
            `<:arrow:1463991975610024119> **Level:** ${guild.premiumTier}`,
            `<:arrow:1463991975610024119> **Boosts:** ${guild.premiumSubscriptionCount || 0}`
          ].join('\n'),
          inline: true
        }
      ],
      thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
      footer: {
        text: `Requested by ${message.author.tag} | ID: ${guild.id}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      },
      timestamp: true,
      color: 0x5865F2
    });

    return message.reply({ embeds: [embed] });
  },
};
