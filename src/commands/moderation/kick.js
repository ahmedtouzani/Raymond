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
        description: 'Please mention a user or provide a valid user ID to kick.',
        color: 0x23272A,
      });
    }
    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
        return sendEmbed(message, {
          title: 'Action Denied',
          description: 'You cannot perform this action on the bot itself.',
        });
    }

    if (member.id === message.author.id) {
      return sendEmbed(message, {
        title: '❌ Cannot Kick Yourself',
        description: 'You cannot kick yourself.',
        color: 0x23272A,
      });
    }

    if (!member.kickable) {
      return sendEmbed(message, {
        title: '⚠️ Kick Failed',
        description: 'I cannot kick this user. Check my permissions and role hierarchy.',
        color: 0x23272A,
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.kick(`${reason} | Kicked by ${message.author.tag}`);

      sendEmbed(message, {
        title: '👢 User Kicked',
        description: `**${member.user.tag}** has been kicked.\n📝 **Reason:** ${reason}`,
        color: 0x23272A,
      });
    } catch (error) {
      sendEmbed(message, {
        title: '❌ Error',
        description: `An error occurred while trying to kick the user.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
