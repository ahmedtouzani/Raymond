const { ChannelType, PermissionsBitField: { Flags }, OverwriteType } = require('discord.js');
const { routes } = require('./auditRoutes');

const busy = new Set();
const marker = key => `Raymond audit route: ${key}`;
const required = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks];
const read = [Flags.ViewChannel, Flags.ReadMessageHistory];
const failure = message => Object.assign(new Error(message), { auditProvisioning: true });

function privateDestination(channel, guild) {
  const everyone = channel?.permissionsFor(guild.roles.everyone);
  return channel?.type === ChannelType.GuildText
    && everyone && !everyone.has(Flags.ViewChannel)
    && channel.permissionsFor(guild.members.me)?.has(required);
}
function plan(guild, { categoryId, staffRoleIds = [], actorId, config = {} }) {
  const category = guild.channels.cache.get(categoryId), bot = guild.members.me;
  if (!category || category.type !== ChannelType.GuildCategory) throw failure('Choose an existing category in this server.');
  if (!bot?.permissions.has([Flags.ManageChannels, Flags.ManageRoles, Flags.ViewAuditLog, ...read, Flags.SendMessages, Flags.EmbedLinks])
    || !category.permissionsFor(bot)?.has([Flags.ViewChannel, Flags.ManageChannels, Flags.ManageRoles])) {
    throw failure('The bot needs View Audit Log, Manage Channels, Manage Roles, View Channel, Read Message History, Send Messages and Embed Links, with access to the selected category.');
  }
  const staff = [...new Set(staffRoleIds)];
  if (staff.length > 5) throw failure('Choose up to 5 staff roles.');
  for (const id of staff) {
    const role = guild.roles.cache.get(id);
    if (!role || id === guild.id || role.managed) throw failure('Choose existing, regular staff roles other than @everyone.');
  }
  const children = [...guild.channels.cache.values()].filter(channel => channel.parentId === categoryId && !channel.isThread?.());
  const items = routes.map(route => {
    const mapped = guild.channels.cache.get(config.routes?.[route.key]);
    const candidates = children.filter(channel => channel.topic === marker(route.key));
    if (mapped?.parentId === categoryId && !candidates.some(channel => channel.id === mapped.id)) candidates.unshift(mapped);
    if (candidates.length > 1) throw failure(`Multiple channels are linked to ${route.label}. Resolve the duplicate routes before retrying.`);
    const existing = candidates[0];
    if (existing && !privateDestination(existing, guild)) throw failure(`${route.label}: the existing channel must be private and writable by the bot before it can be reused.`);
    if (existing && staff.some(id => !existing.permissionsFor(guild.roles.cache.get(id))?.has(read))) {
      throw failure(`${route.label}: a selected staff role cannot read the existing channel. Adjust its permissions before reusing it.`);
    }
    if (!existing && children.some(channel => channel.name === route.name)) throw failure(`An unlinked #${route.name} already exists. Link it in Detailed Routes or choose another category.`);
    return { ...route, channelId: existing?.id || null };
  });
  if (new Set(items.filter(item => item.channelId).map(item => item.channelId)).size !== items.filter(item => item.channelId).length) {
    throw failure('Each detailed route needs a separate channel for automatic setup.');
  }
  const createCount = items.filter(item => !item.channelId).length;
  if (children.length + createCount > 50) throw failure('This category would exceed Discord’s limit of 50 channels. Choose another category.');
  if ([...guild.channels.cache.values()].filter(channel => !channel.isThread?.()).length + createCount > 500) throw failure('This server does not have enough channel slots.');
  return { categoryId, staffRoleIds: staff, actorId, items, createCount, reuseCount: items.length - createCount };
}
function overwrites(guild, actorId, staffRoleIds) {
  const entries = new Map();
  const put = entry => entries.set(entry.id, entry);
  put({ id: guild.id, type: OverwriteType.Role, deny: [Flags.ViewChannel, Flags.SendMessages] });
  for (const id of staffRoleIds) put({ id, type: OverwriteType.Role, allow: read });
  put({ id: actorId, type: OverwriteType.Member, allow: read });
  put({ id: guild.members.me.id, type: OverwriteType.Member, allow: [...read, Flags.SendMessages, Flags.EmbedLinks] });
  return [...entries.values()];
}
async function create(guild, options) {
  if (busy.has(guild.id)) throw failure('Another logs setup is running in this server. Wait for it to finish.');
  busy.add(guild.id);
  const created = [];
  try {
    await Promise.all([guild.channels.fetch(), guild.roles.fetch(), guild.members.fetchMe()]);
    if (!(await options.authorized())) throw failure('Administrator access is required to create the logs channels.');
    // Fresh validation also makes retries reuse channels retained after a partial failure.
    const current = plan(guild, options);
    const config = { ...options.config, enabled: true, routes: { ...(options.config.routes || {}) } };
    for (const item of current.items) {
      if (item.channelId) { config.routes[item.key] = item.channelId; continue; }
      if (!(await options.authorized())) throw failure('Your setup access changed. Channel creation has stopped.');
      const channel = await guild.channels.create({ name: item.name, type: ChannelType.GuildText, parent: current.categoryId,
        topic: marker(item.key), permissionOverwrites: overwrites(guild, current.actorId, current.staffRoleIds),
        reason: `Raymond detailed audit setup requested by ${current.actorId}` });
      created.push(channel.id);
      config.routes[item.key] = channel.id;
      if (!privateDestination(channel, guild)) throw failure('A new channel failed the privacy or bot permission check. Creation has stopped.');
    }
    config.defaultChannelId = config.routes.general;
    for (const [category, route] of Object.entries({moderation:'moderation',messages:'messages',members:'memberJoined',server:'server',voice:'voiceMoved'})) {
      config[`${category}ChannelId`] = config.routes[route];
    }
    if (!(await options.authorized())) throw failure('Your setup access changed before saving.');
    if (!(await options.persist(config))) throw failure('Audit settings changed in another session. Reopen Audit Logs and retry to link the retained channels.');
    return { config, created: created.length, reused: current.reuseCount };
  } catch (error) {
    const detail = error.auditProvisioning ? error.message : 'Discord could not finish creating the logs channels. Check permissions and channel limits.';
    throw failure(`${detail}${created.length ? ` ${created.length} created channel(s) were retained; retry in the same category to reuse them.` : ''}`);
  } finally { busy.delete(guild.id); }
}
module.exports = { plan, create, marker };
