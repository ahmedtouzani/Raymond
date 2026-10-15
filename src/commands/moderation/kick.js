const { recordAction } = require('../../services/moderationRecords');
const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'kick',
  description: 'Kick a user from the server.',
  usage: '=kick @user [reason]',
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
    const { createUsageEmbed } = require('../../utils/embed');

    if (!args.length) {
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'kick',
        description: 'Kicks a user from the server.',
        usage: '`!kick <@user/ID> [reason]`',
        examples: '`!kick @User Spamming`\n`!kick 123456789012345678`'
      });
      return message.reply({ embeds: [embed] });
    }

    let member = message.mentions.members.first();
    if (!member && args[0]) {
      try {
        member = await message.guild.members.fetch(args[0]);
      } catch (e) {
        // Ignore fetch error
      }
    }
    if (!member) {
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'kick',
        description: '<a:warningbug:1467300628907954300> **User Not Found**\nPlease mention a valid user or provide a User ID.',
        usage: '`!kick <@user/ID> [reason]`',
        examples: '`!kick @User`'
      });
      return message.reply({ embeds: [embed] });
    }
    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
      return sendEmbed(message, {
        title: 'Action Denied',
        description: 'You cannot perform this action on the bot itself.',
      });
    }

    if (member.id === message.author.id) {
      return sendEmbed(message, {
        title: ' Cannot Kick Yourself',
        description: 'You cannot kick yourself.',
        color: 0x23272A,
      });
    }

    if (!member.kickable) {
      return sendEmbed(message, {
        title: '<a:warningbug:1467300628907954300> Kick Failed',
        description: 'I cannot kick this user. Check my permissions and role hierarchy.',
        color: 0x23272A,
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.kick(`${reason} | Kicked by ${message.author.tag}`);
      await recordAction(message, member.id, 'kick', reason);

      sendEmbed(message, {
        title: '👢 User Kicked',
        description: `**${member.user.tag}** has been kicked.\n📝 **Reason:** ${reason}`,
        color: 0x23272A,
      });
    } catch (error) {
      sendEmbed(message, {
        title: '<a:warningbug:1467300628907954300> Error',
        description: `An error occurred while trying to kick the user.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
