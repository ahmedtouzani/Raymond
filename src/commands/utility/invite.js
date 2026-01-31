const { createEmbed } = require('../../utils/embed');
const { PermissionsBitField } = require('discord.js');

// Required permissions for the bot
const REQUIRED_PERMISSIONS = [
  'View Channels',
  'Send Messages',
  'Embed Links',
  'Read Message History',
  'Use External Emojis',
  'Add Reactions',
  'Manage Messages',
  'Moderate Members',
  'Kick Members',
  'Ban Members'
];

// Calculate permissions integer
const PERMISSIONS_INTEGER = new PermissionsBitField()
  .add([
    'ViewChannel',
    'SendMessages',
    'EmbedLinks',
    'ReadMessageHistory',
    'UseExternalEmojis',
    'AddReactions',
    'ManageMessages',
    'ModerateMembers',
    'KickMembers',
    'BanMembers'
  ])
  .bitfield;

module.exports = {
  name: 'invite',
  aliases: ['inv', 'botinvite'],
  description: 'Get the bot\'s invite link to add it to your server',
  category: 'Utility',
  cooldown: 5,
  prefixless: true,

  async execute(message, args, client) {
    // Create the invite link
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=${PERMISSIONS_INTEGER}&scope=bot%20applications.commands`;

    // Create the embed
    const embed = await createEmbed(message.guild?.id, {
      title: '<:kicklink:1308126128078065684> Invite Parallel Universe Extra',
      description: `Thank you for wanting to add **${client.user.username}** to your server!\n\n` +
        'Click the button below to invite the bot with the recommended permissions.'
          .trim(),
      fields: [
        {
          name: '<:manager2:1466828942177734820> > Required Permissions',
          value: REQUIRED_PERMISSIONS.length > 0
            ? REQUIRED_PERMISSIONS.map(perm => `• ${perm}`).join('\n').split('\n').map(p => `<:arrow:1463991975610024119> ${p.replace('•', '')}`).join('\n')
            : 'None',
          inline: true
        },
        {
          name: '<:manager2:1466828942177734820> > Quick Links',
          value: `[Invite Bot](${inviteLink}) | [Support Server](https://discord.gg/TBUakyRNSQ)`,
          inline: false
        }
      ],
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true, format: 'png' })
      },
      timestamp: true,
      color: message.guild?.members.me?.displayColor || 0x5865F2
    });

    // Add the bot's avatar as thumbnail
    embed.setThumbnail(client.user.displayAvatarURL({ size: 256, format: 'png' }));

    // Send the message with a button
    return message.reply({
      content: `\n> **[Click here to invite ${client.user.username} to your server](${inviteLink})**`,
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
};
