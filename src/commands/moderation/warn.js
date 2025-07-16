const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { addWarning, countWarnings } = require('../../database/warns');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'warn',
  description: 'Warn a user and log it to the database.',
  usage: '=warn @user [reason]',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.KickMembers],
  category: 'Moderation',

  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Kick Members** permission to use this command.',
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
      return sendEmbed(message, {
        title: '❓ User Not Mentioned',
        description: 'Please mention a user to warn. or provide a valid user ID.',
        color: 0x23272A,
      });
    }

    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
      return sendEmbed(message, {
        title: 'Action Denied',
        description: 'You cannot perform this action on the bot itself.',
        color: 0x23272A,
      });
    }

    if (member.id === message.author.id) {
      return sendEmbed(message, {
        title: '❌ Cannot Warn Yourself',
        description: 'You cannot warn yourself.',
        color: 0x23272A,
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await addWarning(message.guild.id, member.id, message.author.id, reason);
      const total = await countWarnings(message.guild.id, member.id);
      return sendEmbed(message, {
        title: '⚠️ User Warned',
        description: `**${member.user.tag}** has been warned.\n📝 **Reason:** ${reason}\n\nTotal warnings: **${total}**`,
        color: 0x23272A,
      });
    } catch (error) {
      return sendEmbed(message, {
        title: '❌ Error',
        description: `An error occurred while trying to warn the user.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
