const { PermissionFlagsBits } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const forceMute = require('../../services/forceMute');

const names = members => members.map(member => member.toString()).join(', ').slice(0, 1000);

module.exports = {
  name: 'forceunmute',
  aliases: ['fum', 'funmute'],
  description: 'Lifts the mutes applied by forcemute. Add "all" to unmute everyone in your voice room.',
  usage: 'forceunmute [all]',
  category: 'Moderation',
  guildOnly: true,
  cooldown: 5,
  permissions: [PermissionFlagsBits.Administrator],

  async execute(message, args = []) {
    if (!forceMute.canForceMute(message.member, message.author.id)) {
      return sendEmbed(message, { title: '🚫 Permission Denied', description: 'Only the owner and **Administrators** can use this command.', color: 0x23272A });
    }
    const all = String(args[0] || '').toLowerCase() === 'all';
    const channel = message.member.voice.channel;
    if (all && !channel) {
      return sendEmbed(message, { title: 'Join a Voice Room', description: 'Join the voice room you want to unmute, then use `forceunmute all` again.', color: 0x23272A });
    }

    const lifted = await forceMute.unmuteForced(message.guild, message.member);
    if (all) {
      const room = await forceMute.unmuteRoom(channel, message.member);
      lifted.unmuted.push(...room.unmuted.filter(member => !lifted.unmuted.includes(member)));
      lifted.failed.push(...room.failed);
    }

    const { unmuted, pending, failed } = lifted;
    const fields = [];
    if (unmuted.length) fields.push({ name: `🔊 Unmuted (${unmuted.length})`, value: names(unmuted) });
    if (pending.length) fields.push({ name: `Out of voice (${pending.length})`, value: `${names(pending)}\nUnmuted automatically when they rejoin voice.` });
    if (failed.length) fields.push({ name: `Failed (${failed.length})`, value: names(failed) });
    return sendEmbed(message, {
      title: '🔊 Force Unmute',
      description: unmuted.length || pending.length || failed.length
        ? 'The force mute has been lifted.'
        : `Nobody is force-muted right now.${all ? '' : ' Use `forceunmute all` in a voice room to unmute everyone there.'}`,
      fields,
      color: failed.length ? 0xE67E22 : 0x2ECC71,
    });
  },
};
