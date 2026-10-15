const { asEmbed } = require('../../utils/responses');
const { addNote, memberNotes, deleteNote } = require('../../database/moderationRecords');
const { canReadRecords, elevated } = require('../../services/moderationRecords');
const { privateReply } = require('./case');
const icons = require('../../config/setupEmojis');
module.exports = {
  name: 'modnote', aliases: ['mn'], prefixless: true, guildOnly: true, category: 'Moderation', cooldown: 3,
  description: 'Save internal moderation notes. Notes are viewed privately through DMs.',
  usage: 'mn add @member <note> | mn @member [page] | mn delete <noteID>',
  async execute(message, args = []) {
    if (!canReadRecords(message.member, message.author.id)) return message.reply(asEmbed('You need moderation permissions to use moderator notes.'));
    const action = args[0]?.toLowerCase();
    if (action === 'delete' || action === 'remove') {
      if (!/^\d{1,19}$/.test(args[1] || '')) return message.reply(asEmbed('Use `mn delete <noteID>`.'));
      const deleted = await deleteNote(message.guild.id, args[1], message.author.id, elevated(message.member, message.author.id));
      if (!deleted) return message.reply(asEmbed('Note not found, or you cannot remove another moderator’s note.'));
      return privateReply(message, { title: 'Note Removed', description: `${icons.success} Note #${deleted.note_id} was removed from the active member notes. The deletion is recorded.` });
    }
    const writing = action === 'add', listing = action === 'list';
    const target = message.mentions.users.first()?.id || (writing || listing ? args[1] : args[0])?.replace(/^<@!?(\d+)>$/, '$1');
    if (!/^\d{17,20}$/.test(target || '')) return message.reply(asEmbed('Use `mn add @member <note>`, `mn @member [page]`, or `mn delete <noteID>`.'));
    if (writing) {
      const content = args.slice(2).join(' ').trim();
      if (!content || content.length > 1000) return message.reply(asEmbed('Write a note of 1–1000 characters.'));
      const note = await addNote(message.guild.id, target, message.author.id, content);
      // Notes are never sent to the member. Remove the invoking message when possible.
      if (message.deletable) await message.delete().catch(() => {});
      return privateReply(message, { title: `Note #${note.note_id} Saved`, description: `${icons.success} Member: <@${target}>`, fields: [{ name: 'Note', value: note.content }] });
    }
    const page = Number(args[listing ? 2 : 1] || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) return message.reply(asEmbed('Page must be a positive number.'));
    const notes = await memberNotes(message.guild.id, target, page - 1);
    return privateReply(message, { title: 'Moderator Notes', description: `${icons.manager} Member: <@${target}> · Page ${page}`,
      fields: notes.length ? notes.map(note => ({ name: `Note #${note.note_id}`, value: `<@${note.moderator_id}> · <t:${Math.floor(new Date(note.created_at).getTime() / 1000)}:f>\n${note.content.slice(0, 850)}` })) : [{ name: 'Notes', value: 'No active notes on this page.' }] });
  },
};
