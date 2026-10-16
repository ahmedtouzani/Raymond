const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const icons = require('../config/setupEmojis');
const categories = {
  setup: { label: 'Server Setup', icon: icons.system, description: 'Configure roles, channels and server features.' },
  verification: { label: 'Verification', icon: icons.manager, description: 'Verify members and check their roles.' },
  moderation: { label: 'Moderation', icon: icons.warning, description: 'Member actions, staff records and channel tools.' },
  leveling: { label: 'Levels & Ranks', icon: icons.utility, description: 'Text and voice XP, rank cards and reward roles.' },
  community: { label: 'Community', icon: icons.support, description: 'Tickets, self roles and custom emojis.' },
  utility: { label: 'Information', icon: icons.category, description: 'Avatars, profiles, server information and bot tools.' },
};
const privateNames = new Set(['premium', 'autoreact', 'shutdown', 'massdm', 'nuke-server', 'setuproles', 'dev', 'afk', 'unafk', 'sendnotify']);
const membership = {
  setup: ['setup', 'auditlogs', 'setupapps', 'tempvoice', 'setautorole', 'setstats', 'setembedcolor', 'setembedfooter', 'setembedicon', 'autoban', 'autospam', 'levelsetup', 'setprefix'],
  verification: ['verify', 'vb', 'vg', 'verifycheck'],
  moderation: ['checker', 'case', 'modnote'],
  leveling: ['level', 'leaderboard', 'top', 'levelrole'],
  community: ['stealemoji', 'rolemenu', 'modmail'],
};
// Detailed guidance for workflows whose legacy command metadata lacks examples or access rules.
const docs = {
  auditlogs: { description: 'Check audit health and delivery across detailed staff logs channels.', usage: ['logs status', 'logs test all', 'logs test <category|route>', 'logs retry'], examples: ['logs status', 'logs test all', 'logs test roleCreated'], access: 'Administrator or Manage Server', botAccess: 'View Audit Log; View Channel, Send Messages and Embed Links in log channels', note: 'Use setup auditlogs → Create Logs Channels to choose a category, review private channels and create them. Creation also needs Manage Channels and Manage Roles. Detailed Routes maps existing channels. Message capture is optional.' },
  setprefix: { access: 'Administrator', examples: ['setprefix !'], note: 'Use the new prefix for commands afterward. Prefixless shortcuts continue to work.' },
  help: { description: 'Browse commands, search by name or alias, and learn how to use each feature.', usage: ['help', 'help <command or search>'], examples: ['help se', 'help verification', 'help ck'] },
  setup: { description: 'Configure your server from one interactive panel. Changes apply only after Save.', examples: ['setup'], access: 'Administrator', note: 'Use existing roles and channels. Back and Cancel discard unsaved changes.' },
  checker: { description: 'Review a member’s account age, join source, permissions, verification and moderation records.', usage: ['checker @member', 'checker <userID>'], examples: ['ck @member'], access: 'Administrator, Manage Roles, or Verificator role', note: 'This report is limited to the current server. Missing invite history is shown as unknown.' },
  verify: { description: 'Verify a member as Boy or Girl, or inspect verification setup.', usage: ['verify boy @member', 'verify girl @member', 'verify check [@member]', 'verify setup'], examples: ['verify boy @member', 'verify check'], access: 'Verify: Administrator or Verificator role. Configure: Manage Roles', note: 'Administrators do not need the Verificator role. You can also configure this feature in setup.' },
  vb: { description: 'Quickly verify a member as Boy.', examples: ['vb @member'], access: 'Administrator or Verificator role' },
  vg: { description: 'Quickly verify a member as Girl.', examples: ['vg @member'], access: 'Administrator or Verificator role' },
  verifycheck: { description: 'Check verification configuration, role consistency and the bot’s role hierarchy.', examples: ['vcheck', 'vcheck @member'], access: 'Administrator, Manage Roles, or Verificator role', note: 'This check does not change roles.' },
  case: { description: 'View moderation history and update case reasons. Case numbers belong to this server.', usage: ['case @member [page]', 'case <number>', 'case edit <number> <reason>'], examples: ['case @member', 'case 1', 'case edit 1 Corrected reason'], access: 'Moderation permissions', note: 'Details arrive by DM. Editing another moderator’s case requires Administrator, Manage Server or the bot owner. The original reason is retained.' },
  modnote: { description: 'Keep internal staff notes on members, separate from warnings and sanctions.', usage: ['mn add @member <note>', 'mn @member [page]', 'mn delete <noteID>'], examples: ['mn add @member Follow up on the reported incident', 'mn @member'], access: 'Moderation permissions', note: 'Use a staff channel. Details arrive by DM; removing another moderator’s note requires Administrator, Manage Server or the bot owner.' },
  stealemoji: { description: 'Preview and import static or animated custom emojis from another server.', usage: ['se <custom emoji> [new_name]', 'se <emoji1> <emoji2>'], examples: ['se <a:warningbug:1467300628907954300> Warning'], access: 'Create Expressions or Manage Expressions', botAccess: 'Create Expressions or Manage Expressions', note: 'Up to 10 emojis per preview. Nothing is added until you confirm. Unicode emojis cannot be imported.' },
  move: { description: 'Move members to a voice channel using mentions, IDs or names.', examples: ['aji @member', 'aji @member #voice-channel'], note: 'When no channel is provided, your current voice channel is used.' },
  level: { description: 'Show a member’s text or voice rank card, level and XP progress.', examples: ['r', 'r @member voice', 'r text'] },
  leaderboard: { examples: ['lb text', 'lb voice 2'] },
  top: { examples: ['top text', 'top voice'] },
  avatar: { examples: ['a', 'a @member'] },
  levelrole: { usage: ['levelrole set <text|voice> <level> @role', 'levelrole remove <text|voice> <level>', 'levelrole list [text|voice]'], examples: ['levelrole set text 10 @reward-role'], access: 'Manage Roles', note: 'Reward roles can also be configured in setup.' },
  levelsetup: { access: 'Administrator', examples: ['levelsetup'], note: 'Levels and XP settings are also available in setup.' },
  setupapps: { access: 'Administrator', examples: ['setupapps', 'setupapps panel'], note: 'The panel subcommand publishes application buttons in the current channel.' },
  tempvoice: { usage: ['tempvoice create #voice-channel <name>', 'tempvoice list', 'tempvoice info #voice-channel', 'tempvoice delete #voice-channel'], examples: ['tempvoice create #join-to-create General Voice'], note: 'You can manage multiple lobbies in setup.' },
  modmail: { access: 'Administrator', premium: true, examples: ['modmail config', 'modmail setcategory <categoryID>', 'modmail setroles @support-role'], note: 'Requires Stellar Matrix. Ticket configuration is also available in setup.' },
  rolemenu: { access: 'Administrator', premium: true, examples: ['rolemenu create'], note: 'Requires Stellar Matrix. The designer lets you review your menu before publishing.' },
  setembedcolor: { examples: ['setembedcolor #8594F0'], access: 'Administrator' },
  setembedfooter: { examples: ['setembedfooter Welcome to our community'], access: 'Administrator' },
  setembedicon: { examples: ['setembedicon https://example.com/icon.png'], access: 'Administrator' },
};
function ownerCommand(command) {
  const category = String(command.category || '').toLowerCase();
  return Boolean(command.ownerOnly || privateNames.has(command.name) || ['owner', 'owneronly', 'godmode'].includes(category));
}
function categoryFor(command) {
  if (ownerCommand(command)) return 'owner';
  for (const [category, names] of Object.entries(membership)) if (names.includes(command.name)) return category;
  const declared = String(command.category || '').toLowerCase();
  if (declared === 'moderation') return 'moderation';
  if (declared === 'admin') return 'setup';
  if (declared === 'premium') return 'community';
  return 'utility';
}
function permissionLabel(value) {
  if (value == null || Array.isArray(value) && !value.length) return 'Everyone';
  try {
    const values = Array.isArray(value) ? value : [value];
    const bits = values.reduce((total, item) => {
      if (typeof item === 'string' && !/^\d+$/.test(item)) {
        const normalized = item.replace(/_/g, '').toLowerCase();
        const key = Object.keys(PermissionFlagsBits).find(name => name.toLowerCase() === normalized);
        if (!key) throw new Error('Unknown permission');
        item = PermissionFlagsBits[key];
      } else if (typeof item === 'string') item = BigInt(item);
      return total | PermissionsBitField.resolve(item);
    }, 0n);
    return new PermissionsBitField(bits).toArray().map(name => name.replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace('Manage Guild Expressions', 'Manage Expressions').replace('Create Guild Expressions', 'Create Expressions').replace('Manage Guild', 'Manage Server')).join(', ') || 'Everyone';
  } catch { return 'Check command access requirements'; }
}
function catalog(client) {
  const result = new Map();
  const loaded = [...client.commands.values()];
  // This command lives in the message dispatcher rather than the command loader.
  if (!loaded.some(command => command.name === 'setprefix')) loaded.push({ name: 'setprefix', description: 'Change the command prefix for this server.', usage: 'setprefix <prefix>', category: 'Admin' });
  for (const command of loaded) {
    // Public help never lists private commands, even for the bot owner.
    if (!command?.name || ownerCommand(command)) continue;
    const guide = docs[command.name] || {};
    result.set(command.name, { ...command, ...guide, categoryId: categoryFor(command),
      aliases: command.aliases || [], access: ownerCommand(command) ? 'Bot owner only' : guide.access || permissionLabel(command.permissions || command.userPermissions),
      botAccess: guide.botAccess || permissionLabel(command.botPermissions), premium: Boolean(guide.premium || command.premiumOnly),
    });
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function resolveCommand(commands, query, prefix) {
  const value = query.trim().toLowerCase();
  const direct = commands.find(command => command.name.toLowerCase() === value || command.aliases.some(alias => alias.toLowerCase() === value));
  if (direct) return direct;
  const name = value.startsWith(prefix.toLowerCase()) ? value.slice(prefix.length) : value;
  return commands.find(command => command.name.toLowerCase() === name || command.aliases.some(alias => alias.toLowerCase() === name));
}
function searchCommands(commands, query, prefix) {
  const exact = resolveCommand(commands, query, prefix);
  if (exact) return [exact];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return commands.filter(command => {
    const haystack = [command.name, ...command.aliases, command.description, command.categoryId, categories[command.categoryId].label].join(' ').toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}
function normalizeUsage(command, prefix) {
  const raw = Array.isArray(command.usage) ? command.usage : String(command.usage || command.name).split(/\n|\s+\|\s+/);
  const names = [command.name, ...command.aliases];
  return raw.map(line => {
    let text = line.replace(/`/g, '').trim().replace(/(^|\s)[!=](?=[a-z])/gi, '$1');
    if (!names.some(name => text === name || text.startsWith(`${name} `))) text = `${command.name} ${text}`;
    return `${prefix}${text}`;
  }).slice(0, 6);
}
function examples(command, prefix) {
  if (!command.examples) return [normalizeUsage(command, prefix)[0]];
  const raw = Array.isArray(command.examples) ? command.examples : String(command.examples).split('\n');
  return raw.filter(Boolean).map(line => `${prefix}${line.replace(/`/g, '').replace(/^[!=]/, '').trim()}`).slice(0, 4);
}
module.exports = { categories, catalog, resolveCommand, searchCommands, normalizeUsage, examples };
