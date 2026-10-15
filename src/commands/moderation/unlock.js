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

    // Check usage
    if (args[0] === 'help') {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'unlock',
        description: '🔓 **Unlock Channel**\nAllows members to send message in the channel again.',
        usage: '`!unlock`',
        examples: '`!unlock`'
      });
      return message.reply({ embeds: [embed] });
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
        title: '<a:warningbug:1467300628907954300> Error',
        description: `Failed to unlock the channel.\n\`\`\`${err.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
