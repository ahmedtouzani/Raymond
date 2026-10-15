const { asEmbed } = require('../../utils/responses');
const {
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { categories, catalog, resolveCommand, searchCommands, normalizeUsage, examples } = require('../../services/helpCatalog');
const icons = require('../../config/setupEmojis');
const logger = require('../../utils/logger');
const PAGE_SIZE = 6;
const row = component => new ActionRowBuilder().addComponents(component);
const control = (name, label, icon, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`help:${name}`).setLabel(label).setStyle(style).setEmoji(icon);
const code = value => `\`${value.replace(/`/g, '').slice(0, 200)}\``;
const groupCommands = (commands, category) => commands.filter(command => command.categoryId === category);

const text = content => new TextDisplayBuilder().setContent(content);
const separator = () => new SeparatorBuilder().setDivider(true);
function card(container, content, action, label, icon = icons.arrow) {
  container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(content))
    .setButtonAccessory(control(action, label, icon)));
}
function payload(container) {
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}
function endHelp(prefix, closed) {
  return payload(new ContainerBuilder().setAccentColor(0x8594F0)
    .addTextDisplayComponents(text(`## ${closed ? 'Help Closed' : 'Session Expired'}\n${icons.category} Run ${code(`${prefix}help`)} whenever you need a hand.`)));
}
function renderHelp(state, message, client) {
  const commands = catalog(client);
  const visibleCategories = Object.keys(categories).filter(category => groupCommands(commands, category).length);
  const selected = commands.find(command => command.name === state.command);
  if (state.command && !selected) { state.command = null; state.category = null; state.query = ''; }
  if (state.category && !visibleCategories.includes(state.category)) state.category = null;
  const container = new ContainerBuilder().setAccentColor(0x8594F0);
  if (selected) {
    const aliases = selected.aliases.map(code).join(' · ') || 'None';
    container.addTextDisplayComponents(text(`## ${categories[selected.categoryId].icon} ${selected.name}\n${String(selected.description || 'Command information.').slice(0, 850)}\n\n-# ${selected.prefixless ? 'Prefix optional' : `Prefix: ${state.prefix}`} · ${selected.cooldown ? `${selected.cooldown}s cooldown` : 'No command cooldown'}`))
      .addSeparatorComponents(separator());
    const sample = examples(selected, state.prefix);
    const usages = normalizeUsage(selected, state.prefix);
    container.addTextDisplayComponents(text(`### Try It\n${sample.slice(0, state.expanded ? 4 : 1).map(code).join('\n')}`));
    if (state.expanded) {
      container.addTextDisplayComponents(text(`### Full Syntax\n${usages.map(code).join('\n')}\n\n**Aliases**\n${aliases}`));
    } else if (selected.aliases.length) container.addTextDisplayComponents(text(`**Shortcuts**  ${aliases}`));
    container.addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`### Access\n**You:** ${selected.access}${selected.botAccess !== 'Everyone' ? `\n**Bot:** ${selected.botAccess}` : ''}${selected.premium ? `\n${icons.premium} Premium plan required` : ''}`));
    if (selected.prefixless) container.addTextDisplayComponents(text(`${icons.success} Also works without a prefix: ${code(selected.aliases[0] || selected.name)}`));
    if (selected.note) container.addTextDisplayComponents(text(`-# ${selected.note}`));
    container.addSeparatorComponents(separator()).addActionRowComponents(new ActionRowBuilder().addComponents(
      control('back', 'Back', icons.arrow), control('home', 'Home', icons.category), control('search', 'Search', icons.edit, ButtonStyle.Primary),
      control('expand', state.expanded ? 'Less' : 'Details', icons.utility), control('close', 'Close', icons.cross)));
    return payload(container);
  }
  if (state.tab === 'guide' && !state.query && !state.category) {
    container.addTextDisplayComponents(text(`## ${icons.system} Getting Started\nA few shortcuts to make Raymond work for your server.`)).addSeparatorComponents(separator());
    if (commands.some(command => command.name === 'setup')) card(container, `**1 · Configure Your Server**\nChoose roles and channels in one panel, then save your changes.`, 'open:setup', 'Setup', icons.system);
    if (commands.some(command => command.name === 'checker')) card(container, '**2 · Review a Member**\nCheck account age, join information and moderation status.', 'open:checker', 'Checker', icons.manager);
    if (commands.some(command => command.name === 'case')) card(container, '**3 · Staff Records**\nCases and moderator notes are delivered privately by DM.', 'open:case', 'Cases', icons.support);
    container.addTextDisplayComponents(text(`**Command basics**\n${code('<required>')} = provide a value · ${code('[optional]')} = you can leave it out.\nShortcuts marked **Prefix optional** work without ${code(state.prefix)}.`));
  } else if (state.query || state.category || state.tab === 'shortcuts') {
    const shortcuts = state.tab === 'shortcuts' && !state.query && !state.category;
    const listing = state.query ? searchCommands(commands, state.query, state.prefix) : shortcuts ? commands.filter(command => command.prefixless) : groupCommands(commands, state.category);
    const pages = Math.max(1, Math.ceil(listing.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page || 0, pages - 1));
    const page = listing.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
    const category = categories[state.category];
    container.addTextDisplayComponents(text(`## ${shortcuts ? icons.utility : category?.icon || icons.edit} ${shortcuts ? 'Quick Shortcuts' : category?.label || 'Find a Command'}\n${shortcuts ? 'These commands work without a prefix.' : state.query ? 'Choose a result to see how it works.' : category.description}\n-# ${listing.length} commands · Page ${state.page + 1} of ${pages}`))
      .addSeparatorComponents(separator());
    if (!page.length) container.addTextDisplayComponents(text(`**No matching commands**\nTry another name, alias, or category. You can search for topics such as verification, ranks, or emojis.`));
    for (const command of page) card(container,
      `**${shortcuts ? command.aliases[0] || command.name : command.name}**${shortcuts ? ` · ${command.name}` : command.prefixless ? ' · Prefix optional' : ''}\n${String(command.description || 'View usage and examples.').slice(0, 90)}`,
      `open:${command.name}`, 'View');
    container.addSeparatorComponents(separator());
    if (pages > 1) container.addActionRowComponents(new ActionRowBuilder().addComponents(
      control('prev', 'Previous', icons.arrow).setDisabled(state.page === 0), control('next', 'Next', icons.arrow).setDisabled(state.page === pages - 1)));
    container.addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId('help:category').setPlaceholder('Jump to another category...')
      .addOptions(visibleCategories.map(id => ({ label: categories[id].label, value: id, emoji: categories[id].icon, default: state.category === id })))));
  } else {
    state.page = 0;
    container.addTextDisplayComponents(text(`## ${icons.utility} Raymond · Command Center\nFind the right tool for your server. Pick a category or search by a command or shortcut.\n\n-# ${commands.length} commands · ${visibleCategories.length} categories · Prefix ${code(state.prefix)}`))
      .addSeparatorComponents(separator());
    for (const id of visibleCategories) card(container,
      `${categories[id].icon} **${categories[id].label}** · ${groupCommands(commands, id).length}\n${categories[id].description}`,
      `browse:${id}`, 'Explore', categories[id].icon);
    container.addSeparatorComponents(separator());
  }
  const nav = new ActionRowBuilder();
  if (state.tab || state.category || state.query) nav.addComponents(control('home', 'Home', icons.category));
  nav.addComponents(control('search', 'Search', icons.edit, ButtonStyle.Primary));
  if (state.tab !== 'shortcuts') nav.addComponents(control('shortcuts', 'Shortcuts', icons.utility));
  if (!state.tab && !state.category && !state.query) nav.addComponents(control('guide', 'Start Here', icons.system));
  nav.addComponents(control('close', 'Close', icons.cross));
  container.addActionRowComponents(nav).addTextDisplayComponents(text('-# This guide never runs a command. Only you can use this menu.'));
  return payload(container);
}
function selectQuery(state, commands, query) {
  state.query = query.trim().slice(0, 80); state.tab = null; state.expanded = false; state.page = 0; state.command = null; state.category = null;
  const found = resolveCommand(commands, state.query, state.prefix);
  if (found) {
    state.command = found.name; state.category = found.categoryId; state.query = '';
    state.page = Math.floor(groupCommands(commands, found.categoryId).findIndex(command => command.name === found.name) / PAGE_SIZE);
  }
}

module.exports = {
  name: 'help', aliases: ['h', 'commands'], description: 'Browse commands, shortcuts and server features in an interactive guide.',
  usage: 'help [command or topic]', category: 'Utility', guildOnly: true, cooldown: 3, prefixless: true,
  async execute(message, args = [], client = message.client) {
    const config = await getGuildConfig(message.guild.id);
    const state = { tab: null, expanded: false, prefix: config?.prefix || process.env.GLOBAL_PREFIX || '!', category: null, command: null, query: '', page: 0 };
    if (args.length) selectQuery(state, catalog(client, message.author.id), args.join(' '));
    const panel = await message.reply(asEmbed(renderHelp(state, message, client)));
    const collector = panel.createMessageComponentCollector({ time: 15 * 60_000, idle: 5 * 60_000,
      filter: interaction => interaction.customId.startsWith('help:') });
    let pending = Promise.resolve();
    collector.on('collect', interaction => {
      if (interaction.user.id !== message.author.id) {
        interaction.reply(asEmbed({ content: 'This help menu belongs to the person who opened it. Run help to open your own.', flags: 64 })).catch(() => {}); return;
      }
      const action = interaction._helpQuery != null ? 'query' : interaction.customId.slice(5);
      if (action === 'search') {
        const id = `help:search:${interaction.id}`;
        const input = new TextInputBuilder().setCustomId('query').setLabel('Command, alias, or topic').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)
          .setPlaceholder('Examples: se, verification, ranks');
        const submission = interaction.awaitModalSubmit({ time: 120_000, filter: modal => modal.customId === id && modal.user.id === message.author.id });
        interaction.showModal(new ModalBuilder().setCustomId(id).setTitle('Search Commands').addComponents(row(input))).catch(error => logger.error('Could not open help search:', error));
        submission.then(modal => {
          if (collector.ended) return modal.reply(asEmbed({ content: 'This help session has expired. Run help again.', flags: 64 })).catch(() => {});
          modal._helpQuery = modal.fields.getTextInputValue('query'); collector.emit('collect', modal);
        }).catch(() => {});
        return;
      }
      const acknowledgement = interaction.deferUpdate();
      pending = pending.then(async () => {
        await acknowledgement;
        if (collector.ended) return;
        if (action === 'close') { collector.stop('closed'); return; }
        const commands = catalog(client, message.author.id);
        if (action === 'query') selectQuery(state, commands, interaction._helpQuery);
        else if (action === 'home' || action === 'category' && interaction.values[0] === 'home') {
          state.category = null; state.command = null; state.query = ''; state.page = 0; state.tab = null; state.expanded = false;
        } else if (action === 'shortcuts' || action === 'guide') {
          state.category = null; state.command = null; state.query = ''; state.page = 0; state.tab = action; state.expanded = false;
        } else if (action.startsWith('browse:') || action === 'category') {
          const category = action === 'category' ? interaction.values[0] : action.slice(7);
          if (!Object.hasOwn(categories, category) || !groupCommands(commands, category).length) return;
          state.category = category; state.command = null; state.query = ''; state.page = 0; state.tab = null;
        } else if (action.startsWith('open:') || action === 'command') {
          const name = action === 'command' ? interaction.values[0] : action.slice(5);
          const found = commands.find(command => command.name === name);
          if (!found) return;
          state.command = found.name; state.expanded = false;
        } else if (action === 'expand') {
          state.expanded = !state.expanded;
        } else if (action === 'back') {
          const previous = commands.find(command => command.name === state.command);
          if (!state.tab && !state.category && !state.query && previous) state.category = previous.categoryId;
          state.command = null; state.expanded = false;
        } else if (action === 'prev' || action === 'next') {
          state.page = Math.max(0, state.page + (action === 'next' ? 1 : -1)); state.command = null;
        }
        if (!collector.ended) await panel.edit(renderHelp(state, message, client));
      }).catch(error => {
        logger.error('Help interaction failed:', error);
        interaction.followUp(asEmbed({ content: 'Could not update this page. Run help to open a new menu.', flags: 64 })).catch(() => {});
      });
      acknowledgement.catch(() => {});
    });
    collector.on('end', (_, reason) => {
      panel.edit(endHelp(state.prefix, reason === 'closed')).catch(() => {});
    });
  },
  renderHelp, selectQuery,
};
