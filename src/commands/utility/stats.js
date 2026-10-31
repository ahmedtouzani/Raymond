const {
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, ThumbnailBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');

const text = content => new TextDisplayBuilder().setContent(content);
const separator = () => new SeparatorBuilder().setDivider(true);
// Read-only counters: the buttons only display numbers, so they stay disabled.
const counter = (id, label, emoji, style) => new ButtonBuilder()
  .setCustomId(`stats:${id}`).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(true);

function countStats(guild) {
  return {
    members: guild.memberCount,
    voice: guild.voiceStates.cache.filter(state => state.channelId).size,
    boosters: guild.premiumSubscriptionCount || 0,
  };
}

function renderStats(guild, { members, voice, boosters }) {
  const header = text(`## ${guild.name} Statistics\n`
    + `> 👥 **Total Members:** \`${members}\`\n`
    + `> 🔊 **Active in Voice:** \`${voice}\`\n`
    + `> 💎 **Boosters:** \`${boosters}\``);
  const icon = guild.iconURL({ size: 256 });
  const container = new ContainerBuilder().addSeparatorComponents(separator());
  if (icon) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(header)
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)));
  else container.addTextDisplayComponents(header);
  container
    .addTextDisplayComponents(text(`Stay active, and enjoy your time in ${guild.name}`))
    .addSeparatorComponents(separator())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      counter('members', `Members: ${members}`, '👥', ButtonStyle.Secondary),
      counter('voice', `in Voice: ${voice}`, '🔊', ButtonStyle.Danger),
    ));
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

module.exports = {
  name: 'stats',
  aliases: ['statistics'],
  description: 'Shows the server member, voice and booster counts.',
  usage: '=stats',
  category: 'Utility',
  cooldown: 5,
  prefixless: true,
  countStats,
  renderStats,

  async execute(message) {
    if (!message.guild) return message.reply('This command can only be used in a server.');
    return message.channel.send(renderStats(message.guild, countStats(message.guild)));
  },
};
