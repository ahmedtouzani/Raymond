const { createEmbed } = require('../../utils/embed');
const { EmbedBuilder } = require('discord.js');

// Helper to get avatar creation date from snowflake
function getAvatarDate(userId, avatarHash) {
  if (!avatarHash) return 'Default avatar';
  const timestamp = (BigInt(userId) >> 22n) + 1420070400000n;
  return `<t:${Math.floor(Number(timestamp) / 1000)}:R>`;
}

// Helper to get avatar URL with options
function getAvatarURL(user, options = {}) {
  const size = options.size || 1024;
  const format = options.format || (user.avatar?.startsWith('a_') ? 'gif' : 'png');
  
  if (options.server && user.avatar) {
    return user.displayAvatarURL({
      size,
      extension: format,
      forceStatic: format === 'png',
    });
  }
  
  return user.displayAvatarURL({
    size,
    extension: format,
    forceStatic: format === 'png',
  });
}

module.exports = {
  name: 'avatar',
  aliases: ['a', 'pfp', 'profilepic'],
  description: 'Displays a user\'s avatar with download options',
  category: 'Utility',
  cooldown: 5,
  prefixless: true,
  
  async execute(message, args, client) {
    // Get the target user (default to message author)
    const target = message.mentions.users.first() || 
                  (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) || 
                  message.author;
    
    if (!target) {
      return message.reply({ 
        content: '❌ User not found. Please mention a valid user or provide a user ID.'
      });
    }
    
    // Build avatar information
    const avatarInfo = [
      `<:arrow:1309167079231848572> **User ID:** \`${target.id}\``,
      `<:arrow:1309167079231848572> **Created:** <t:${Math.floor(target.createdTimestamp / 1000)}:D>`,
      `<:arrow:1309167079231848572> **Avatar Type:** ${target.avatar?.startsWith('a_') ? 'Animated' : 'Static'}`,
      `<:arrow:1309167079231848572> **Last Updated:** ${getAvatarDate(target.id, target.avatar)}`
    ];
    
    // Add server-specific avatar info if available
    if (message.guild && message.guild.members.cache.get(target.id)?.avatar) {
      const member = message.guild.members.cache.get(target.id);
      avatarInfo.push(`\n<:manager:1466826492334833665> **Server Avatar**`);
      avatarInfo.push(`<:arrow:1309167079231848572> **Updated:** ${getAvatarDate(target.id, member.avatar)}`);
    }
    
    // Create base embed
    const embed = await createEmbed(message.guild?.id, {
      author: {
        name: `${target.tag}'s Avatar`,
        iconURL: target.displayAvatarURL({ dynamic: true, format: 'png' })
      },
      description: avatarInfo.join('\n'),
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true, format: 'png' })
      },
      timestamp: true,
      color: message.guild?.members.me?.displayColor || 0x5865F2
    });
    
    // Add avatar as image
    const avatarURL = getAvatarURL(target, { size: 1024 });
    if (avatarURL) {
      embed.setImage(avatarURL);
    }
    
    // Add download buttons
    const downloadLinks = [
      `[PNG](${getAvatarURL(target, { size: 4096, format: 'png' })})`,
      `[JPG](${getAvatarURL(target, { size: 4096, format: 'jpg' })})`,
      `[WebP](${getAvatarURL(target, { size: 4096, format: 'webp' })})`
    ];
    
    // Add GIF format if avatar is animated
    if (target.avatar?.startsWith('a_')) {
      downloadLinks.push(`[GIF](${getAvatarURL(target, { size: 4096, format: 'gif' })})`);
    }
    
    // Add server avatar download if available
    if (message.guild?.members.cache.get(target.id)?.avatar) {
      const member = message.guild.members.cache.get(target.id);
      downloadLinks.push(`\n**Server Avatar:**`);
      downloadLinks.push(`[PNG](${member.displayAvatarURL({ size: 4096, extension: 'png' })})`);
      downloadLinks.push(`[JPG](${member.displayAvatarURL({ size: 4096, extension: 'jpg' })})`);
      downloadLinks.push(`[WebP](${member.displayAvatarURL({ size: 4096, extension: 'webp' })})`);
    }
    
    // Add download links to the embed
    embed.addFields({
      name: '<:3764nawriter:1379103207925747782> > Download',
      value: downloadLinks.join(' • '),
      inline: false
    });
    
    return message.reply({ embeds: [embed] });
  }
};