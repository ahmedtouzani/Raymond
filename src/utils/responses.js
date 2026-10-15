const { EmbedBuilder, MessageFlags, MessageFlagsBitField } = require('discord.js');

/** Format legacy text responses without changing files, controls or privacy. */
function asEmbed(response) {
  const options = typeof response === 'string' ? { content: response } : response;
  if (!options || typeof options !== 'object' || typeof options.content !== 'string' || !options.content.trim()) return response;
  const flags = options.flags == null ? 0 : new MessageFlagsBitField(options.flags).bitfield;
  // Existing embeds and Components V2 already own their presentation.
  if (options.embeds?.length || flags & MessageFlags.IsComponentsV2) return response;
  const embed = new EmbedBuilder().setColor(0x131416).setDescription(options.content)
    .setFooter({ text: 'Powered By Parallel Universe' }).setTimestamp();
  return {
    ...options,
    content: '',
    embeds: [embed],
    // Plain responses never need to notify everyone through an error or usage hint.
    allowedMentions: options.allowedMentions || { parse: [], repliedUser: false },
    ...(options.flags != null ? { flags: flags & ~MessageFlags.SuppressEmbeds } : {}),
  };
}
module.exports = { asEmbed };
