const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'lock',
  aliases: ['sed'],
  description: 'Lock the current channel (prevent members from sending messages).',
  usage: '=lock',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageChannels],
  prefixless: true, 
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

    // Determine if unlock or lock
    const isUnlock = args[0]?.toLowerCase() === 'unlock';
    // Try to get the channel: mention, ID, or default to current
    let targetChannel = message.mentions.channels.first();
    if (!targetChannel && args[isUnlock ? 1 : 0]) {
      const channelId = args[isUnlock ? 1 : 0].replace(/[<#>]/g, '');
      targetChannel = message.guild.channels.cache.get(channelId);
    }
    if (!targetChannel) targetChannel = message.channel;

    const everyoneRole = message.guild.roles.everyone;

    try {
      await targetChannel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: isUnlock ? null : false,
      });

      sendEmbed(message, {
        title: isUnlock ? '🔓 Channel Unlocked' : '🔒 Channel Locked',
        description: isUnlock
          ? `${targetChannel} is now unlocked. Members can send messages.`
          : `${targetChannel} is now locked. Members cannot send messages.`,
        color: isUnlock ? 0x00cc99 : 0xff9900,
      });
    } catch (err) {
      sendEmbed(message, {
        title: '❌ Error',
        description: `Failed to ${isUnlock ? 'unlock' : 'lock'} the channel.\n\`\`\`${err.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
