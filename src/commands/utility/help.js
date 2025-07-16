const { createEmbed } = require('../../utils/embed');
const { getGuildConfig } = require('../../database/guildConfig');

module.exports = {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'Displays a list of all available commands, categorized.',
  usage: '=help [command_name]',
  category: 'Utility',
  cooldown: 3,
  prefixless: true,

  async execute(message, args, client) {
    const { commands } = client;
    
    // Fetch guild-specific prefix
    let prefix = process.env.GLOBAL_PREFIX; // Default to global prefix
    if (message.guild) {
      const guildConfig = await getGuildConfig(message.guild.id);
      if (guildConfig && guildConfig.prefix) {
        prefix = guildConfig.prefix;
      }
    }

    // If a specific command name is provided, show detailed info for that command
    if (args.length) {
      const name = args[0].toLowerCase();
      const command = commands.get(name) || Array.from(commands.values()).find(c => c.aliases && c.aliases.includes(name));

      if (!command) {
        return message.reply({ embeds: [await createEmbed(message.guild?.id, {
          description: '❌ That command does not exist.',
          color: 0xFF3333
        })] });
      }

      const data = [];
      data.push(`**Description:** ${command.description || 'No description provided.'}`);
      if (command.usage) data.push(`**Usage:** \`${command.usage.replace(/=/, prefix)}\``);
      if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(', ')}`);
      if (command.cooldown) data.push(`**Cooldown:** ${command.cooldown} second(s)`);
      if (command.permissions) data.push(`**Required Permissions:** ${command.permissions.join(', ')}`);
      if (command.category) data.push(`**Category:** ${command.category}`);
      if (command.premium) data.push(`**Premium Feature:** Yes`);

      return message.reply({ embeds: [await createEmbed(message.guild?.id, {
        title: `Command: ${command.name.charAt(0).toUpperCase() + command.name.slice(1)}`,
        description: data.join('\n'),
        color: 0x23272A
      })] });
    }

    // Otherwise, list all commands by category
    const moderationCommands = Array.from(commands.values()).filter(cmd => cmd.category === 'Moderation');
    const utilityCommands = Array.from(commands.values()).filter(cmd => cmd.category === 'Utility');

    const moderationList = moderationCommands.map(cmd => `• \`${prefix}${cmd.name}\``).join('\n') || 'No moderation commands available.';
    const utilityList = utilityCommands.map(cmd => `• \`${prefix}${cmd.name}\``).join('\n') || 'No utility commands available.';

    const embed = await createEmbed(message.guild?.id, {
      title: '<:3764nawriter:1379103207925747782> Parallel Ultra Bot Help',
      description: 'Hello there! I\'m **Parallel Ultra Bot**, your ultimate companion for server management.\nDiscover all my features below. For detailed info on any command, use `!help [command_name]`.',
      fields: [
        {
          name: '<:46910nacrownowner:1379103344286502994> Moderation Commands',
          value: moderationList,
          inline: false
        },
        {
          name: '<:6911party:1379103249176592384> Utility Commands',
          value: utilityList,
          inline: false
        }
        // You can add more categories here as needed
      ],
      thumbnail: client.user.displayAvatarURL({ dynamic: true, size: 256 }), // Pass URL string directly
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      },
      timestamp: true,
      color: 0x5865F2
    });

    return message.reply({ embeds: [embed] });
  },
};
