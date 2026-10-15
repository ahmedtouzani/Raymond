const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'nickname',
  description: 'Change the nickname of a user.',
  usage: '=nickname @user [new nickname]',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageNicknames],
  category: 'Moderation',

  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Manage Nicknames** permission to use this command.',
        color: 0x23272A,
      });
    }

    let member = message.mentions.members.first();
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
        command: 'nickname',
        description: '<a:warningbug:1467300628907954300> **User Not Found**\nPlease mention a user or provide a valid user ID to change nickname.',
        usage: '`!nickname <@user> [new nickname]`',
        examples: '`!nickname @User NewName`'
      });
      return message.reply({ embeds: [embed] });
    }

    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
      return sendEmbed(message, {
        title: 'Action Denied',
        description: 'You cannot perform this action on the bot itself.',
      });
    }

    if (member.id === client.user.id) {
      return sendEmbed(message, {
        title: ' Action Denied',
        description: 'I cannot change my own nickname using this command.',
        color: 0x23272A,
      });
    }

    // Prevent changing owner's nickname accidentally
    if (member.id === ownerId) {
      return sendEmbed(message, {
        title: ' Action Denied',
        description: 'You cannot change the bot owner\'s nickname.',
        color: 0x23272A,
      });
    }

    const newNickname = args.slice(1).join(' ');
    if (!newNickname) {
      return sendEmbed(message, {
        title: '❓ Missing Nickname',
        description: 'Please provide a new nickname.',
        color: 0x23272A,
      });
    }

    // Check role hierarchy
    if (!message.member.roles.highest.position > member.roles.highest.position && !isOwner) {
      return sendEmbed(message, {
        title: ' Action Denied',
        description: 'You cannot change the nickname of someone with an equal or higher role.',
        color: 0x23272A,
      });
    }

    try {
      await member.setNickname(newNickname, `Nickname changed by ${message.author.tag}`);
      sendEmbed(message, {
        title: '<a:okey:1467170671351173121> Nickname Changed',
        description: `${member.user.tag}'s nickname has been changed to **${newNickname}**.`,
        color: 0x23272A,
      });
    } catch (error) {
      sendEmbed(message, {
        title: '<a:warningbug:1467300628907954300> Error',
        description: `Failed to change nickname: \`${error.message}\``,
        color: 0x23272A,
      });
    }
  },
};
