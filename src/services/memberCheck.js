const { escapeMarkdown, PermissionsBitField: { Flags } } = require('discord.js');
const emojis = require('../config/setupEmojis');
const days = timestamp => Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
function timestamp(value) {
  if (!value) return 'Unknown';
  const seconds = Math.floor(Number(value) / 1000);
  return `<t:${seconds}:F>\n<t:${seconds}:R>`;
}
function joinSource(member, data) {
  if (!data.inviteAvailable) return 'Tracking data is temporarily unavailable.';
  const invite = data.invite;
  if (!invite) return 'Unknown · No recorded invite for this member.';
  // Ignore an old join record after the member leaves and rejoins.
  if (member.joinedTimestamp && Math.abs(new Date(invite.joined_at).getTime() - member.joinedTimestamp) > 120000) {
    return 'Unknown · The recorded invite belongs to an earlier join.';
  }
  if (invite.join_method === 'vanity') return 'Vanity URL · No individual inviter.';
  if (['invite', 'new_invite'].includes(invite.join_method) && invite.inviter_id) {
    return `${invite.join_method === 'new_invite' ? 'Possible invite creator' : 'Invite creator (tracked)'}: <@${invite.inviter_id}>\nInvite attribution is inferred; it does not identify who shared the link.`;
  }
  return 'Unknown · Could be Discovery, a deleted invite, or another join method.';
}
async function visibleServers(client, member) {
  const guilds = [...client.guilds.cache.values()].filter(guild => guild.id !== member.guild.id);
  const matches = [{ id: member.guild.id, name: member.guild.name, owner: member.guild.ownerId === member.id }];
  let unavailable = 0;
  // Limit in-flight Discord requests and overall work on very large bot installations.
  const candidates = guilds.slice(0, 50);
  for (let start = 0; start < candidates.length; start += 5) {
    await Promise.all(candidates.slice(start, start + 5).map(async guild => {
      try {
        const found = await guild.members.fetch(member.id);
        if (found) matches.push({ id: guild.id, name: guild.name, owner: guild.ownerId === member.id });
      } catch (error) {
        if (error.code !== 10007) unavailable++;
      }
    }));
  }
  matches.sort((a, b) => a.id.localeCompare(b.id));
  return { matches, unavailable, limited: guilds.length > candidates.length };
}
function buildMemberReport(member, data, shared, verification) {
  const user = member.user;
  const roles = [...member.roles.cache.values()].filter(role => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);
  const alerts = [];
  if (days(user.createdTimestamp) < 7) alerts.push('Account created less than 7 days ago.');
  if (member.communicationDisabledUntilTimestamp > Date.now()) alerts.push(`Timed out until <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>.`);
  if (data.warnings) alerts.push(`${data.warnings} recorded warning(s) in this server.`);
  if (data.jail) alerts.push('Currently recorded as jailed.');
  alerts.push(...verification.issues);
  const servers = shared.matches.slice(0, 12).map(guild => `• ${escapeMarkdown(guild.name).slice(0, 70)}${guild.owner ? ' · Owner' : ''}`);
  if (shared.matches.length > 12) servers.push(`+${shared.matches.length - 12} more shared servers`);
  if (shared.unavailable || shared.limited) servers.push('Some servers could not be checked.');
  servers.push('Only servers shared with this bot are visible.');
  const permissions = ['Administrator', 'ManageGuild', 'ManageRoles', 'BanMembers', 'KickMembers', 'ModerateMembers']
    .filter(permission => member.permissions.has(Flags[permission]));
  return {
    title: 'Member Check', color: alerts.length ? 0xE9B76A : 0x8594F0,
    description: `${emojis.manager} <@${user.id}> · ${escapeMarkdown(user.tag || user.username)}\nUser ID: \`${user.id}\`${user.bot ? '\nBot account' : ''}`,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    fields: [
      { name: 'Account Created', value: `${timestamp(user.createdTimestamp)}\n**${days(user.createdTimestamp)} days old**`, inline: true },
      { name: 'Joined This Server', value: `${timestamp(member.joinedTimestamp)}${member.joinedTimestamp ? `\n**${days(member.joinedTimestamp)} days here**` : ''}`, inline: true },
      { name: 'Join Source', value: joinSource(member, data) },
      { name: 'Verification', value: `**${verification.status}** · ${verification.type}`, inline: true },
      { name: 'Moderation Record', value: `Warnings: **${data.warnings ?? 'Unavailable'}**\nJail: **${data.jail == null ? 'Unavailable' : data.jail ? 'Yes' : 'No'}**`, inline: true },
      ...(data.recordsIncluded ? [{ name: 'Staff Records', value: `Cases: **${data.caseCount ?? 'Unavailable'}** · Active notes: **${data.noteCount ?? 'Unavailable'}**\nUse \`case @member\` or \`mn @member\` for private details.` }] : []),
      { name: `Roles · ${roles.length}`, value: roles.length ? `${roles.slice(0, 15).map(role => `<@&${role.id}>`).join(' ')}${roles.length > 15 ? ` (+${roles.length - 15} more)` : ''}` : 'No roles' },
      { name: 'Key Permissions', value: permissions.join(' · ') || 'None' },
      { name: `Shared Servers · ${shared.matches.length}${shared.limited || shared.unavailable ? '+' : ''}`, value: servers.join('\n').slice(0, 1000) },
      { name: 'Review Notes', value: alerts.length ? `${emojis.warning} ${alerts.slice(0, 10).join('\n• ')}`.slice(0, 1000) : `${emojis.success} No issues found in the available records.` },
    ], footer: { text: 'Moderation overview • This check does not change roles or settings' },
  };
}
module.exports = { buildMemberReport, visibleServers, joinSource };
