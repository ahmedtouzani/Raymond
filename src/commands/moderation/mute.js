const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');
const { aliases } = require('./clear');

module.exports = {
  name: 'mute',
  aliases: ['skot'],
  description: 'Mute a user in text channels.',
  usage: '=mute @user [reason]',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  prefixless: true, 
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

    // Support both mention and user ID
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
    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
        return sendEmbed(message, {
          title: 'Action Denied',
          description: 'You cannot perform this action on the bot itself.',
        });
    }
    const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
    if (!muteRole) {
      return sendEmbed(message, {
        title: '⚠️ Muted Role Not Found',
        description: 'No role named **Muted** found. Please create one and set permissions.',
        color: 0x23272A,
      });
    }

    if (member.roles.cache.has(muteRole.id)) {
      return sendEmbed(message, {
        title: '🔇 Already Muted',
        description: `${member.user.tag} is already muted.`,
        color: 0x23272A,
      });
    }

    // Parse duration (optional, e.g. !mute @user 10m reason)
    let durationMs = null;
    let durationStr = null;
    if (args[1] && /^\d+[smhd]$/.test(args[1])) {
      const match = args[1].match(/^(\d+)([smhd])$/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
          case 's': durationMs = value * 1000; durationStr = `${value} seconds`; break;
          case 'm': durationMs = value * 60 * 1000; durationStr = `${value} minutes`; break;
          case 'h': durationMs = value * 60 * 60 * 1000; durationStr = `${value} hours`; break;
          case 'd': durationMs = value * 24 * 60 * 60 * 1000; durationStr = `${value} days`; break;
        }
      }
    }
    // Shift reason if duration is present
    const reason = durationMs ? args.slice(2).join(' ') || 'No reason provided' : args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.roles.add(muteRole, `Muted by ${message.author.tag} | ${reason}`);

      sendEmbed(message, {
        title: '🔇 User Muted',
        description:
          `**${member.user.tag}** has been muted.` +
          (durationStr ? `\n⏰ **Duration:** ${durationStr}` : '') +
          `\n📝 **Reason:** ${reason}`,
        color: 0x23272A,
      });

      // Auto-unmute after duration (in-memory, resets on bot restart)
      if (durationMs) {
        setTimeout(async () => {
          try {
            if (member.roles.cache.has(muteRole.id)) {
              await member.roles.remove(muteRole, 'Mute duration expired');
              sendEmbed(message.channel, {
                title: '🔊 User Unmuted',
                description: `**${member.user.tag}** has been automatically unmuted after ${durationStr}.`,
                color: 0x23272A,
              });
            }
          } catch (e) {
            // Optionally log error
          }
        }, durationMs);
        // TODO: For production, persist scheduled unmutes in DB for reliability across restarts
      }
    } catch (err) {
      sendEmbed(message, {
        title: '❌ Error',
        description: `Failed to mute user.\n\`\`\`${err.message}\`\`\``,
        color: 0x23272A,
      });
    }
  },
};
