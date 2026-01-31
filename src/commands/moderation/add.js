const { createEmbed } = require('../../utils/embed');
const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');

// Available permissions that can be managed
const PERMISSIONS = {
  // Text Permissions
  'view': 'View Channel',
  'send': 'Send Messages',
  'attach': 'Attach Files',
  'react': 'Add Reactions',
  'history': 'Read Message History',
  'external_emojis': 'Use External Emojis',
  'external_stickers': 'Use External Stickers',

  // Voice Permissions
  'connect': 'Connect',
  'speak': 'Speak',
  'stream': 'Video',
  'use_activities': 'Use Activities',
  'use_soundboard': 'Use Soundboard',
  'use_external_sounds': 'Use External Sounds',
};

// Permission flag mapping
const PERMISSION_FLAGS = {
  'view': PermissionFlagsBits.ViewChannel,
  'send': PermissionFlagsBits.SendMessages,
  'attach': PermissionFlagsBits.AttachFiles,
  'react': PermissionFlagsBits.AddReactions,
  'history': PermissionFlagsBits.ReadMessageHistory,
  'external_emojis': PermissionFlagsBits.UseExternalEmojis,
  'external_stickers': PermissionFlagsBits.UseExternalStickers,
  'connect': PermissionFlagsBits.Connect,
  'speak': PermissionFlagsBits.Speak,
  'stream': PermissionFlagsBits.Stream,
  'use_activities': PermissionFlagsBits.UseEmbeddedActivities,
  'use_soundboard': PermissionFlagsBits.UseSoundboard,
  'use_external_sounds': PermissionFlagsBits.UseExternalSounds,
};

module.exports = {
  name: 'add',
  aliases: ['addpermission', 'permissionadd'],
  description: 'Add a role or user to the channel with specific permissions',
  category: 'Moderation',
  userPermissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 10,
  prefixless: false,

  async execute(message, args, client) {
    const channel = message.mentions.channels.first() || message.channel;
    const target = message.mentions.members?.first() ||
      message.mentions.roles.first() ||
      (args[0] ? (await message.guild.roles.fetch(args[0]).catch(() => null) ||
        await message.guild.members.fetch(args[0]).catch(() => null)) : null);

    // Parse permissions from command arguments
    const permissions = new Set();
    let permissionFlags = 0n;

    // Check for 'all' parameter
    if (args.some(arg => arg.toLowerCase() === 'all')) {
      // Add all available permissions
      Object.keys(PERMISSIONS).forEach(perm => {
        if (PERMISSION_FLAGS[perm]) {
          permissions.add(perm);
          permissionFlags |= PERMISSION_FLAGS[perm];
        }
      });
    } else {
      // Parse individual permission arguments
      for (const arg of args) {
        const perm = arg.toLowerCase();
        if (PERMISSIONS[perm]) {
          permissions.add(perm);
          permissionFlags |= PERMISSION_FLAGS[perm] || 0n;
        }
      }
    }

    // If no permissions specified, grant all available permissions
    if (permissions.size === 0) {
      // Add all available permissions
      Object.keys(PERMISSIONS).forEach(perm => {
        if (PERMISSION_FLAGS[perm]) {
          permissions.add(perm);
          permissionFlags |= PERMISSION_FLAGS[perm];
        }
      });
    }

    // Check if target is valid
    if (!target) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'add',
        description: '<a:warningbug:905560995886411806> **Target Not Found**\nPlease mention a valid user or role to add permissions to.',
        usage: '`!add <@user/@role> [permission] (Optional: all)`',
        examples: '`!add @user send`\n`!add @role view connect`'
      });
      return message.reply({ embeds: [embed] });
    }

    try {
      // Create permission overwrite options
      const permissionOverwrites = {
        ViewChannel: true  // Always allow viewing the channel
      };

      // Add all specified permissions as true
      const permissionBits = new PermissionsBitField(permissionFlags);
      permissionBits.toArray().forEach(perm => {
        permissionOverwrites[perm] = true;
      });

      // Apply the permission overwrites
      await channel.permissionOverwrites.edit(target, permissionOverwrites);

      // Create success embed
      const permissionList = Array.from(permissions)
        .map(perm => `• ${PERMISSIONS[perm]}`)
        .join('\n');

      const embed = await createEmbed(message.guild.id, {
        color: 0x4CAF50,
        title: '<a:okey:1467170671351173121> Permissions Updated',
        description: `Successfully added ${target} to ${channel}`,
        fields: [
          {
            name: '<a:endlessspinne:1463992178010230906> Granted Permissions',
            value: permissionList ? permissionList.split('\n').map(p => `<:arrow:1463991975610024119> ${p.replace('•', '')}`).join('\n') : 'None',
          },
          {
            name: '<a:endlessspinne:1463992178010230906> Target Type',
            value: target.user ? '<:arrow:1463991975610024119> User' : '<:arrow:1463991975610024119> Role',
            inline: true
          }
        ]
      });

      return message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error updating channel permissions:', error);
      const embed = await createEmbed(message.guild.id, {
        color: 0xFF3333,
        description: ' An error occurred while updating channel permissions. Please check my permissions and try again.'
      });
      return message.reply({ embeds: [embed] });
    }
  }
};