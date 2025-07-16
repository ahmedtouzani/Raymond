const { createEmbed } = require('../../utils/embed');
const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');

// Available permissions that can be denied
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
  name: 'deny',
  aliases: ['denypermission', 'permissiondeny', 'remove', 'removepermission'],
  description: 'Deny specific permissions for a user or role in a channel',
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
    
    // Parse permission arguments
    for (const arg of args) {
      const perm = arg.toLowerCase();
      if (PERMISSIONS[perm]) {
        permissions.add(perm);
        permissionFlags |= PERMISSION_FLAGS[perm] || 0n;
      }
    }
    
    // If no permissions specified, deny all permissions
    if (permissions.size === 0) {
      // Add all available permissions to deny
      Object.keys(PERMISSIONS).forEach(perm => {
        if (PERMISSION_FLAGS[perm]) {
          permissions.add(perm);
          permissionFlags |= PERMISSION_FLAGS[perm];
        }
      });
    }
    
    // Check if target is valid
    if (!target) {
      const embed = await createEmbed(message.guild.id, {
        color: 0xFF3333,
        description: '❌ Please mention a valid user or role to deny permissions from.'
      });
      return message.reply({ embeds: [embed] });
    }
    
    try {
      // Get current permissions
      const currentOverwrites = channel.permissionOverwrites.cache.get(target.id);
      const currentDeny = currentOverwrites?.deny.bitfield || 0n;
      const currentAllow = currentOverwrites?.allow.bitfield || 0n;
      
      // Calculate new permissions
      const newDeny = currentDeny | permissionFlags;
      const newAllow = currentAllow & ~permissionFlags; // Remove from allowed if present
      
      // Update permissions
      await channel.permissionOverwrites.edit(target, {
        ...new PermissionsBitField(newAllow),
        ...(new PermissionsBitField(newDeny).toArray().reduce((a, v) => ({ ...a, [v]: false }), {}))
      });
      
      // Create success embed
      const permissionList = Array.from(permissions)
        .map(perm => `• ${PERMISSIONS[perm]}`)
        .join('\n');
      
      const embed = await createEmbed(message.guild.id, {
        color: 0x4CAF50,
        title: '✅ Permissions Updated',
        description: `Successfully updated permissions for ${target} in ${channel}`,
        fields: [
          {
            name: 'Denied Permissions',
            value: permissionList || 'None',
            inline: true
          },
          {
            name: 'Target Type',
            value: target.user ? 'User' : 'Role',
            inline: true
          }
        ]
      });
      
      return message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error updating channel permissions:', error);
      const embed = await createEmbed(message.guild.id, {
        color: 0xFF3333,
        description: '❌ An error occurred while updating channel permissions. Please check my permissions and try again.'
      });
      return message.reply({ embeds: [embed] });
    }
  }
};