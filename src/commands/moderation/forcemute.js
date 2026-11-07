const { PermissionFlagsBits } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const forceMute = require('../../services/forceMute');

const names = members => members.map(member => member.toString()).join(', ').slice(0, 1000);

module.exports = {
  name: 'forcemute',
  aliases: ['fm'],
  description: 'Server-mutes everyone in your current voice room.',
  usage: 'forcemute',
  category: 'Moderation',
  guildOnly: true,
  cooldown: 5,
  permissions: [PermissionFlagsBits.Administrator],

  async execute(message) {
    if (!forceMute.canForceMute(message.member, message.author.id)) {
      return sendEmbed(message, { title: '🚫 Permission Denied', description: 'Only the owner and **Administrators** can use this command.', color: 0x23272A });
    }
    const channel = message.member.voice.channel;
    if (!channel) {
      return sendEmbed(message, { title: 'Join a Voice Room', description: 'Join the voice room you want to mute, then use this command again.', color: 0x23272A });
    }
    const me = message.guild.members.me;
    if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.MuteMembers)) {
      return sendEmbed(message, { title: 'Missing Permission', description: `I need **Mute Members** in ${channel} to do this.`, color: 0x23272A });
    }

    const { muted, already, failed } = await forceMute.muteRoom(channel, message.member);
    const fields = [];
    if (muted.length) fields.push({ name: `🔇 Muted (${muted.length})`, value: names(muted) });
    if (already.length) fields.push({ name: `Already muted (${already.length})`, value: names(already) });
    if (failed.length) fields.push({ name: `Failed (${failed.length})`, value: names(failed) });
    return sendEmbed(message, {
      title: '🔇 Force Mute',
      description: muted.length || already.length || failed.length
        ? `Everyone in ${channel} is muted, except you, the owners and bots.\nUse \`forceunmute\` to lift it.`
        : `There is nobody else to mute in ${channel}.`,
      fields,
      color: failed.length ? 0xE67E22 : 0xE74C3C,
    });
  },
};
