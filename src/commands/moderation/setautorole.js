const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { setAutoRole, getAutoRoleSettings } = require('../../database/autoRole');

module.exports = {
  name: 'setautorole',
  description: 'Set the auto role for new members or configure the new member join log channel.',
  usage: 
    '=setautorole @role | =setautorole off | =setautorole log <#channel> | =setautorole view',
  permissions: [PermissionsBitField.Flags.ManageRoles],
  category: 'Moderation',
  async execute(message, args) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Manage Roles** permission to use this command.',
        color: 0x23272A,
      });
    }

    const currentSettings = await getAutoRoleSettings(message.guild.id);
    let newRoleId = currentSettings.role_id;
    let newLogChannelId = currentSettings.member_join_log_channel_id;

    const subCommand = args[0]?.toLowerCase();

    // Handle 'off' to disable auto-role
    if (['off', 'disable', 'none'].includes(subCommand)) {
      try {
        await setAutoRole(message.guild.id, null, newLogChannelId); // Preserve log channel
        return sendEmbed(message, {
          title: '✅ Auto Role Disabled',
          description: 'Auto role assignment for new members has been **disabled**.',
          color: 0x23272A,
        });
      } catch (err) {
        return sendEmbed(message, {
          title: '❌ Error',
          description: `Failed to disable auto role.\n\`\`\`${err.message}\`\`\``,
          color: 0x23272A,
        });
      }
    }

    // Handle 'log' subcommand for setting the log channel
    if (subCommand === 'log') {
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.trim());
      if (!channel || channel.type !== 0) { // Check if it's a text channel
        return sendEmbed(message, {
          title: '❌ Invalid Channel',
          description: 'Please mention a valid text channel or provide its ID to set as the member join log channel.',
          color: 0x23272A,
        });
      }
      newLogChannelId = channel.id;
      try {
        await setAutoRole(message.guild.id, newRoleId, newLogChannelId); // Preserve auto role
        return sendEmbed(message, {
          title: '✅ Member Join Log Channel Set',
          description: `New member join logs will now be sent to ${channel}.`,
          color: 0x23272A,
        });
      } catch (err) {
        return sendEmbed(message, {
          title: '❌ Error',
          description: `Failed to set member join log channel.\n\`\`\`${err.message}\`\`\``,
          color: 0x23272A,
        });
      }
    }

    // Handle setting the auto-role
    const role = message.mentions.roles.first();
    if (role) {
      newRoleId = role.id;
      try {
        await setAutoRole(message.guild.id, newRoleId, newLogChannelId); // Preserve log channel
        return sendEmbed(message, {
          title: '✅ Auto Role Set',
          description: `New members will now automatically receive the **${role.name}** role.`,
          color: 0x23272A,
        });
      } catch (err) {
        return sendEmbed(message, {
          title: '❌ Error',
          description: `Failed to set auto role.\n\`\`\`${err.message}\`\`\``,
          color: 0x23272A,
        });
      }
    }

    // If no specific action, show current settings and help
    const autoRoleStatus = newRoleId ? `<@&${newRoleId}>` : 'Not Set';
    const logChannelStatus = newLogChannelId ? `<#${newLogChannelId}>` : 'Not Set';

    sendEmbed(message, {
      title: '<:3736prmanager:1379103192784310282> Auto Role & Member Join Log System',
      description: 'Configure automatic role assignment for new members and a dedicated log channel for member join events.',
      fields: [
        {
          name: 'Current Auto Role:',
          value: autoRoleStatus,
          inline: true,
        },
        {
          name: 'Current Join Log Channel:',
          value: logChannelStatus,
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: false,
        },
        {
          name: 'Commands:',
          value:
            '`=setautorole @role` - Set the role automatically given to new members.\n' +
            '`=setautorole off` - Disable auto role assignment.\n' +
            '`=setautorole log <#channel>` - Set the channel for new member join logs.',
          inline: false,
        },
      ],
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      },
      timestamp: true,
      color: 0x5865F2,
    });
  },
};
