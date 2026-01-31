const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');


module.exports = {
  name: 'ban',
  description: 'Ban a user from the server.',
  usage: '=ban @user [reason]',
  cooldown: 5, // seconds
  permissions: [PermissionsBitField.Flags.BanMembers],
  category: 'Moderation',

  /**
   * @param {Message} message
   * @param {string[]} args
   * @param {Client} client
   */
  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;

    // Allow bypass if bot owner
    const isOwner = message.author.id === ownerId;

    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Ban Members** permission to use this command.',
        color: 0x23272A,
      });
    }

    const { createUsageEmbed } = require('../../utils/embed');

    // ... permission checks ...

    if (!args.length) {
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'ban',
        description: 'Bans a user from the server.',
        usage: '`!ban <@user/ID> [reason]`',
        examples: '`!ban @User Spamming`\n`!ban 123456789012345678 Bad behavior`'
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
        command: 'ban',
        description: '<a:warningbug:905560995886411806> **User Not Found**\nPlease mention a valid user or provide a User ID.',
        usage: '`!ban <@user/ID> [reason]`',
        examples: '`!ban @User Spamming`'
      });
      return message.reply({ embeds: [embed] });
    }

    if (member.id === message.author.id) {
      return sendEmbed(message, {
        title: ' Cannot Ban Yourself',
        description: 'You cannot ban yourself.',
        color: 0x23272A,
      });
    }

    if (!member.bannable) {
      return sendEmbed(message, {
        title: '⚠️ Ban Failed',
        description: 'I cannot ban this user. Check my permissions and role hierarchy.',
        color: 0x23272A,
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.ban({
        reason: `${reason} | Banned by ${message.author.tag}`,
      });

      sendEmbed(message, {
        title: '🔨 User Banned',
        description: `**${member.user.tag}** has been banned.\n📝 **Reason:** ${reason}`,
        color: 0x23272A,
      });
    } catch (error) {
      sendEmbed(message, {
        title: '<a:warningbug:905560995886411806> Error',
        description: `An error occurred while trying to ban the user.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
