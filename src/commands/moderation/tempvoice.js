const { ChannelType, PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const tempVoiceDB = require('../../database/tempVoice');

module.exports = {
  name: 'tempvoice',
  description: 'Manage multiple, named temporary voice channel configurations.',
  usage: '=tempvoice <create|delete|list|info> [args...]',
  permissions: [PermissionsBitField.Flags.ManageChannels],
  category: 'Moderation',

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return sendEmbed(message, {
        title: 'Permission Denied',
        description: "You need the 'Manage Channels' permission to use this command.",
        color: 0x23272A,
      });
    }

    const subCommand = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    switch (subCommand) {
      case 'create': {
        const creatorChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        let configName = args.slice(2).join(' ');

        if (!creatorChannel || creatorChannel.type !== ChannelType.GuildVoice) {
          return sendEmbed(message, { title: 'Error', description: 'Please provide a valid voice channel to use as the creator channel.' });
        }

        if (!configName) {
          configName = creatorChannel.name;
        }

        const category = creatorChannel.parent;
        if (!category) {
          return sendEmbed(message, { title: 'Error', description: 'The creator channel must be in a category.' });
        }

        await tempVoiceDB.upsertTempVoiceConfig(guildId, {
          creatorChannelId: creatorChannel.id,
          configName,
          enabled: true,
          categoryId: category.id,
          supportRoleId: null, // Can be added via an 'update' command later
        });

        return sendEmbed(message, {
          title: '✅ Temp Voice Created',
          description: `Successfully created the **${configName}** temp voice setup. Users joining ${creatorChannel} will now get their own channel.`,
        });
      }

      case 'delete': {
        const creatorChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);

        if (!creatorChannel || creatorChannel.type !== ChannelType.GuildVoice) {
          return sendEmbed(message, { title: 'Error', description: 'Please provide the creator voice channel for the configuration you want to delete.' });
        }

        const deleted = await tempVoiceDB.deleteTempVoiceConfig(guildId, creatorChannel.id);

        if (deleted) {
          return sendEmbed(message, { title: '🗑️ Temp Voice Deleted', description: `Successfully removed the temp voice configuration associated with ${creatorChannel}.` });
        } else {
          return sendEmbed(message, { title: 'Error', description: `No temp voice configuration found for ${creatorChannel}.` });
        }
      }

      case 'list': {
        const configs = await tempVoiceDB.getAllTempVoiceConfigsForGuild(guildId);
        if (configs.length === 0) {
          return sendEmbed(message, { title: 'Temp Voice Configurations', description: "No temporary voice configurations found. Use `=tempvoice create` to set one up." });
        }

        const description = configs.map(config => {
          const creatorChannel = message.guild.channels.cache.get(config.creatorChannelId);
          return `**${config.configName}**
- **Creator:** ${creatorChannel || 'Not Found'}\n- **Status:** ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`;
        }).join('\n\n');

        return sendEmbed(message, {
          title: 'Temporary Voice Configurations',
          description,
        });
      }

      default:
        return sendEmbed(message, {
          title: 'Temporary Voice Channel System',
          description: 'Manage multiple, named voice-on-demand configurations for your server.',
          fields: [
            { name: '`=tempvoice create <#channel> <name>`', value: 'Creates a new temp voice setup.' },
            { name: '`=tempvoice delete <#channel>`', value: 'Deletes a temp voice setup.' },
            { name: '`=tempvoice list`', value: 'Lists all temp voice setups.' },
          ],
        });
    }
  },
};
