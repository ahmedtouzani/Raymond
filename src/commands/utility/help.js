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
        const { createUsageEmbed } = require('../../utils/embed');
        const embed = await createUsageEmbed(message.guild?.id, {
          command: 'help',
          description: '<a:warningbug:905560995886411806> **Command Not Found**\nThat command does not exist.',
          usage: '`!help [command_name]`',
          examples: '`!help ban`\n`!help userinfo`'
        });
        return message.reply({ embeds: [embed] });
      }

      const data = [];
      data.push(`**Description:** ${command.description || 'No description provided.'}`);
      if (command.usage) data.push(`**Usage:** \`${command.usage.replace(/=/, prefix)}\``);
      if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(', ')}`);
      if (command.cooldown) data.push(`**Cooldown:** ${command.cooldown} second(s)`);
      if (command.permissions) data.push(`**Required Permissions:** ${command.permissions.join(', ')}`);
      if (command.category) data.push(`**Category:** ${command.category}`);
      if (command.premium) data.push(`**Premium Feature:** Yes`);

      return message.reply({
        embeds: [await createEmbed(message.guild?.id, {
          title: `Command: ${command.name.charAt(0).toUpperCase() + command.name.slice(1)}`,
          description: data.join('\n'),
          color: 0x23272A
        })]
      });
    }

    // Otherwise, list all commands by category
    const moderationCommands = Array.from(commands.values()).filter(cmd => cmd.category === 'Moderation');
    const utilityCommands = Array.from(commands.values()).filter(cmd => cmd.category === 'Utility');

    const moderationList = moderationCommands.map(cmd => `• \`${prefix}${cmd.name}\``).join('\n') || 'No moderation commands available.';
    const utilityList = utilityCommands.map(cmd => `• \`${prefix}${cmd.name}\``).join('\n') || 'No utility commands available.';

    const embed = await createEmbed(message.guild?.id, {
      title: "<:manager2:1466828942177734820> Welcome To Raymond's <:pu:1463991804301938845> Help Menu",
      description: 'Hello there! I\'m **Parallel Ultra Bot**, your ultimate companion for server management.\nDiscover all my features below. For detailed info on any command, use `!help [command_name]`.',
      fields: [
        {
          name: '<a:endlessspinne:1463992178010230906> Moderation Commands',
          value: moderationList,
          inline: false
        },
        {
          name: '<a:utiliti:1466829554055381055> Utility Commands',
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
