// Detailed routes live inside the existing auditLogs JSON. Queue categories stay compatible.
const routes = [
  ['general', 'General Activity', 'general-logs', 'server'],
  ['moderation', 'Moderation / Kicks', 'mods-logs', 'moderation'],
  ['bans', 'Bans / Unbans', 'ban-logs', 'moderation'],
  ['timeouts', 'Timeouts', 'time-out', 'moderation'],
  ['warnings', 'Warnings', 'warn-log', 'moderation'],
  ['verification', 'Verification / Jail', 'verification-logs', 'moderation'],
  ['roleCreated', 'Role Created', 'role-create', 'server'],
  ['roleDeleted', 'Role Deleted', 'role-delete', 'server'],
  ['roleUpdated', 'Role Settings / Permissions', 'role-update', 'server'],
  ['roleMembers', 'Roles Given / Removed', 'role-given-removed', 'moderation'],
  ['nicknames', 'Nickname Changes', 'nickname-logs', 'moderation'],
  ['messages', 'Message Edits / Deletions', 'message-logs', 'messages'],
  ['channels', 'Channels / Threads', 'channel-logs', 'server'],
  ['server', 'Server Settings', 'server-logs', 'server'],
  ['invites', 'Server Invites', 'servers-invites', 'server'],
  ['security', 'Security / Webhooks / AutoMod', 'security-logs', 'moderation'],
  ['memberJoined', 'Members Joined', 'member-logs', 'members'],
  ['memberLeft', 'Members Left', 'member-left', 'members'],
  ['voiceJoined', 'Voice Joined', 'join-vc', 'voice'],
  ['voiceLeft', 'Voice Left', 'leave-vc', 'voice'],
  ['voiceMoved', 'Voice Moved', 'move-cmd-logs', 'voice'],
  ['voiceStates', 'Voice Mute / Deafen / Stream', 'mute-deafen', 'voice'],
].map(([key, label, name, category]) => ({ key, label, name, category }));
function routeFor(action, changes = []) {
  if (/^MemberBan/.test(action) || /^(ban|unban)$/.test(action)) return 'bans';
  if (/^MemberMove/.test(action)) return 'voiceMoved';
  if (/^MemberDisconnect/.test(action)) return 'voiceLeft';
  if (/^MemberRoleUpdate/.test(action)) return 'roleMembers';
  if (/^MemberUpdate/.test(action)) {
    if (changes.some(change => change.key === 'communication_disabled_until')) return 'timeouts';
    if (changes.some(change => change.key === 'nick')) return 'nicknames';
    if (changes.some(change => ['mute', 'deaf'].includes(change.key))) return 'voiceStates';
  }
  if (/^(mute|unmute|timeout)$/.test(action)) return 'timeouts';
  if (/^warn$/.test(action)) return 'warnings';
  if (/^(verify|verification|jail|unjail)/i.test(action)) return 'verification';
  if (/^RoleCreate/.test(action)) return 'roleCreated';
  if (/^RoleDelete/.test(action)) return 'roleDeleted';
  if (/^RoleUpdate/.test(action)) return 'roleUpdated';
  if (/^(Channel|Thread)/.test(action)) return 'channels';
  if (/^Invite/.test(action)) return 'invites';
  if (/^(Webhook|BotAdd|AutoModeration)/.test(action)) return 'security';
  if (/^Message/.test(action)) return 'messages';
  if (/^Member|^kick$/.test(action)) return 'moderation';
  return 'server';
}
module.exports = { routes, routeFor };
