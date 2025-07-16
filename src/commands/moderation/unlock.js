const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
  name: 'unlock',
  description: 'Unlock the current channel (allow members to send messages).',
  usage: '=unlock',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageChannels],
  category: 'Moderation',

  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Manage Channels** permission to use this command.',
        color: 0x23272A,
      });
    }

    const everyoneRole = message.guild.roles.everyone;

    try {
      await message.channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: null,
      });

      sendEmbed(message, {
        title: '🔓 Channel Unlocked',
        description: `This channel is now unlocked. Members can send messages again.`,
        color: 0x23272A,
      });
    } catch (err) {
      sendEmbed(message, {
        title: '❌ Error',
        description: `Failed to unlock the channel.\n\`\`\`${err.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
