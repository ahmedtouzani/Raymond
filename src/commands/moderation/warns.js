const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getWarnings } = require('../../database/warns');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'warns',
  description: 'List all warnings for a user.',
  usage: '=warns @user | =warns <userID>',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.KickMembers],
  category: 'Moderation',

  /**
   * @param {Message} message
   * @param {string[]} args
   * @param {Client} client
   */
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

    if (!args[0]) {
      return sendEmbed(message, {
        title: '❓ User Not Specified',
        description: 'Please mention a user or provide their user ID to view warnings.',
        color: 0x23272A,
      });
    }

    // Try to get member from mention first, fallback to fetching by ID
    let member = message.mentions.members.first();

    if (!member) {
      try {
        member = await message.guild.members.fetch(args[0]);
      } catch {
        return sendEmbed(message, {
          title: '❓ User Not Found',
          description: 'Could not find the user in this server. Please mention them or provide a valid user ID.',
          color: 0x23272A,
        });
      }
    }

    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
      return sendEmbed(message, {
        title: 'Action Denied',
        description: 'You cannot perform this action on the bot itself.',
        color: 0x23272A,
      });
    }

    try {
      const warnings = await getWarnings(message.guild.id, member.id);
      if (!warnings.length) {
        return sendEmbed(message, {
          title: 'No Warnings',
          description: `${member.user.tag} has no warnings.`,
          color: 0x23272A,
        });
      }

      // Example snippet from warns list command:
      const warningsList = warnings
        .map(
          (w, i) =>
            `**${i + 1}.** Warning ID: **${w.id}** — Warned by <@${w.moderator_id}> on ${new Date(w.timestamp).toLocaleString()}\nReason: ${w.reason}`
        )
        .join('\n\n');


      return sendEmbed(message, {
        title: `Warnings for ${member.user.tag}`,
        description: warningsList,
        color: 0x23272A,
      });
    } catch (error) {
      return sendEmbed(message, {
        title: '❌ Error',
        description: `Failed to fetch warnings.\n\`\`\`${error.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
