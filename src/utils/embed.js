const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../database/guildConfig');

// Default branding
const DEFAULT_COLOR = 0x131416; // Discord dark theme#131416
const DEFAULT_FOOTER = {
  text: 'Parallel Ultra Bot',
  iconURL: 'https://cdn.discordapp.com/attachments/1378500623967981600/1378530914182627481/pu.jpg?ex=683cf075&is=683b9ef5&hm=ddde0abba25b5431ff9d65670ee0317457bc66db8713313e58fe3dfe25d12336&' // Replace with your bot's icon URL
};

/**
 * Fetch per-guild embed branding (color, footer) from config or defaults.
 */
async function getGuildEmbedConfig(guildId) {
  try {
    const config = await getGuildConfig(guildId);
    const embedSettings = config && config.settings && config.settings.embed_settings ? config.settings.embed_settings : {};
    return {
      color: embedSettings.color || DEFAULT_COLOR,
      footer: embedSettings.footer || DEFAULT_FOOTER,
      thumbnail: embedSettings.thumbnail || DEFAULT_FOOTER.iconURL,
    };
  } catch {
    return { color: DEFAULT_COLOR, footer: DEFAULT_FOOTER, thumbnail: DEFAULT_FOOTER.iconURL };
  }
}

/**
 * Create a modern, branded embed for this guild.
 * @param {string} guildId
 * @param {object} options - { title, description, fields, color, footer, thumbnail, image }
 * @returns {Promise<EmbedBuilder>}
 */
async function createEmbed(guildId, { title, description, fields = [], color, footer, thumbnail, image }) {
  const guildConfig = await getGuildEmbedConfig(guildId);
  const embed = new EmbedBuilder()
    .setColor(color || guildConfig.color);
  
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  
  if (fields && fields.length > 0) embed.addFields(fields);
  embed.setFooter(footer || guildConfig.footer);
  embed.setTimestamp();

  const finalThumbnail = thumbnail || guildConfig.thumbnail;
  if (finalThumbnail && typeof finalThumbnail === 'string' && finalThumbnail.trim().length > 0) {
    embed.setThumbnail(finalThumbnail);
  }
  if (image) embed.setImage(image);
  return embed;
}

// Centralized error embed helper
async function createErrorEmbed(guildId, { title = 'Error', description }) {
  const embed = await createEmbed(guildId, {
    title: `❌ ${title}`,
    description,
    color: DEFAULT_COLOR // Dark theme
  });
  return embed;
}

// Centralized system/success embed helper
async function createSystemEmbed(guildId, { title = 'Success', description }) {
  const embed = await createEmbed(guildId, {
    title: `<:Done:1305644486453493801> ${title}`,
    description,
    color: DEFAULT_COLOR // Dark theme
  });
  return embed;
}

module.exports = { createEmbed, getGuildEmbedConfig, createErrorEmbed, createSystemEmbed };
