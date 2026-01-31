const { createEmbed } = require('../../utils/embed');
const { PermissionsBitField, escapeMarkdown } = require('discord.js');

// Helper: Format permissions
function formatPermissions(permissions) {
  return new PermissionsBitField(permissions).toArray()
    .map(perm => `• ${perm.replace(/([A-Z])/g, ' $1').trim()}`)
    .join('\n') || 'None';
}

// Helper: Get user badges
function getUserBadges(user) {
  const badges = [];
  const flags = user.flags?.toArray() || [];

  if (user.bot) badges.push('<:bot:1308126157944197201> Bot');
  if (user.system) badges.push('<:staff:1308126155942006784> System');
  if (user.avatar?.startsWith('a_')) badges.push('<:nitro:1308126153399668776> Nitro');
  if (flags.includes('VerifiedBot')) badges.push('<:verified:1308126154945200138> Verified Bot');
  if (flags.includes('PremiumEarlySupporter')) badges.push('<:early:1308126152174563409> Early Supporter');
  if (flags.includes('HypeSquadOnlineHouse1')) badges.push('<:bravery:1308126150664912906> HypeSquad');
  if (flags.includes('HypeSquadOnlineHouse2')) badges.push('<:brilliance:1308126154163482665> HypeSquad');
  if (flags.includes('HypeSquadOnlineHouse3')) badges.push('<:balance:1308126149189304330> HypeSquad');
  if (flags.includes('HypeSquad')) badges.push('<:hypesquad:1308126159230406696> HypeSquad');
  if (flags.includes('BugHunterLevel1')) badges.push('<:bughunter:1308126147685589002> Bug Hunter');
  if (flags.includes('BugHunterLevel2')) badges.push('<:bughunter_gold:1308126149919707216> Gold Hunter');
  if (flags.includes('Partner')) badges.push('<:partner:1308126156915576883> Partner');
  if (flags.includes('Staff')) badges.push('<:staff:1308126155942006784> Staff');

  return badges.length > 0 ? badges.join(' ') : 'None';
}

// Helper: Get user status
function getStatusEmoji(status) {
  const statuses = {
    online: '<a:online:1306260975359496253>',
    idle: '🌙',
    dnd: '⛔',
    offline: '⚫',
    streaming: '🎮',
  };
  return statuses[status] || '⚫';
}

module.exports = {
  name: 'userinfo',
  aliases: ['u', 'whois', 'user'],
  description: 'Shows detailed information about a user.',
  usage: 'u [user]',
  category: 'Utility',
  cooldown: 3,
  prefixless: true, // Enable prefixless usage for this command
  async execute(message, args) {
    // Fetch member with all intents
    let member;
    const targetId = args[0]?.replace(/[^0-9]/g, '');

    try {
      member = message.mentions.members.first() ||
        (targetId ? await message.guild.members.fetch(targetId).catch(() => null) : null) ||
        message.member;

      if (!member) {
        const { createUsageEmbed } = require('../../utils/embed');
        const embed = await createUsageEmbed(message.guild.id, {
          command: 'userinfo',
          description: '<a:warningbug:905560995886411806> **User Not Found**\nPlease mention a valid user or provide a User ID.',
          usage: '`!userinfo [user]`',
          examples: '`!userinfo @User`'
        });
        return message.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error fetching member:', error);
      member = message.member;
    }

    const user = member.user;
    const now = new Date();

    // --- User Information ---
    const tag = user.discriminator !== '0' ? `#${user.discriminator}` : '';
    const createdAt = Math.floor(user.createdTimestamp / 1000);
    const joinedAt = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const accountAge = Math.floor((now - user.createdAt) / (1000 * 60 * 60 * 24));

    // --- Member Information ---
    const nickname = member.nickname || 'None';
    const boostingSince = member.premiumSince ?
      `<t:${Math.floor(member.premiumSince.getTime() / 1000)}:F>` : 'Not boosting';

    // --- Roles ---
    const roles = member.roles.cache
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r.toString())
      .slice(0, 5); // Limit to 5 roles to avoid embed limits

    const rolesText = roles.length > 0 ?
      `${roles.join(', ')}${member.roles.cache.size - 6 > 0 ? ` (+${member.roles.cache.size - 6} more)` : ''}` :
      'None';

    // --- Permissions ---
    const keyPermissions = formatPermissions(member.permissions.bitfield)
      .split('\n')
      .slice(0, 5) // Limit to 5 key permissions
      .join('\n');

    // --- Activity ---
    let activity = 'None';
    if (member.presence?.activities.length > 0) {
      const act = member.presence.activities[0];
      switch (act.type) {
        case 'PLAYING': activity = `🎮 Playing **${act.name}**`; break;
        case 'STREAMING': activity = `📺 Streaming [${act.name}](${act.url})`; break;
        case 'LISTENING': activity = `🎧 Listening to **${act.details}** by ${act.state}`; break;
        case 'WATCHING': activity = `👀 Watching **${act.name}**`; break;
        case 'CUSTOM': activity = `💭 ${act.state || 'Custom Status'}`; break;
        case 'COMPETING': activity = `🏆 Competing in **${act.name}**`; break;
      }
    }

    // --- Device Status ---
    const deviceStatus = [];
    if (member.presence) {
      const { clientStatus } = member.presence;
      if (clientStatus?.desktop) deviceStatus.push('🖥️ Desktop');
      if (clientStatus?.mobile) deviceStatus.push('📱 Mobile');
      if (clientStatus?.web) deviceStatus.push('🌐 Web');
    }

    // --- Create Embed ---
    const embed = await createEmbed(message.guild.id, {
      author: {
        name: `${user.username}${tag} ${user.bot ? '<:manager:1466826492334833665>' : 'No'}`,
        iconURL: user.displayAvatarURL({ dynamic: true })
      },
      thumbnail: user.displayAvatarURL({ dynamic: true, size: 4096 }),
      fields: [
        {
          name: '<:manager:1466826492334833665> > General',
          value: [
            `<:arrow:1463991975610024119> **Username:** ${escapeMarkdown(user.username)}`,
            `<:arrow:1463991975610024119> **ID:** \`${user.id}\``,
            `<:arrow:1463991975610024119> **Nickname:** ${escapeMarkdown(nickname)}`,
            `<:arrow:1463991975610024119> **Bot:** ${user.bot ? '<:manager:1466826492334833665>' : 'No'}`,
            `<:arrow:1463991975610024119> **Status:** ${getStatusEmoji(member.presence?.status)} ${member.presence?.status || 'offline'}`,
            `<:arrow:1463991975610024119> **Device:** ${deviceStatus.join(' ') || 'Unknown'}`,
            `<:arrow:1463991975610024119> **Badges:** ${getUserBadges(user)}`,
          ].join('\n'),
          inline: true
        },
        {
          name: '<a:utiliti:1466829554055381055> > Dates',
          value: [
            `<:black_planet:1310547406697533492> **Created:** <t:${createdAt}:D> (${accountAge} days ago)`,
            joinedAt ? `<:8569booster:1379103272488403115> **Joined:** <t:${joinedAt}:D> (<t:${joinedAt}:R>)` : '**Joined:** Unknown',
            `<:8569booster:1379103272488403115> **Boosting Since:** ${boostingSince}`
          ].join('\n'),
          inline: true
        },
        {
          name: `<:79914memberroleicom:1379108661367931071> > Roles [${member.roles.cache.size - 1}]`,
          value: rolesText,
          inline: false
        },
        {
          name: '<:4298eventer:1379103215857045637> > Key Permissions',
          value: keyPermissions ? keyPermissions.split('\n').map(p => `<:arrow:1463991975610024119> ${p.replace('•', '')}`).join('\n') : 'None',
          inline: false
        }
      ],
      color: member.displayColor || 0x5865F2,
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      },
      timestamp: true
    });

    // If the user has a banner, add it as the embed's image.
    if (user.bannerURL) {
      embed.setImage(user.bannerURL({ dynamic: true, size: 1024 }));
    }

    return message.reply({ embeds: [embed] });
  },
};