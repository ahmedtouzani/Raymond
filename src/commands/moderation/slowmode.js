const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
  name: 'slowmode',
  description: 'Set slowmode delay (in seconds) for a channel, with optional role exemptions.',
  usage: '=slowmode [#channel] [seconds] [-ex @role1 @role2 ...]',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageChannels],
  category: 'Moderation',
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return sendEmbed(message, {
        title: 'Permission Denied',
        description: 'You need the Manage Channels permission to use this command.',
        color: 0x23272A,
      });
    }

    // Parse channel (optional, defaults to current)
    let channel = message.mentions.channels.first() || message.channel;
    let argOffset = message.mentions.channels.first() ? 1 : 0;

    // Parse seconds
    const seconds = parseInt(args[argOffset], 10);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'slowmode',
        description: '<a:warningbug:905560995886411806> **Invalid Duration**\nPlease provide a slowmode value in seconds between 0 and 21600.',
        usage: '`!slowmode [#channel] <seconds> [-ex @role]`',
        examples: '`!slowmode 5`\n`!slowmode #general 10`'
      });
      return message.reply({ embeds: [embed] });
    }

    // Parse --exempt flag and roles
    let exemptRoles = [];
    const exemptIdx = args.findIndex(arg => arg === '-ex');
    if (exemptIdx !== -1) {
      exemptRoles = message.mentions.roles.map(r => r);
      if (exemptRoles.length === 0) {
        return sendEmbed(message, {
          title: 'No Exempt Roles',
          description: 'Please mention at least one role to exempt after -ex.',
          color: 0x23272A,
        });
      }
    }

    try {
      await channel.setRateLimitPerUser(seconds, `Slowmode set by ${message.author.tag}`);

      // Exempt roles: update permission overwrites
      for (const role of exemptRoles) {
        await channel.permissionOverwrites.edit(role, { SendMessages: true });
      }

      return sendEmbed(message, {
        title: 'Slowmode Updated',
        description: `Slowmode has been set to **${seconds} seconds** in ${channel}.\n`
          + (exemptRoles.length > 0
            ? `Exempted roles: ${exemptRoles.map(r => `<@&${r.id}>`).join(', ')}`
            : ''),
        color: 0x23272A,
      });
    } catch (error) {
      return sendEmbed(message, {
        title: 'Error',
        description: `Failed to set slowmode: ${error.message}`,
        color: 0x23272A,
      });
    }
  },
};