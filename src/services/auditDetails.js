const { PermissionsBitField, escapeMarkdown } = require('discord.js');

const label = value => String(value).replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
const clean = (value, limit = 800) => escapeMarkdown(String(value ?? 'Not set')).slice(0, limit);
const sensitive = key => /(token|secret|password|authorization|code|url|avatar|image)/i.test(key);
const when = timestamp => Number.isFinite(timestamp) && timestamp > 0
  ? `<t:${Math.floor(timestamp / 1000)}:F> · <t:${Math.floor(timestamp / 1000)}:R>` : 'Unknown';

function safeObject(value, depth = 0) {
  if (depth > 4) return '[Nested value]';
  if (Array.isArray(value)) return value.slice(0, 12).map(item => safeObject(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitive(key)).slice(0, 12).map(([key, item]) => [key, safeObject(item, depth + 1)]));
  return value;
}
function show(value) {
  if (value == null) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'object') return clean(JSON.stringify(safeObject(value)), 220);
  return clean(value, 220);
}
function permissionNames(bits) {
  const names = [...new Set(new PermissionsBitField(bits).toArray())].map(label);
  const known = Object.values(PermissionsBitField.Flags).reduce((all, flag) => all | flag, 0n);
  if (bits & ~known) names.push(`Other flags (${bits & ~known})`);
  return names.join(', ') || 'None';
}
function permissions(before, after) {
  try {
    const oldBits = BigInt(before ?? 0), newBits = BigInt(after ?? 0);
    if (oldBits < 0n || newBits < 0n) throw new Error('Invalid permission flags');
    return `Added: ${permissionNames(newBits & ~oldBits)}\nRemoved: ${permissionNames(oldBits & ~newBits)}`;
  } catch { return `Before: ${show(before)}\nAfter: ${show(after)}`; }
}
function roles(value) {
  if (!Array.isArray(value)) return show(value);
  const list = value.slice(0, 10).map(role => /^\d{16,22}$/.test(String(role.id))
    ? `<@&${role.id}> · ${clean(role.name || role.id, 60)}` : clean(role.name || role.id, 60));
  if (value.length > 10) list.push(`+${value.length - 10} more`);
  return list.join(', ') || 'None';
}
function changesSummary(changes = []) {
  const visible = changes.filter(change => !sensitive(change.key));
  const details = [];
  let remaining = 980;
  for (const change of visible.slice(0, 8)) {
    const key = change.key;
    const body = ['permissions', 'allow', 'deny'].includes(key) ? permissions(change.old, change.new)
      : key === '$add' ? roles(change.new) : key === '$remove' ? roles(change.new)
        : `Before: ${show(change.old)}\nAfter: ${show(change.new)}`;
    const name = key === '$add' ? 'Roles Added' : key === '$remove' ? 'Roles Removed' : label(key);
    const block = `**${clean(name, 70)}**\n${body.length > 700 ? `${body.slice(0, 680)}… (truncated)` : body}`;
    if (block.length + 2 > remaining) break;
    details.push(block); remaining -= block.length + 2;
  }
  if (visible.length > details.length) details.push(`… ${visible.length - details.length} more change(s).`);
  return details.join('\n\n');
}
function securityReview(changes = []) {
  const watched = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageWebhooks', 'ManageChannels', 'BanMembers', 'KickMembers'];
  const added = new Set();
  for (const change of changes) {
    if (!['permissions', 'allow'].includes(change.key)) continue;
    try {
      const bits = BigInt(change.new ?? 0) & ~BigInt(change.old ?? 0);
      for (const name of watched) if (bits & PermissionsBitField.Flags[name]) added.add(label(name));
    } catch { /* Malformed flags remain visible in the ordinary change summary. */ }
  }
  return added.size ? `Sensitive permission flags added: **${[...added].join(', ')}**. Review this role or overwrite; effective access depends on the full permission configuration.` : null;
}
function presentation(title, category) {
  if (/Ban Add|Kick|Prune|Auto Moderation|Webhook Create|Permission Overwrite/.test(title)) return { color: 0xE6A34A, status: 'Review' };
  if (/Deleted|Delete|Ban Remove/.test(title)) return { color: 0xDC6464, status: 'Removed' };
  if (/Joined|Created|Create|Unban/.test(title)) return { color: 0x65B99A, status: 'Activity' };
  return { color: category === 'moderation' ? 0xE6A34A : 0xDFBD7C, status: 'Activity' };
}
module.exports = { label, clean, when, changesSummary, securityReview, presentation };
