const { PermissionsBitField: { Flags } } = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { getMemberCheckData } = require('../../database/memberCheck');
const { canVerify } = require('../../services/verificationPermissions');
const { inspectMember } = require('./verifycheck');
const { buildMemberReport } = require('../../services/memberCheck');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { canReadRecords } = require('../../services/moderationRecords');

module.exports = {
  name: 'checker', aliases: ['ck', 'check', 'membercheck'], prefixless: true, guildOnly: true,
  category: 'Moderation', cooldown: 10,
  description: 'Inspect a member’s account, join source and moderation record in this server.',
  usage: 'checker @member / ID',
  async execute(message, args = []) {
    const config = await getGuildConfig(message.guild.id, true);
    const verification = config.settings?.verification || {};
    if (!canVerify(message.member, message.author.id, verification) && !message.member.permissions.has(Flags.ManageRoles)) {
      return sendEmbed(message, { title: 'Permission Denied', description: 'You need Administrator, Manage Roles, or the Verificator role to check members.' });
    }
    const id = message.mentions.members.first()?.id || args[0]?.replace(/^<@!?(\d+)>$/, '$1');
    if (!id || !/^\d{17,20}$/.test(id)) return sendEmbed(message, { title: 'Choose a Member', description: 'Use `checker @member` or `checker userID`.' });
    const member = await message.guild.members.fetch({ user: id, force: true }).catch(() => null);
    if (!member) return sendEmbed(message, { title: 'Member Not Found', description: 'That member is not available in this server.' });
    await message.channel.sendTyping().catch(() => {});
    await message.guild.members.fetchMe();
    const data = await getMemberCheckData(message.guild.id, member.id, canReadRecords(message.member, message.author.id));
    const report = inspectMember(member, verification, message.guild.members.me);
    return sendEmbed(message, buildMemberReport(member, data, report), { allowedMentions: { parse: [] } });
  },
};
