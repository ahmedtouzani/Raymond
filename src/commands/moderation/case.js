const { getCase, memberCases, editCaseReason } = require('../../database/moderationRecords');
const { canReadRecords, elevated } = require('../../services/moderationRecords');
const { createEmbed } = require('../../utils/embed');
const icons = require('../../config/setupEmojis');

async function privateReply(message, options) {
  const embed = await createEmbed(message.guild.id, options);
  try {
    await message.author.send({ embeds: [embed], allowedMentions: { parse: [] } });
    if (message.deletable) await message.delete().catch(() => {});
    return message.channel.send({ content: `${icons.success} Moderation details sent to your DMs.`, allowedMentions: { parse: [] } });
  } catch {
    return message.channel.send({ content: `${icons.warning} Enable DMs to view moderation records. Any completed save remains recorded.`, allowedMentions: { parse: [] } });
  }
}
const idFrom = value => value?.replace(/^<@!?(\d+)>$/, '$1');
module.exports = {
  name: 'case', aliases: ['cases', 'modcase'], prefixless: true, guildOnly: true, category: 'Moderation', cooldown: 3,
  description: 'Privately view member moderation cases or update a case reason.',
  usage: 'case <number> | case @member [page] | case edit <number> <reason>',
  async execute(message, args = []) {
    if (!canReadRecords(message.member, message.author.id)) return message.reply('You need moderation permissions to view cases.');
    let record;
    if (args[0]?.toLowerCase() === 'edit') {
      if (!/^\d{1,10}$/.test(args[1] || '') || !args.slice(2).join(' ').trim() || args.slice(2).join(' ').length > 1000) return message.reply('Use `case edit <number> <reason>` with a reason of 1–1000 characters.');
      record = await editCaseReason(message.guild.id, args[1], message.author.id, args.slice(2).join(' '), elevated(message.member, message.author.id));
      if (!record) return message.reply('Case not found, or you cannot edit another moderator’s case.');
    } else if (/^\d{1,10}$/.test(args[0] || '')) record = await getCase(message.guild.id, args[0]);
    else {
      const target = message.mentions.users.first()?.id || idFrom(args[0]);
      const page = Number(args[1] || 1);
      if (!/^\d{17,20}$/.test(target || '') || !Number.isInteger(page) || page < 1 || page > 10000) return message.reply('Use `case <number>`, `case @member [page]`, or `case edit <number> <reason>`.');
      const records = await memberCases(message.guild.id, target, page - 1);
      return privateReply(message, { title: 'Moderation History', description: `${icons.manager} Member: <@${target}> · Page ${page}`,
        fields: records.length ? records.map(item => ({ name: `Case #${item.case_number} · ${item.action}`, value: `<@${item.moderator_id}> · <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:f>\n${item.reason.slice(0, 850)}` })) : [{ name: 'Records', value: 'No cases recorded on this page.' }] });
    }
    if (!record) return message.reply('No case with that number exists in this server.');
    const fields = [
      { name: 'Member', value: `<@${record.target_id}>`, inline: true }, { name: 'Moderator', value: `<@${record.moderator_id}>`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(new Date(record.created_at).getTime() / 1000)}:F>` }, { name: 'Reason', value: record.reason },
    ];
    if (record.edited_by) fields.push({ name: 'Reason Updated', value: `<@${record.edited_by}> · <t:${Math.floor(new Date(record.edited_at).getTime() / 1000)}:F>`, inline: false }, { name: 'Original Reason', value: record.original_reason });
    return privateReply(message, { title: `Case #${record.case_number} · ${record.action}`, description: `${icons.manager} ${message.guild.name} moderation record`, fields });
  },
  privateReply,
};
