const { PermissionsBitField: { Flags } } = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { validateSetup } = require('../../services/setupValidation');
const { canVerify } = require('../../services/verificationPermissions');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const emojis = require('../../config/setupEmojis');

function inspectMember(member, settings, bot) {
  const has = key => Boolean(settings[key] && member.roles.cache.has(settings[key]));
  const verified = has('verifiedRoleId'), unverified = has('unverifiedRoleId');
  const boy = has('boyRoleId'), girl = has('girlRoleId');
  const issues = [];
  if (verified && unverified) issues.push('Both Verified and Unverified roles are assigned.');
  if (boy && girl) issues.push('Both Boy and Girl roles are assigned.');
  if (verified && !boy && !girl) issues.push('Verified role is assigned without a Boy or Girl role.');
  if (!verified && (boy || girl)) issues.push('Boy/Girl role is assigned without the Verified role.');
  if (!verified && !unverified) issues.push('Neither Verified nor Unverified role is assigned.');
  if (member.user.bot) issues.push('This member is a bot.');
  if (member.id === member.guild.ownerId || !bot || bot.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    issues.push('The bot cannot manage this member. Check the role hierarchy.');
  }
  return { status: verified ? 'Verified' : unverified ? 'Unverified' : 'Not configured',
    type: boy && girl ? 'Conflicting roles' : boy ? 'Boy' : girl ? 'Girl' : 'Not assigned', issues };
}

module.exports = {
  name: 'verifycheck', aliases: ['vcheck'], category: 'Moderation', guildOnly: true,
  description: 'Check verification settings and optionally inspect a member without changing their roles.',
  usage: 'verifycheck [@member / ID]',
  async execute(message, args = []) {
    const config = await getGuildConfig(message.guild.id, true);
    const settings = config.settings?.verification || {};
    if (!canVerify(message.member, message.author.id, settings) && !message.member.permissions.has(Flags.ManageRoles)) {
      return sendEmbed(message, { title: 'Permission Denied', description: 'You need Administrator, Manage Roles, or the Verificator role to run this check.' });
    }
    await Promise.all([message.guild.roles.fetch(), message.guild.channels.fetch(), message.guild.members.fetchMe()]);
    const result = validateSetup('verification', settings, message.guild);
    const problems = [...result.missing.map(label => `Set ${label}.`), ...result.errors];
    const fields = [{ name: 'System Status', value: result.ready ? `${emojis.success} Ready` : `${emojis.warning} Needs attention` },
      { name: 'Who Can Verify', value: `Administrators and the bot owner can always verify.\n${settings.verificatorRoleId ? `<@&${settings.verificatorRoleId}> can also verify.` : 'No additional Verificator role is configured.'}` }];
    if (problems.length) fields.push({ name: 'Setup Checklist', value: problems.map(problem => `• ${problem}`).join('\n').slice(0, 1000) });
    let member = message.mentions.members.first();
    if (!member && args[0]) member = await message.guild.members.fetch(args[0]).catch(() => null);
    if (args[0] && !member) return sendEmbed(message, { title: 'Member Not Found', description: 'Mention a server member or provide their ID.' });
    if (member) {
      const report = inspectMember(member, settings, message.guild.members.me);
      fields.push({ name: 'Member', value: `<@${member.id}> · **${report.status}**\nType: ${report.type}` });
      fields.push({ name: 'Member Checklist', value: report.issues.length ? report.issues.map(issue => `• ${issue}`).join('\n') : `${emojis.success} Roles are consistent and the bot can manage this member.` });
    }
    return sendEmbed(message, { title: 'Verification Check', description: `${emojis.manager} Review setup and role consistency. This check does not change any roles.`,
      color: result.ready ? 0x8594F0 : 0xE9B76A, fields }, { allowedMentions: { parse: [] } });
  },
  inspectMember,
};
