const { asEmbed } = require('../../utils/responses');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, MessageFlags,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField,
} = require('discord.js');
const { modules, validateSetup, setupStatus } = require('../../services/setupValidation');
const { getValue, setValue, defaults } = require('../../services/setupRegistry');
const { readSetupSettings, saveSetupSettings } = require('../../database/setupSettings');
const { isBotOwner, authorizeCommand } = require('../../handlers/commandAuthorization');
const { hasStellarOrHigher } = require('../../premium/premium');
const logger = require('../../utils/logger');
const emojis = require('../../config/setupEmojis');
const { routes: auditRoutes } = require('../../services/auditRoutes');
const auditProvisioning = require('../../services/auditProvisioning');

const sessions = new Map();
const PAGE_SIZE = 10;
const row = component => new ActionRowBuilder().addComponents(component);
const button = (id, label, style = ButtonStyle.Secondary) => {
  const component = new ButtonBuilder().setCustomId(`setup:${id}`).setLabel(label).setStyle(style);
  const icon = ['save', 'done'].includes(id) ? emojis.success : ['edit', 'launch'].includes(id) ? emojis.edit
    : ['back', 'items', 'next', 'prev'].includes(id) ? emojis.arrow
      : ['cancel', 'remove', 'clear'].includes(id) ? emojis.cross : id === 'section:all' ? emojis.category : null;
  return icon ? component.setEmoji(icon) : component;
};
const channelsFor = kind => kind === 'channels' ? [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice]
  : kind === 'category' ? [ChannelType.GuildCategory]
  : ['voice', 'statsVoice'].includes(kind) ? [ChannelType.GuildVoice] : [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const activeDraft = state => modules[state.module]?.collection ? state.draft[state.item] : state.draft;
const short = value => String(value).slice(0, 180);
function display(field, value) {
  if (value == null || value === '' || Array.isArray(value) && !value.length) return 'Not set';
  if (field.kind === 'boolean') return value ? `${emojis.success} Enabled` : `${emojis.cross} Disabled`;
  if (field.kind === 'role') return `<@&${value}>`;
  if (field.kind === 'roles') return value.map(id => `<@&${id}>`).join(' ').slice(0, 500);
  if (['text', 'voice', 'category', 'statsVoice'].includes(field.kind)) return `<#${value}>`;
  if (field.kind === 'channels') return value.map(id => `<#${id}>`).join(' ').slice(0, 500);
  if (field.kind === 'invites') return `${value.length} servers: ${short(value.map(entry => entry.name || entry.guildId).join(', '))}`;
  if (field.kind === 'color') return `#${Number(value).toString(16).padStart(6, '0')}`;
  return short(value);
}
function itemLabel(name, item, index) {
  if (name === 'tempvoice') return item.config_name || `TempVoice ${index + 1}`;
  if (name === 'rewards') return `${item.ladder} • Level ${item.level}`;
  if (name === 'reactions') return `${item.target_type} • ${item.target_id || 'New target'} • ${item.emoji || ''}`;
  return `Entry ${index + 1}`;
}
const sections = {
  safety: { label: 'Safety', icon: emojis.manager, names: ['verification', 'jail', 'automod'] },
  community: { label: 'Community', icon: emojis.support, names: ['autorole', 'tempvoice', 'applications', 'modmail'] },
  engagement: { label: 'Engagement', icon: emojis.utility, names: ['levels', 'rewards', 'reactions', 'rolemenus'] },
  server: { label: 'Server', icon: emojis.system, names: ['auditlogs', 'stats', 'embeds', 'general'] },
};
function featureStatus(name, state, guild) {
  if (modules[name].premium && state.premium === false) return { icon: emojis.premium, label: 'Premium', status: 'Requires Stellar Matrix' };
  const result = validateSetup(name, state.settings[name], guild);
  if (result.disabled) return { icon: emojis.cross, label: 'Disabled', status: 'Enable after choosing a staff logs channel' };
  if (result.launcher) return { icon: emojis.designer, label: 'Designer', status: 'Open the interactive designer' };
  if (result.inactive) return { icon: emojis.category, label: 'No entries', status: 'Add your first entry' };
  if (result.errors.length) return { icon: emojis.warning, label: 'Needs attention', status: 'Check roles or permissions' };
  if (result.missing.length) return { icon: emojis.warning, label: 'Incomplete', status: `${result.missing.length} required fields missing` };
  return { icon: emojis.success, label: 'Ready', status: 'Settings are ready' };
}
function fieldGroup(field) {
  if (['role', 'roles'].includes(field.kind)) return 'Role Assignments';
  if (['text', 'voice', 'statsVoice', 'category', 'channels', 'target'].includes(field.kind)) return 'Channels & Access';
  if (field.kind === 'number') return 'Values & Limits';
  if (['boolean', 'choice'].includes(field.kind)) return 'Preferences';
  return 'Appearance & Messages';
}
const textDisplay = content => new TextDisplayBuilder().setContent(content);
const separator = () => new SeparatorBuilder().setDivider(true);
const payload = container => ({ flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } });
function card(container, content, id, label, icon = emojis.arrow) {
  container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(textDisplay(content))
    .setButtonAccessory(button(id, label).setEmoji(icon)));
}
const featureDescriptions = {
  auditlogs: 'Keep staff informed with dedicated event logs.', verification: 'Choose verification roles and your staff access.',
  jail: 'Set the jail role and optional voice channel.', automod: 'Manage anti-spam and blocked server invites.',
  autorole: 'Welcome members with a join role and logs.', tempvoice: 'Build and manage join-to-create voice channels.',
  applications: 'Choose application reviewers and staff roles.', modmail: 'Connect members with your support team.',
  levels: 'Tune XP, voice eligibility and level-up announcements.', rewards: 'Give members roles when they reach a level.',
  reactions: 'Create automatic reactions for users or channels.', rolemenus: 'Design self-service role menus.',
  stats: 'Display live member and voice counters.', embeds: 'Customize message colors and footer details.', general: 'Choose the command prefix for this server.',
};
function renderPanel(state, guild) {
  const container = new ContainerBuilder().setAccentColor(0x8594F0);
  if (!state.module) {
    const available = Object.keys(modules).filter(name => state.access?.[name] !== false);
    const statuses = Object.fromEntries(available.map(name => [name, featureStatus(name, state, guild)]));
    const ready = available.filter(name => statuses[name].label === 'Ready').length;
    const attention = available.filter(name => ['Needs attention', 'Incomplete'].includes(statuses[name].label)).length;
    const section = sections[state.section];
    container.addTextDisplayComponents(textDisplay(`## ${section?.icon || emojis.system} ${section ? section.label : 'Raymond · Server Setup'}\n${section ? 'Choose a feature to review its settings.' : 'Everything your server needs, organized in one place.'}\n-# ${String(guild.name || 'Your Server').replace(/[\n\r]/g, ' ').slice(0, 100)} · ${ready} ready · ${attention} to review`));
    if (state.notice) container.addTextDisplayComponents(textDisplay(state.notice));
    container.addSeparatorComponents(separator());
    if (section) {
      for (const name of section.names.filter(name => available.includes(name))) {
        const status = statuses[name];
        card(container, `**${modules[name].label}**\n${featureDescriptions[name]}\n-# ${status.icon} ${status.label}`, `module:${name}`, 'Configure');
      }
    } else {
      for (const [key, group] of Object.entries(sections)) {
        const names = group.names.filter(name => available.includes(name));
        if (!names.length) continue;
        card(container, `${group.icon} **${group.label}** · ${names.length} features\n${names.map(name => modules[name].label).join(' · ')}`, `section:${key}`, 'Explore', group.icon);
      }
    }
    const names = section ? section.names.filter(name => available.includes(name)) : available;
    container.addSeparatorComponents(separator()).addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId('setup:module')
      .setPlaceholder(section ? 'Configure a feature...' : 'Jump to a feature...')
      .addOptions(names.map(name => ({ label: modules[name].label, value: name, description: statuses[name].status, emoji: statuses[name].icon })))));
    const navigation = new ActionRowBuilder();
    if (section) navigation.addComponents(button('section:all', 'Home').setEmoji(emojis.category));
    navigation.addComponents(button('cancel', 'Close').setEmoji(emojis.cross));
    container.addActionRowComponents(navigation).addTextDisplayComponents(textDisplay('-# Only you can use this panel · 5 minutes idle / 15 minutes total'));
    return payload(container);
  }
  const definition = modules[state.module];
  container.addTextDisplayComponents(textDisplay(`## ${emojis.system} ${definition.label}\n${featureDescriptions[state.module]}`));
  if (state.notice) container.addTextDisplayComponents(textDisplay(state.notice));
  container.addSeparatorComponents(separator());
  if (state.module === 'auditlogs' && state.auditWizard) {
    const wizard = state.auditWizard;
    container.addTextDisplayComponents(textDisplay(`### Create Detailed Logs\nChoose a category. New channels are private to Administrators, you, the bot and the staff roles selected below.\n\n**Category:** ${wizard.categoryId ? `<#${wizard.categoryId}>` : 'Choose below'}\n**Staff roles:** ${wizard.staffRoleIds.length ? wizard.staffRoleIds.map(id=>`<@&${id}>`).join(' ') : 'Administrators only (plus you and the bot)'}`));
    container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId('setup:audit-category').setChannelTypes(ChannelType.GuildCategory).setPlaceholder('Choose the logs category').setMinValues(1).setMaxValues(1)),
      row(new RoleSelectMenuBuilder().setCustomId('setup:audit-staff').setPlaceholder('Optional staff roles (up to 5)').setMinValues(0).setMaxValues(5)));
    if (wizard.preview) {
      container.addTextDisplayComponents(textDisplay(`### ${wizard.preview.createCount} to Create · ${wizard.preview.reuseCount} to Reuse\n${wizard.preview.items.map(item=>`${item.channelId ? `Reuse <#${item.channelId}>` : `Create \`#${item.name}\``} · ${item.label}`).join('\n')}\n\nThis creates channels and **saves the current Audit Logs draft immediately**, with logging enabled. Message capture and optional voice-state capture keep your draft preferences. Existing category/channel permissions are not changed. Reused channels keep their access settings.`));
    } else container.addTextDisplayComponents(textDisplay(`-# ${auditRoutes.length} detailed routes · Existing linked channels can be reused · No changes until confirmation`));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(button('audit-review','Review Channels',ButtonStyle.Primary).setDisabled(!wizard.categoryId),
      button('audit-create','Create & Save',ButtonStyle.Success).setDisabled(!wizard.preview),button('audit-return','Back'),button('cancel','Close')));
    return payload(container);
  }
  if (state.module === 'auditlogs' && state.auditRouteEditor) {
    const selected = auditRoutes.find(route=>route.key===state.auditRouteEditor) || auditRoutes[0];
    const id=selected.key==='general' ? state.draft.defaultChannelId || state.draft.routes?.general : state.draft.routes?.[selected.key];
    container.addTextDisplayComponents(textDisplay(`### Detailed Routes\nChoose an event type, then its staff channel.\n\n**${selected.label}**\n${id ? `<#${id}>` : 'Uses the category or general fallback.'}\n-# Changes stay in this draft until Save Changes.`));
    container.addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId('setup:audit-route').setPlaceholder('Choose a detailed event type').addOptions(auditRoutes.map(route=>({label:route.label,value:route.key,default:route.key===selected.key})))),
      row(new ChannelSelectMenuBuilder().setCustomId('setup:audit-route-channel').setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setPlaceholder('Choose a private logs channel').setMinValues(1).setMaxValues(1)),
      new ActionRowBuilder().addComponents(button('audit-route-clear',selected.key==='general'?'Clear General Channel':'Use Fallback').setDisabled(!id),button('audit-return','Back'),button('cancel','Close')));
    return payload(container);
  }
  if (definition.launcher) {
    container.addTextDisplayComponents(textDisplay('### Interactive Designer\nChoose roles, customize your menu, and preview it before publishing.'))
      .addActionRowComponents(new ActionRowBuilder().addComponents(button('launch', 'Open Designer', ButtonStyle.Primary), button('back', 'Back'), button('cancel', 'Close')));
    return payload(container);
  }
  const draft = activeDraft(state);
  const result = validateSetup(state.module, draft || state.draft, guild);
  const status = setupStatus(result).replace(/^✅/, emojis.success).replace(/^🟡/, emojis.warning).replace(/^🛠️/, emojis.edit).replace(/^➖/, emojis.category);
  container.addTextDisplayComponents(textDisplay([status, result.missing.length ? `**Required:** ${result.missing.join(', ')}` : '', ...result.errors.slice(0, 4).map(error => `• ${error}`)].filter(Boolean).join('\n')));
  if (definition.collection && state.item == null) {
    const pages = Math.max(1, Math.ceil(state.draft.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page || 0, pages - 1));
    const start = state.page * PAGE_SIZE, items = state.draft.slice(start, start + PAGE_SIZE);
    container.addSeparatorComponents(separator()).addTextDisplayComponents(textDisplay(`### Entries · ${state.draft.length}\n${items.length ? items.map((item, i) => `**${start + i + 1}.** ${short(itemLabel(state.module, item, start + i))}`).join('\n') : 'No entries yet. Choose **Add New** to get started.'}\n\n-# Page ${state.page + 1} of ${pages} · Draft changes are saved together`));
    const options = items.map((item, i) => ({ label: short(itemLabel(state.module, item, start + i)).slice(0, 100), value: String(start + i) }));
    options.push({ label: 'Add New', value: 'new', emoji: emojis.edit });
    container.addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId('setup:item').setPlaceholder('Choose an entry or add a new one').addOptions(options)));
    if (pages > 1) container.addActionRowComponents(new ActionRowBuilder().addComponents(button('prev', 'Previous').setDisabled(state.page === 0), button('next', 'Next').setDisabled(state.page === pages - 1)));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(button('save', 'Save Changes', ButtonStyle.Success).setDisabled(!result.ready), button('back', 'Back'), button('cancel', 'Close')))
      .addTextDisplayComponents(textDisplay('-# Save applies this list · Back or Close discards unsaved changes'));
    return payload(container);
  }
  const field = definition.fields.find(item => item.key === state.field) || definition.fields[0];
  state.field = field.key;
  const group = fieldGroup(field);
  const related = definition.fields.filter(item => fieldGroup(item) === group && item.key !== field.key);
  container.addSeparatorComponents(separator()).addTextDisplayComponents(textDisplay(`### ${emojis.edit} ${field.label}\n${display(field, getValue(draft, field.key))}\n\n-# ${field.required ? 'Required' : 'Optional'} · ${definition.collection ? 'Entry draft' : 'Unsaved draft'} · Field ${definition.fields.indexOf(field) + 1} of ${definition.fields.length}`));
  const components = [row(new StringSelectMenuBuilder().setCustomId('setup:field').setPlaceholder('Choose a setting to edit...')
    .addOptions(definition.fields.map(item => ({ label: item.label, value: item.key, description: `${fieldGroup(item)} · ${item.required ? 'Required' : 'Optional'}`, default: item.key === field.key }))))];
  let selector;
  if (field.kind === 'role' || field.kind === 'roles') selector = new RoleSelectMenuBuilder();
  else if (field.kind === 'target' && draft.target_type === 'user') selector = new UserSelectMenuBuilder();
  else if (['text', 'voice', 'category', 'statsVoice', 'channels', 'target'].includes(field.kind)) selector = new ChannelSelectMenuBuilder().setChannelTypes(channelsFor(field.kind));
  else if (field.kind === 'boolean' || field.kind === 'choice') selector = new StringSelectMenuBuilder().addOptions(
    field.kind === 'boolean' ? [{ label: 'Enable', value: 'true', default: getValue(draft, field.key) === true }, { label: 'Disable', value: 'false', default: getValue(draft, field.key) === false }]
      : field.options.map(value => ({ label: value, value, default: getValue(draft, field.key) === value })));
  if (selector) {
    selector.setCustomId('setup:value').setPlaceholder(`Choose ${field.label}`).setMinValues(1).setMaxValues(['roles', 'channels'].includes(field.kind) ? 25 : 1);
    components.push(row(selector));
  } else components.push(row(button('edit', 'Edit Value', ButtonStyle.Primary)));
  container.addActionRowComponents(...components);
  if (state.module === 'auditlogs') container.addActionRowComponents(new ActionRowBuilder().addComponents(
    button('audit-wizard','Create Logs Channels',ButtonStyle.Primary),button('audit-routes','Detailed Routes')));
  if (related.length) container.addTextDisplayComponents(textDisplay(`### ${group}\n${related.map(item => `**${item.label}** · ${display(item, getValue(draft, item.key))}`).join('\n')}`));
  const controls = new ActionRowBuilder().addComponents(
    button(definition.collection ? 'done' : 'save', definition.collection ? 'Done' : 'Save Changes', ButtonStyle.Success).setDisabled(!result.ready),
    button(definition.collection ? 'items' : 'back', definition.collection ? 'Back to List' : 'Back'));
  if (!field.required) controls.addComponents(button('clear', 'Clear Selection'));
  if (definition.collection) controls.addComponents(button('remove', 'Remove Entry', ButtonStyle.Danger));
  if (state.module === 'levels') controls.addComponents(button('preview', 'Card Preview').setEmoji(emojis.designer));
  controls.addComponents(button('cancel', 'Close'));
  container.addSeparatorComponents(separator()).addActionRowComponents(controls)
    .addTextDisplayComponents(textDisplay(definition.collection ? '-# Done returns to the list · Save Changes on the list applies all entries' : '-# Save applies this feature · Back or Close discards unsaved changes'));
  return payload(container);
}

async function parseInput(field, value, client, original) {
  value = value.trim();
  if (field.kind === 'number') return value === '' ? NaN : Number(value);
  if (field.kind === 'color') {
    if (!/^#?[\da-f]{6}$/i.test(value)) throw new Error('Enter a color such as #5865F2.');
    return parseInt(value.replace('#', ''), 16);
  }
  if (field.kind === 'invites') {
    // Existing IDs can be retained; new entries must resolve through a valid invite.
    const values = value.split(/[\s,]+/).filter(Boolean), entries = [];
    if (values.length > 30) throw new Error('You can configure up to 30 servers at a time.');
    for (const input of values) {
      const existing = original?.find(entry => entry.guildId === input);
      if (existing) entries.push(existing);
      else {
        const code = input.replace(/^https?:\/\//i, '').replace(/^(?:www\.)?discord\.(?:gg\/|com\/invite\/)/i, '');
        const invite = await client.fetchInvite(code);
        if (!invite.guild) throw new Error('Could not resolve a server from one of the invite links.');
        entries.push({ guildId: invite.guild.id, name: invite.guild.name });
      }
    }
    return [...new Map(entries.map(entry => [entry.guildId, entry])).values()];
  }
  return value || null;
}

module.exports = {
  name: 'setup', description: 'Configure server features from one interactive panel.', category: 'Admin', guildOnly: true,
  permissions: [PermissionsBitField.Flags.Administrator], usage: 'setup',
  async execute(message, args = []) {
    const key = `${message.guild.id}:${message.author.id}`, previous = sessions.get(key);
    if (previous) return message.reply(asEmbed({ content: `You already have an open panel: ${previous.url}`, allowedMentions: { parse: [] } }));
    sessions.set(key, { url: message.url });
    try {
      await Promise.all([message.guild.roles.fetch(), message.guild.channels.fetch(), message.guild.members.fetchMe()]);
      const owner = isBotOwner(message.author.id), premium = await hasStellarOrHigher(message.guild.id);
      const access = Object.fromEntries(Object.entries(modules).map(([name, definition]) => [name, !definition.ownerOnly || owner]));
      const state = { settings: await readSetupSettings(message.guild.id), module: null, notice: '', access, premium };
      if (['levels','auditlogs'].includes(args[0])) {
        state.module = args[0]; state.original = structuredClone(state.settings[state.module]); state.draft = structuredClone(state.original);
        state.field = modules[state.module].fields[0].key; state.item = null;
      }
      const panel = await message.reply(asEmbed(renderPanel(state, message.guild)));
      sessions.set(key, panel);
      const collector = panel.createMessageComponentCollector({ time: 15 * 60_000, idle: 5 * 60_000, filter: interaction => interaction.customId.startsWith('setup:') });
      let pending = Promise.resolve();
      async function permitted(name) {
        const member = await message.guild.members.fetch({ user: message.author.id, force: true });
        const currentOwner = isBotOwner(member.id);
        if (!currentOwner && !member.permissions.has(PermissionsBitField.Flags.Administrator)) { collector.stop('permission'); return false; }
        if (name && modules[name].ownerOnly && !currentOwner) return false;
        if (name && modules[name].premium && !(await hasStellarOrHigher(message.guild.id))) return false;
        return true;
      }
      collector.on('collect', interaction => {
        if (interaction.user.id !== message.author.id) {
          interaction.reply(asEmbed({ content: 'Only the person who opened this panel can use it. Run setup to open your own panel.', flags: 64 })).catch(() => {}); return;
        }
        const action = interaction._setupInput ? 'input' : interaction.customId.slice('setup:'.length);
        if (action === 'edit') {
          const draft = activeDraft(state), name = state.module;
          const field = modules[name]?.fields.find(item => item.key === state.field);
          if (!draft || !field) return;
          const current = getValue(draft, field.key);
          const value = field.kind === 'invites' ? (current || []).map(entry => entry.guildId).join('\n')
            : field.kind === 'color' && current != null ? display(field, current) : current == null ? '' : String(current);
          const modalId = `setup:modal:${interaction.id}`;
          // Numeric bounds limit the value, not the number of characters Discord accepts.
          const inputLength = field.kind === 'number' ? 32 : field.kind === 'color' ? 7 : Math.min(field.max || 100, 4000);
          const input = new TextInputBuilder().setCustomId('value').setLabel(field.label).setStyle(field.kind === 'invites' || inputLength > 500 ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(Boolean(field.required)).setMaxLength(inputLength);
          if (value) input.setValue(value.slice(0, inputLength));
          const submission = interaction.awaitModalSubmit({ time: 120_000, filter: modal => modal.customId === modalId && modal.user.id === message.author.id });
          interaction.showModal(new ModalBuilder().setCustomId(modalId).setTitle(`Edit ${field.label}`.slice(0, 45)).addComponents(row(input)))
            .catch(error => logger.error('Failed to show setup modal:', error));
          submission.then(modal => {
            modal._setupInput = { draft, name, field, value: modal.fields.getTextInputValue('value') };
            if (collector.ended) modal.reply(asEmbed({ content: 'This panel has expired. Run setup again.', flags: 64 })).catch(() => {});
            else collector.emit('collect', modal);
          }).catch(() => {});
          return;
        }
        const acknowledgement = interaction.deferUpdate();
        pending = pending.then(async () => {
          await acknowledgement;
          if (collector.ended) return;
          if (!(await permitted(['back', 'cancel'].includes(action) ? null : state.module))) {
            if (!collector.ended) await interaction.followUp(asEmbed({ content: 'This feature requires the appropriate permissions or an active Premium plan.', flags: 64 }));
            return;
          }
          state.notice = '';
          if (action === 'cancel') { collector.stop('cancel'); return; }
          if (action.startsWith('section:') && !state.module) {
            const section = action.slice('section:'.length);
            if (section === 'all' || Object.hasOwn(sections, section)) state.section = section === 'all' ? null : section;
          } else if (action === 'module' || action.startsWith('module:')) {
            const name = action === 'module' ? interaction.values[0] : action.slice('module:'.length);
            if (!Object.hasOwn(modules, name)) return;
            if (!(await permitted(name))) { await interaction.followUp(asEmbed({ content: 'This feature requires the bot owner or a Stellar Matrix plan, depending on its access requirements.', flags: 64 })); return; }
            state.settings = await readSetupSettings(message.guild.id);
            state.module = name; state.original = structuredClone(state.settings[name]); state.draft = structuredClone(state.original);
            state.auditWizard = null; state.auditRouteEditor = null;
            state.field = modules[name].fields[0]?.key; state.item = null; state.page = 0;
          } else if (action === 'back') {
            state.module = null; state.settings = await readSetupSettings(message.guild.id);
          } else if (state.module) {
            const definition = modules[state.module];
            let draft = activeDraft(state);
            if (state.module === 'auditlogs' && action.startsWith('audit-')) {
              if (action === 'audit-wizard') { state.auditWizard={categoryId:null,staffRoleIds:[],preview:null};state.auditRouteEditor=null; }
              else if(action === 'audit-routes') {state.auditRouteEditor=auditRoutes[0].key;state.auditWizard=null;}
              else if(action === 'audit-return') {state.auditWizard=null;state.auditRouteEditor=null;}
              else if(action === 'audit-category' && state.auditWizard) {state.auditWizard.categoryId=interaction.values[0];state.auditWizard.preview=null;}
              else if(action === 'audit-staff' && state.auditWizard) {state.auditWizard.staffRoleIds=interaction.values;state.auditWizard.preview=null;}
              else if(action === 'audit-route' && state.auditRouteEditor && auditRoutes.some(route=>route.key===interaction.values[0])) state.auditRouteEditor=interaction.values[0];
              else if(action === 'audit-route-channel' && state.auditRouteEditor) {state.draft.routes ||= {};state.draft.routes[state.auditRouteEditor]=interaction.values[0];if(state.auditRouteEditor==='general')state.draft.defaultChannelId=interaction.values[0];}
              else if(action === 'audit-route-clear' && state.auditRouteEditor) {if(state.draft.routes)delete state.draft.routes[state.auditRouteEditor];if(state.auditRouteEditor==='general')state.draft.defaultChannelId=null;}
              else if(action === 'audit-review' && state.auditWizard) {
                await Promise.all([message.guild.channels.fetch(),message.guild.roles.fetch(),message.guild.members.fetchMe()]);
                state.auditWizard.preview=auditProvisioning.plan(message.guild,{...state.auditWizard,actorId:message.author.id,config:state.draft});
              } else if(action === 'audit-create' && state.auditWizard?.preview) {
                state.auditCreating=true;
                try {
                  const result=await auditProvisioning.create(message.guild,{...state.auditWizard,actorId:message.author.id,config:structuredClone(state.draft),
                    authorized:async()=>!collector.ended && await permitted('auditlogs'),
                    persist:async config=>{
                      const checked=validateSetup('auditlogs',config,message.guild);
                      if(!checked.ready)throw Object.assign(new Error(`Could not save: ${[...checked.errors,...checked.missing].slice(0,3).join(' ')}`),{auditProvisioning:true});
                      return saveSetupSettings(message.guild.id,'auditlogs',config,state.original);
                    }});
                  state.original=structuredClone(result.config);state.draft=structuredClone(result.config);state.settings.auditlogs=structuredClone(result.config);
                  state.auditWizard=null;
                  state.notice=`${emojis.success} Detailed logs saved · ${result.created} channels created · ${result.reused} reused. Use logs test all to check delivery.`;
                } finally {state.auditCreating=false;}
              }
              if(!collector.ended)await panel.edit(renderPanel(state,message.guild));
              return;
            }
            if (action === 'launch' && definition.launcher) {
              const command = message.client.commands.get(definition.launcher.command);
              if (!command) throw new Error('Setup editor is unavailable');
              const authorization = authorizeCommand(command, message);
              if (!authorization.allowed) { await interaction.followUp(asEmbed({ content: authorization.message, flags: 64 })); return; }
              collector.stop('launch');
              await command.execute(message, definition.launcher.args, message.client);
              return;
            }
            if (action === 'preview' && state.module === 'levels') {
              const { generateRankCard } = require('../../utils/canvasRankCard');
              const { AttachmentBuilder } = require('discord.js');
              const member = await message.guild.members.fetch(message.author.id);
              const buffer = await generateRankCard({ text_level: 10, text_xp: 18400, text_next_level_xp: 46000 }, member, 'text', 1);
              await interaction.followUp({ files: [new AttachmentBuilder(buffer, { name: 'rank-preview.png' })], flags: 64 });
              return;
            }
            if (action === 'item' && definition.collection) {
              if (interaction.values[0] === 'new') { state.draft.push(defaults(definition)); state.item = state.draft.length - 1; }
              else { const index = Number(interaction.values[0]); if (!Number.isInteger(index) || !state.draft[index]) return; state.item = index; }
              state.field = definition.fields[0].key;
            } else if (action === 'next' || action === 'prev') state.page = Math.max(0, (state.page || 0) + (action === 'next' ? 1 : -1));
            else if (action === 'items' || action === 'done') state.item = null;
            else if (action === 'remove' && definition.collection && state.item != null) { state.draft.splice(state.item, 1); state.item = null; state.page = 0; }
            else if (action === 'field' && definition.fields.some(field => field.key === interaction.values[0])) state.field = interaction.values[0];
            else if (action === 'value' && draft) {
              const field = definition.fields.find(item => item.key === state.field);
              const value = field.kind === 'boolean' ? interaction.values[0] === 'true'
                : ['roles', 'channels'].includes(field.kind) ? interaction.values : interaction.values[0];
              setValue(draft, state.field, value);
              if(state.module==='auditlogs' && state.field==='defaultChannelId' && draft.routes?.general)draft.routes.general=value;
              if (state.module === 'reactions' && state.field === 'target_type') draft.target_id = null;
            } else if (action === 'input') {
              const input = interaction._setupInput;
              if (input.name !== state.module || input.draft !== draft) { await interaction.followUp(asEmbed({ content: 'The page has changed. Open the field again.', flags: 64 })); return; }
              const value = await parseInput(input.field, input.value, message.client, getValue(draft, input.field.key));
              setValue(draft, input.field.key, value);
            } else if (action === 'clear' && draft) {
              const field = definition.fields.find(item => item.key === state.field);
              if (!field.required) setValue(draft, field.key, ['roles', 'channels', 'invites'].includes(field.kind) ? [] : field.kind === 'boolean' ? false : null);
              if(state.module==='auditlogs' && field.key==='defaultChannelId' && draft.routes)delete draft.routes.general;
            } else if (action === 'save') {
              await Promise.all([message.guild.roles.fetch(), message.guild.channels.fetch(), message.guild.members.fetchMe()]);
              if (collector.ended || !(await permitted(state.module))) return;
              const result = validateSetup(state.module, state.draft, message.guild);
              if (result.ready) {
                const saved = await saveSetupSettings(message.guild.id, state.module, state.draft, state.original);
                if (saved) { state.notice = `${emojis.success} ${definition.label} settings saved.`; state.settings = await readSetupSettings(message.guild.id); state.module = null; }
                else state.notice = `${emojis.warning} Settings have changed since you opened this page. Go back and reopen the feature before saving.`;
              }
            }
          }
          if (!collector.ended) await panel.edit(renderPanel(state, message.guild));
        }).catch(async error => {
          logger.error('Setup panel interaction failed:', error);
          if(error.auditProvisioning && !collector.ended) {
            if(state.auditWizard)state.auditWizard.preview=null;
            state.notice=`${emojis.warning} ${String(error.message).slice(0,1400)}`;
            await panel.edit(renderPanel(state,message.guild)).catch(()=>{});
            return;
          }
          if (!collector.ended) await interaction.followUp(asEmbed({ content: 'Could not complete this action. Check the value and try again. Reopen the feature to verify its saved settings.', flags: 64 })).catch(() => {});
        });
        acknowledgement.catch(() => {});
      });
      collector.on('end', (_, reason) => {
        sessions.delete(key);
        const command = (message.content?.trim().split(/\s+/)[0] || 'setup').replace(/`/g, '').slice(0, 40);
        const title = reason === 'permission' ? 'Access Changed' : reason === 'launch' ? 'Designer Opened'
          : reason === 'cancel' ? 'Panel Closed' : 'Session Expired';
        const icon = reason === 'permission' ? emojis.warning : reason === 'launch' ? emojis.designer
          : reason === 'cancel' ? emojis.cross : emojis.category;
        const description = reason === 'permission' ? 'This session ended because you no longer have Administrator permission.'
          : reason === 'launch' ? 'Continue setting up your role menu in the interactive designer.'
            : reason === 'cancel' ? 'Your setup session has been closed.' : 'This setup session has timed out.';
        const container = new ContainerBuilder().setAccentColor(reason === 'permission' ? 0xE9B76A : 0x8594F0)
          .addTextDisplayComponents(textDisplay(`## ${icon} ${title}\n${description}${reason === 'launch' ? '' : `\n\nUnsaved changes were discarded.${state.auditCreating ? '\nAny channels already created are retained. Reopen Audit Logs to finish linking them.' : ''}\nRun \`${command}\` to open a new panel.`}`))
          .addTextDisplayComponents(textDisplay('-# Server Setup · Session ended'));
        panel.edit(payload(container)).catch(() => {});
      });
    } catch (error) {
      sessions.delete(key); logger.error('Failed to open setup panel:', error);
      await message.reply(asEmbed('Could not open the setup panel. Check the bot permissions and try again.'));
    }
  },
  renderPanel, parseInput,
};
