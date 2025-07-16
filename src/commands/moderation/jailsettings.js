const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getGuildSettings } = require('../../database/jailSetting');

module.exports = {
  name: 'jailsettings',
  description: 'Show the current jail role and jail voice channel settings.',
  usage: '=jailsettings',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageGuild],
  category: 'Moderation',

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return sendEmbed(message, {
        title: 'Permission Denied',
        description: 'You need the **Manage Server** permission to use this command.',
        color: 0xff0000,
      });
    }

    try {
      const settings = await getGuildSettings(message.guild.id);

      const jailRole = settings?.jail_role_id
        ? `<@&${settings.jail_role_id}>`
        : 'Not set';

      const jailVoice = settings?.jail_voice_channel_id
        ? `<#${settings.jail_voice_channel_id}>`
        : 'Not set';

      return sendEmbed(message, {
        title: 'Jail Settings',
        description: `**Jail Role:** ${jailRole}\n**Jail Voice Channel:** ${jailVoice}`,
        color: 0x00cc99,
      });
    } catch (error) {
      return sendEmbed(message, {
        title: 'Error',
        description: `Failed to fetch jail settings.\n\`\`\`${error.message}\`\`\``,
        color: 0xff4444,
      });
    }
  },
};
