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

    let member = message.mentions.members.first();
    if (!member && args[0]) {
      try {
        member = await message.guild.members.fetch(args[0]);
      } catch (e) {
        // Ignore fetch error, handled below
      }
    }
    if (!member) {
      return sendEmbed(message, {
        title: '❓ User Not Found',
        description: 'Please mention a user or provide a valid user ID to mute.',
        color: 0x23272A,
      });
    }
    if (member && protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
      return sendEmbed(message, {
        title: 'Action Denied',
        description: 'You cannot perform this action on the bot itself.',
      });
    }
    if (!member) {
      return sendEmbed(message, {
        title: '❓ User Not Mentioned',
        description: 'Please mention a user to ban.',
        color: 0x23272A,
      });
    }

    if (member.id === message.author.id) {
      return sendEmbed(message, {
        title: '❌ Cannot Ban Yourself',
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
        title: '❌ Error',
        description: `An error occurred while trying to ban the user.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
