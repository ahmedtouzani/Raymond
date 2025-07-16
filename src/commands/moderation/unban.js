const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
  name: 'unban',
  description: 'Unban a user from the server using their user ID.',
  usage: '=unban <userID> [reason]',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.BanMembers],
  category: 'Moderation',
  
  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Ban Members** permission to use this command.',
        color: 0x23272A,
      });
    }

    const userId = args[0];
    if (!userId || isNaN(userId)) {
      return sendEmbed(message, {
        title: '❓ Invalid ID',
        description: 'Please provide a valid user ID to unban.',
        color: 0x23272A,
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      const bannedUsers = await message.guild.bans.fetch();
      const bannedUser = bannedUsers.get(userId);

      if (!bannedUser) {
        return sendEmbed(message, {
          title: '⚠️ User Not Banned',
          description: `No banned user found with ID: \`${userId}\`.`,
          color: 0x23272A,
        });
      }

      await message.guild.members.unban(userId, `${reason} | Unbanned by ${message.author.tag}`);

      sendEmbed(message, {
        title: '✅ User Unbanned',
        description: `Successfully unbanned **${bannedUser.user.tag}**.\n📝 **Reason:** ${reason}`,
        color: 0x00cc99,
      });
    } catch (error) {
      sendEmbed(message, {
        title: '❌ Error',
        description: `An error occurred while trying to unban the user.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
