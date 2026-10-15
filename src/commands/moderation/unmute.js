const { recordAction } = require('../../services/moderationRecords');
const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
  name: 'unmute',
  description: 'Unmute a muted user.',
  usage: '=unmute @user',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  category: 'Moderation',

  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Moderate Members** permission to use this command.',
        color: 0x23272A,
      });
    }

    const member = message.mentions.members.first();
    if (!member && args[0]) {
      try {
        member = await message.guild.members.fetch(args[0]);
      } catch (e) {
        // Ignore fetch error, handled below
      }
    }
    if (!member) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'unmute',
        description: '<a:warningbug:1467300628907954300> **User Not Found**\nPlease mention a user to unmute, or provide a valid user ID.',
        usage: '`!unmute <@user>`',
        examples: '`!unmute @User`'
      });
      return message.reply({ embeds: [embed] });
    }

    const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
    if (!muteRole) {
      return sendEmbed(message, {
        title: '<a:warningbug:1467300628907954300> Muted Role Not Found',
        description: 'No role named **Muted** found.',
        color: 0x23272A,
      });
    }

    if (!member.roles.cache.has(muteRole.id)) {
      return sendEmbed(message, {
        title: '❔ Not Muted',
        description: `${member.user.tag} is not currently muted.`,
        color: 0x23272A,
      });
    }

    try {
      await member.roles.remove(muteRole, `Unmuted by ${message.author.tag}`);
      await recordAction(message, member.id, 'unmute');

      sendEmbed(message, {
        title: '🔊 User Unmuted',
        description: `**${member.user.tag}** has been unmuted.`,
        color: 0x23272A,
      });
    } catch (err) {
      sendEmbed(message, {
        title: '<a:warningbug:1467300628907954300> Error',
        description: `Failed to unmute user.\n\`\`\`${err.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
