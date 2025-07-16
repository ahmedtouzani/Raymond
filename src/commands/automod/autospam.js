const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getGuildConfig, setGuildConfig } = require('../../database/guildConfig');
const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'autospam',
  description: 'Enable or disable anti-spam automod for this server.',
  usage: '!autospam <on|off|status>',
  permissions: ['ADMINISTRATOR'],
  cooldown: 5,

  async execute(message, args) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Administrator** permission to use this command.',
        color: 0xff0000,
      });
    }
    const sub = args[0]?.toLowerCase();
    const config = await getGuildConfig(message.guild.id) || { settings: {} };
    config.settings.spamDetectionEnabled = config.settings.spamDetectionEnabled !== false;

    if (sub === 'on' || sub === 'enable') {
      config.settings.spamDetectionEnabled = true;
      await setGuildConfig(message.guild.id, config);
      return sendEmbed(message, {
        title: 'Spam Detection Enabled',
        description: 'Spam automod is now **enabled** for this server.',
        color: 0x00cc99,
      });
    }
    if (sub === 'off' || sub === 'disable') {
      config.settings.spamDetectionEnabled = false;
      await setGuildConfig(message.guild.id, config);
      return sendEmbed(message, {
        title: 'Spam Detection Disabled',
        description: 'Spam automod is now **disabled** for this server.',
        color: 0xff9900,
      });
    }
    // status or default
    const status = config.settings.spamDetectionEnabled !== false ? '<:Done:1305644486453493801> Enabled' : '❌ Disabled';
    return sendEmbed(message, {
      title: 'Spam Automod Status',
      description: `Status: ${status}\n\nUsage:\n• !autospam on/off\n• !autospam status`,
      color: 0x3399ff,
    });
  },
};
