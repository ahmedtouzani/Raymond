const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  PermissionsBitField
} = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { createUsageEmbed } = require('../../utils/embed');

module.exports = {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'Displays a professional interactive help menu.',
  usage: '=help [command_name]',
  category: 'Utility',
  cooldown: 5,
  prefixless: true,

  async execute(message, args, client) {
    // 1. Get Prefix
    let prefix = process.env.GLOBAL_PREFIX || '!';
    try {
      const guildConfig = await getGuildConfig(message.guild.id);
      if (guildConfig?.prefix) prefix = guildConfig.prefix;
    } catch (e) { }

    // 2. Specific Command Help
    if (args.length) {
      const name = args[0].toLowerCase();
      const command = client.commands.get(name) ||
        client.commands.find(c => c.aliases && c.aliases.includes(name));

      if (!command) {
        const errorEmbed = await createUsageEmbed(message.guild.id, {
          command: 'help',
          description: '<a:warningbug:905560995886411806> **Command Not Found**',
          usage: `\`${prefix}help [command]\``,
          examples: `\`${prefix}help ban\`\n\`${prefix}help ai\``
        });
        return message.reply({ embeds: [errorEmbed] });
      }

      // Build Usage Embed for specific command
      const usageEmbed = await createUsageEmbed(message.guild.id, {
        command: command.name,
        description: command.description || 'No description.',
        usage: command.usage ? command.usage.replace(/=/g, prefix) : `\`${prefix}${command.name}\``,
        examples: `\`${prefix}${command.name}\`` // Placeholder if no explicit examples
      });
      return message.reply({ embeds: [usageEmbed] });
    }

    // 3. Dynamic Interactive Menu
    const categories = {
      'Moderation': { emoji: '<a:endlessspinne:1463992178010230906>', description: 'Keep your server safe and clean.' },
      'Utility': { emoji: '<a:utiliti:1466829554055381055>', description: 'Useful tools and information.' },
      'Leveling': { emoji: '📊', description: 'XP, Ranks, and Leaderboards.' },
      'AI': { emoji: '🧠', description: 'Raymond Reddington AI Assistant.' },
      'OwnerOnly': { emoji: '🔒', description: 'Bot Owner commands.' },
      'Admin': { emoji: '🛡️', description: 'Server Administrator commands.' }
    };

    // Group commands
    const commandGroups = {};
    client.commands.forEach(cmd => {
      const cat = cmd.category || 'Utility';
      if (!commandGroups[cat]) commandGroups[cat] = [];
      commandGroups[cat].push(cmd);
    });

    // Determine standard categories to show
    const isOwner = message.author.id === process.env.OWNER_ID;
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    const categoryKeys = Object.keys(commandGroups).filter(cat => {
      // Strict HIding for Private Categories
      const privateCategories = ['OwnerOnly', 'GodMode'];
      if (privateCategories.includes(cat) && !isOwner) return false;

      if (cat === 'Admin' && !isAdmin && !isOwner) return false;
      return true;
    });

    // Create Home Embed
    const homeEmbed = new EmbedBuilder()
      .setColor(0x000001) // Pitch Black
      .setTitle(`<:pu:1463991804301938845> Raymond's Help Center`)
      .setDescription(`Hello **${message.author.username}**, welcome to the dashboard.\n\n**Select a module below to view commands.**\n\n<:link:1466828557996494921> **Links**\n[Support Server](https://discord.gg/example) • [Dashboard](https://example.com)`)
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setImage('https://cdn.discordapp.com/banners/1038540608396066856/a_d7b13b74fae7e97e33c0c2f34063a772.gif?size=4096')
      .setFooter({ text: 'Powered By Parallel Universe', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    // specific category embeds generator
    const generateCategoryEmbed = (cat) => {
      const cmds = commandGroups[cat];
      const embed = new EmbedBuilder()
        .setColor(0x000001)
        .setTitle(`${categories[cat]?.emoji || '📂'} ${cat} Commands`)
        .setDescription(categories[cat]?.description || `List of ${cat} commands.`)
        .setFooter({ text: 'Powered By Parallel Universe', iconURL: client.user.displayAvatarURL() })
        .setThumbnail('https://cdn.discordapp.com/banners/1038540608396066856/a_d7b13b74fae7e97e33c0c2f34063a772.gif?size=4096');

      // Add fields for commands (inline for grid look)
      if (cmds.length > 0) {
        // Group into chunks of 3 for nice grid feel, or just list them
        // Let's use fields: Name as title, Short description as value
        const fields = cmds.map(c => ({
          name: `\`${prefix}${c.name}\``,
          value: c.description ? c.description.substring(0, 50) : 'No description',
          inline: true
        }));
        // Discord allows max 25 fields. If more, we must truncate or stringify.
        // Moderation has 25 commands, so fields might be risky if we hit limits with other content.
        // Safer route: String list but formatted nicely.

        // Let's try 2 columns using a clever map
        const half = Math.ceil(cmds.length / 2);
        const col1 = cmds.slice(0, half).map(c => `**${c.name}**\n<:reply:1466829142177734820> ${c.description || 'No desc'}`).join('\n\n');
        const col2 = cmds.slice(half).map(c => `**${c.name}**\n<:reply:1466829142177734820> ${c.description || 'No desc'}`).join('\n\n');

        if (col1) embed.addFields({ name: 'Commands (1/2)', value: col1, inline: true });
        if (col2) embed.addFields({ name: 'Commands (2/2)', value: col2, inline: true });
      } else {
        embed.setDescription('No commands available in this category.');
      }
      return embed;
    };

    // Create Dropdown
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('Select a Category')
      .addOptions(
        {
          label: 'Home',
          description: 'Return to the main page',
          value: 'home',
          emoji: '🏠'
        },
        ...categoryKeys.map(cat => ({
          label: cat,
          description: categories[cat]?.description || 'View commands',
          value: cat,
          emoji: categories[cat]?.emoji || '📂'
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await message.reply({ embeds: [homeEmbed], components: [row] });

    // Collector
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: '❌ This menu is for the command user only.', ephemeral: true });
      }

      const selected = i.values[0];
      if (selected === 'home') {
        await i.update({ embeds: [homeEmbed] });
      } else {
        await i.update({ embeds: [generateCategoryEmbed(selected)] });
      }
    });

    collector.on('end', () => {
      reply.edit({ components: [] }).catch(() => { });
    });
  }
};
