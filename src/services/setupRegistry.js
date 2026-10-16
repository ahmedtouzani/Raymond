const role = (key, label, required = false, extra = {}) => ({ key, label, kind: 'role', required, ...extra });
const channel = (key, label, kind = 'text', required = false) => ({ key, label, kind, required });
const text = (key, label, max = 100, extra = {}) => ({ key, label, kind: 'textInput', max, ...extra });
const number = (key, label, value, min, max, integer = true) => ({ key, label, kind: 'number', default: value, min, max, integer });
const boolean = (key, label, value = false) => ({ key, label, kind: 'boolean', default: value });
const choice = (key, label, options, value) => ({ key, label, kind: 'choice', options, default: value });

const modules = {
  auditlogs: { label: 'Audit Logs', jsonKey: 'auditLogs', fields: [
    boolean('enabled', 'Enable Audit Logs'), channel('defaultChannelId', 'General Logs Channel'),
    channel('moderationChannelId', 'Moderation Logs'), channel('messagesChannelId', 'Message Logs'),
    channel('membersChannelId', 'Member Logs'), channel('serverChannelId', 'Server / Roles / Channels Logs'), channel('voiceChannelId', 'Voice Logs'),
    boolean('captureMessageContent', 'Include Message Text / Attachment Names'), boolean('captureVoiceStates', 'Include Voice Mute / Deafen / Stream Changes'),
    { key: 'ignoredChannels', label: 'Ignored Channels', kind: 'channels', default: [] },
  ] },
  verification: { label: 'Verification', jsonKey: 'verification', permissions: ['ManageRoles'], fields: [
    role('unverifiedRoleId', 'Unverified Role', true), role('verifiedRoleId', 'Verified Role', true),
    role('boyRoleId', 'Boy Role', true), role('girlRoleId', 'Girl Role', true),
    role('verificatorRoleId', 'Verificator Role', false, { staff: true }), channel('logChannelId', 'Logs Channel'),
  ] },
  jail: { label: 'Jail', table: 'jail_settings', permissions: ['ManageRoles'], fields: [
    role('jail_role_id', 'Jail Role', true), channel('jail_voice_channel_id', 'Jail Voice Channel', 'voice'),
  ] },
  autorole: { label: 'AutoRole / Join Logs', table: 'guild_auto_roles', permissions: ['ManageRoles'], fields: [
    role('role_id', 'Join Role'), channel('member_join_log_channel_id', 'Join Logs Channel'),
  ] },
  tempvoice: { label: 'TempVoice', table: 'temp_voice_configs', collection: true,
    identity: ['creator_channel_id'], permissions: ['ManageChannels', 'MoveMembers'], fields: [
      channel('creator_channel_id', 'Join to Create', 'voice', true), text('config_name', 'Name', 100, { required: true }),
      boolean('enabled', 'Enabled', true), channel('category_id', 'Category', 'category', true),
      role('support_role_id', 'Support Role', false, { staff: true }),
    ] },
  levels: { label: 'Levels / XP', table: 'guild_level_settings', fields: [
    boolean('text_xp_enabled', 'Text XP', true), boolean('voice_xp_enabled', 'Voice XP', true),
    { ...number('voice_min_members', 'Minimum Voice Members', 2, 1, 99), required: true },
    boolean('voice_ignore_muted', 'Exclude Muted Members'), boolean('voice_ignore_deafened', 'Exclude Deafened Members', true),
    number('xp_multiplier', 'XP Multiplier', 1, 0.5, 5, false),
    number('text_xp_min', 'Text XP Minimum', 15, 1, 10000), number('text_xp_max', 'Text XP Maximum', 25, 1, 10000),
    number('voice_xp_rate', 'Voice XP per Minute', 10, 1, 10000), number('xp_cooldown', 'Text XP Cooldown (seconds)', 60, 0, 86400),
    { key: 'excluded_channels', label: 'Excluded Channels', kind: 'channels', default: [] },
    boolean('levelup_enabled', 'Level-Up Announcements'), channel('levelup_channel_id', 'Level-Up Channel'),
    text('levelup_message', 'Level-Up Message', 1500, { default: 'Congratulations {user}! You reached level {level}!', required: true }),
    boolean('levelup_include_card', 'Include Rank Card', true), boolean('role_rewards_remove_previous', 'Remove Previous Reward Roles'),
  ] },
  rewards: { label: 'Level Reward Roles', table: 'level_roles', collection: true,
    identity: ['ladder', 'level'], permissions: ['ManageRoles'], fields: [
      choice('ladder', 'Ladder', ['text', 'voice'], 'text'), number('level', 'Level', 5, 1, 100000), role('role_id', 'Reward Role', true),
    ] },
  stats: { label: 'Stats Channels', table: 'stats_channels', permissions: ['ManageChannels'], fields: [
    channel('member_count_channel_id', 'Member Count Channel', 'statsVoice'), channel('voice_count_channel_id', 'Voice Count Channel', 'statsVoice'),
    text('member_count_format', 'Member Channel Name', 100, { default: '👥 Members: {count}', required: true }),
    text('voice_count_format', 'Voice Channel Name', 100, { default: '🎤 In Voice: {count}', required: true }),
  ] },
  automod: { label: 'AutoMod / Blacklist', topKeys: true, fields: [
    boolean('spamDetectionEnabled', 'Anti-Spam', true), role('mutedRoleId', 'Muted Role'), channel('autobanLogChannel', 'AutoBan Logs'),
    { key: 'autobanBlacklist', label: 'Blocked Server Invites', kind: 'invites', default: [], max: 2000 },
  ] },
  applications: { label: 'Staff Applications', topKeys: true, permissions: ['ManageRoles'], fields: [
    channel('staff_review_channel', 'Review Channel', 'text', true), role('role_moderator', 'Moderator Role', true),
    role('role_designer', 'Designer Role', true), role('role_developer', 'Developer Role', true),
  ] },
  modmail: { label: 'Modmail / Tickets', topKeys: true, premium: true, permissions: ['ManageChannels'], fields: [
    { key: 'modRoleIDs', label: 'Support Roles', kind: 'roles', required: true, staff: true, default: [] },
    channel('ticketCategoryId', 'Tickets Category', 'category', true), channel('modNotificationChannelID', 'Notifications Channel', 'text', true),
  ] },
  embeds: { label: 'Embed Appearance', jsonKey: 'embed', fields: [
    { key: 'color', label: 'Color (#hex)', kind: 'color' }, text('footer.text', 'Footer Text', 100),
    text('footer.iconURL', 'Footer Icon URL', 500, { url: true }), text('thumbnail', 'Thumbnail URL', 500, { url: true }),
  ] },
  general: { label: 'Prefix', table: 'guild_configs', fields: [text('prefix', 'Command Prefix', 10, { default: '!', required: true })] },
  reactions: { label: 'Auto Reactions', table: 'auto_reactions', collection: true, ownerOnly: true,
    identity: ['target_id', 'emoji'], permissions: ['AddReactions', 'ReadMessageHistory'], fields: [
      choice('target_type', 'Target Type', ['user', 'channel'], 'channel'),
      { key: 'target_id', label: 'Target', kind: 'target', required: true },
      text('emoji', 'Emoji', 100, { required: true, emoji: true }),
    ] },
  rolemenus: { label: 'Self Role Menus', premium: true, launcher: { command: 'rolemenu', args: ['create'] }, fields: [] },
};

function getValue(settings, key) {
  return key.split('.').reduce((value, part) => value?.[part], settings);
}
function setValue(settings, key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  let object = settings;
  for (const part of parts) {
    if (!object[part] || typeof object[part] !== 'object') object[part] = {};
    object = object[part];
  }
  object[last] = value;
}
function defaults(definition) {
  const result = {};
  for (const field of definition.fields) setValue(result, field.key, field.default ?? null);
  return result;
}
module.exports = { modules, getValue, setValue, defaults };
