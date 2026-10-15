const { PermissionsBitField: { Flags }, ChannelType } = require('discord.js');
const { modules, getValue } = require('./setupRegistry');

function validateSetup(name, settings, guild) {
  const definition = modules[name];
  if (!definition) throw new Error('Unknown setup module');
  if (definition.launcher) return { missing: [], errors: [], ready: true, launcher: true };
  if (name === 'auditlogs' && !settings?.enabled) return { missing: [], errors: [], ready: true, disabled: true };
  if (definition.collection && Array.isArray(settings)) {
    const results = settings.map(item => validateSetup(name, item, guild));
    const missing = results.flatMap(result => result.missing), errors = results.flatMap(result => result.errors);
    const identities = settings.map(item => JSON.stringify(definition.identity.map(key => item[key])));
    if (new Set(identities).size !== identities.length) errors.push('Duplicate entries found. Use one entry per target.');
    return { missing, errors, ready: !missing.length && !errors.length, inactive: !settings.length };
  }
  settings ||= {};
  const missing = [], errors = [];
  const bot = guild.members.me;
  if (name === 'auditlogs') {
    if (!bot?.permissions.has(Flags.ViewAuditLog)) errors.push('The bot needs View Audit Log to capture confirmed server actions.');
    const destinations = definition.fields.filter(field => field.kind === 'text').map(field => settings[field.key]).filter(Boolean);
    if (!destinations.length) missing.push('At least one logs channel');
    for (const id of destinations) {
      const channel = guild.channels.cache.get(id);
      if (guild.roles.everyone && channel?.permissionsFor(guild.roles.everyone)?.has(Flags.ViewChannel)) errors.push('Audit logs channels must be hidden from @everyone. Use a staff channel.');
    }
  }
  for (const permission of definition.permissions || []) {
    if (!bot?.permissions.has(Flags[permission])) errors.push(`The bot needs the ${permission} permission.`);
  }
  for (const field of definition.fields) {
    const value = getValue(settings, field.key);
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
      if (field.required) missing.push(field.label);
      continue;
    }
    if (field.kind === 'role' || field.kind === 'roles') {
      for (const id of (field.kind === 'roles' ? value : [value])) {
        const role = guild.roles.cache.get(id);
        if (!role) errors.push(`${field.label}: The role was deleted or does not exist.`);
        else if (role.id === guild.id || role.managed) errors.push(`${field.label}: Choose a regular role other than @everyone.`);
        else if (!field.staff && (!bot || bot.roles.highest.comparePositionTo(role) <= 0)) errors.push(`${field.label}: Move the bot role above this role.`);
      }
    } else if (['text', 'voice', 'category', 'statsVoice', 'channels', 'target'].includes(field.kind)) {
      if (field.kind === 'target' && settings.target_type === 'user') {
        if (!/^\d{17,20}$/.test(value)) errors.push('Choose a valid user.');
        continue;
      }
      const types = field.kind === 'channels' ? [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice]
        : field.kind === 'category' ? [ChannelType.GuildCategory]
        : ['voice', 'statsVoice'].includes(field.kind) ? [ChannelType.GuildVoice]
          : [ChannelType.GuildText, ChannelType.GuildAnnouncement];
      for (const id of (field.kind === 'channels' ? value : [value])) {
        const channel = guild.channels.cache.get(id);
        if (!channel || !types.includes(channel.type)) { errors.push(`${field.label}: Choose an existing channel of the correct type.`); continue; }
        const permissions = bot && channel.permissionsFor(bot);
        let required = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks];
        if (field.kind === 'channels') required = [Flags.ViewChannel];
        if (field.kind === 'category' || field.kind === 'statsVoice') required = [Flags.ViewChannel, Flags.ManageChannels];
        if (field.kind === 'voice') required = [Flags.ViewChannel, Flags.Connect, Flags.MoveMembers];
        if (name === 'tempvoice') required.push(Flags.ManageChannels);
        if (name === 'reactions') required = [Flags.ViewChannel, Flags.AddReactions, Flags.ReadMessageHistory];
        if (!permissions?.has(required)) errors.push(`${field.label}: The bot lacks the required channel permissions.`);
      }
    } else if (field.kind === 'number') {
      if (!Number.isFinite(Number(value)) || Number(value) < field.min || Number(value) > field.max || (field.integer && !Number.isInteger(Number(value)))) {
        errors.push(`${field.label}: Enter ${field.integer ? 'an integer' : 'a number'} between ${field.min} and ${field.max}.`);
      }
    } else if (field.kind === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`${field.label}: Choose Enable or Disable.`);
    } else if (field.kind === 'choice') {
      if (!field.options.includes(value)) errors.push(`${field.label}: Invalid selection.`);
    } else if (field.kind === 'color') {
      if (!Number.isInteger(value) || value < 0 || value > 0xffffff) errors.push('Enter a color such as #5865F2.');
    } else if (field.kind === 'invites') {
      if (!Array.isArray(value) || value.some(entry => !/^\d{17,20}$/.test(entry.guildId))) errors.push('The blocked server list is invalid.');
    } else if (field.kind === 'textInput') {
      if (typeof value !== 'string' || value.length > field.max || !value.trim()) errors.push(`${field.label}: Enter valid text with at most ${field.max} characters.`);
      if (field.url && !/^https?:\/\/[^\s]+$/i.test(value)) errors.push(`${field.label}: Enter a valid HTTP or HTTPS URL.`);
      if (field.emoji) {
        const custom = /^(?:<a?:\w+:\d{17,20}>|\d{17,20})$/.test(value);
        const unicode = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0F\u200D]|[\u{E0020}-\u{E007F}])+$/u.test(value)
          || /^[0-9#*]\uFE0F?\u20E3$/u.test(value);
        const single = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].length === 1;
        if (!custom && !(unicode && single)) errors.push('Enter one valid emoji.');
      }
    }
  }
  if (name === 'verification') {
    const ids = definition.fields.filter(field => field.kind === 'role').map(field => settings[field.key]).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push('Use a different role for each verification purpose.');
  }
  if (name === 'levels' && Number(settings.text_xp_max) < Number(settings.text_xp_min)) errors.push('Text XP Maximum must be greater than or equal to Minimum.');
  if (name === 'stats' && settings.member_count_channel_id && settings.member_count_channel_id === settings.voice_count_channel_id) errors.push('Choose a different channel for each counter.');
  if (name === 'automod') {
    if (settings.spamDetectionEnabled && !bot?.permissions.has(Flags.ManageRoles)) errors.push('Anti-Spam requires Manage Roles.');
    if (settings.autobanBlacklist?.length && !bot?.permissions.has(Flags.BanMembers)) errors.push('AutoBan requires Ban Members.');
  }
  return { missing, errors, ready: !missing.length && !errors.length };
}
function setupStatus(result) {
  return result.launcher ? '🛠️ Interactive Designer' : result.disabled ? '➖ Disabled' : result.inactive ? '➖ No Rules' : result.ready ? '✅ Ready' : result.errors.length ? '<a:warningbug:1467300628907954300> Needs Attention' : '🟡 Incomplete';
}
module.exports = { modules, validateSetup, setupStatus };
