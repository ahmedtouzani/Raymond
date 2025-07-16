const { createEmbed } = require('../../utils/embed');

/**
 * Send a standardized embed message.
 * @param {object} context - message, interaction, user, or channel object
 * @param {object} options - Embed options (title, description, fields, etc.)
 * @param {object} [sendOptions] - Additional Discord.js send options
 */
async function sendEmbed(context, options, sendOptions = {}) {
  // Try to extract the guildId from various context types
  const guildId =
    context.guild?.id ||
    context.guildId ||
    (context.channel && context.channel.guild && context.channel.guild.id);
  const embed = await createEmbed(guildId, options);

  // For message, interaction, DM, or channel
  if (context.reply) {
    return context.reply({ embeds: [embed], ...sendOptions });
  } else if (context.send) {
    return context.send({ embeds: [embed], ...sendOptions });
  } else if (context.user && context.user.send) {
    return context.user.send({ embeds: [embed], ...sendOptions });
  } else if (context.channel && context.channel.send) {
    return context.channel.send({ embeds: [embed], ...sendOptions });
  }
  throw new Error('Unsupported context for sendEmbed');
}

module.exports = { sendEmbed };
