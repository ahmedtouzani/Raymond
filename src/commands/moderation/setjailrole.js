const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { setJailRole, getGuildSettings, removeJailedUser } = require('../../database/jailSetting');

module.exports = {
  name: 'setjailrole',
  description: 'Set the jail role for this server.',
  usage: '=setjailrole @role',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageGuild], // or ADMINISTRATOR
  category: 'Moderation',

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return sendEmbed(message, {
        title: 'Permission Denied',
        description: 'You need the **Manage Server** permission to use this command.',
        color: 0x23272A,
      });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'setjailrole',
        description: '<a:warningbug:905560995886411806> **Missing Role**\nPlease mention a role to set as the jail role.',
        usage: '`!setjailrole @role`',
        examples: '`!setjailrole @Jailed`'
      });
      return message.reply({ embeds: [embed] });
    }

    try {
      await setJailRole(message.guild.id, role.id);
      sendEmbed(message, {
        title: 'Jail Role Set',
        description: `Jail role has been set to **${role.name}**.`,
        color: 0x23272A,
      });
    } catch (error) {
      sendEmbed(message, {
        title: 'Error',
        description: `Failed to set jail role: ${error.message}`,
        color: 0x23272A,
      });
    }
  },
};
