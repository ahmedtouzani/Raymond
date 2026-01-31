// Owner-only premium management commands
const { EmbedBuilder } = require('discord.js');
const premium = require('../../premium/premium');

// Premium tier info utility
function getPremiumTierInfo(planType) {
  switch ((planType || '').toLowerCase()) {
    case 'stellar':
    case 'stellar matrix':
      return { emoji: '🌠', name: 'Stellar Matrix', price: '$7.99' };
    case 'godmode':
    case 'godmode parallel':
      return { emoji: '👑', name: 'Godmode Parallel', price: '$29.99' };
    case 'basic':
    case 'free':
    default:
      return { emoji: '🪐', name: 'Basic Reality', price: '$0' };
  }
}

module.exports = {
  name: 'premium',
  description: 'Manage premium guilds (owner only)',
  usage: 'premium <add|remove|list> <guildId?>',
  async execute(message, args) {
    // Only allow the bot owner
    if (message.author.id !== process.env.OWNER_ID) {
      return message.reply({
        embeds: [
          new EmbedBuilder().setColor('Red').setDescription(' Only the bot owner can use this command.')
        ]
      });
    }
    const sub = args[0];
    if (!sub || !['add', 'remove', 'list'].includes(sub)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x23272A)
            .setTitle('✨ Premium Command Usage')
            .setDescription('Usage: `premium <add|remove|list> <guildId?>`')
            .setFooter({ text: 'Premium System', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
        ]
      });
    }
    if (sub === 'add') {
      const guildId = args[1];
      const days = args[2] ? parseInt(args[2], 10) : 30;
      const planType = args[3] || 'basic';
      const buyerId = args[4] || null;
      if (!guildId || isNaN(days) || days <= 0) return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x23272A)
            .setTitle('✨ Premium Guild Added')
            .setDescription('Usage: `premium add <guildId> [days] [planType] [buyerId]`\nExample: `premium add 123456789012345678 60 "stellar" 555666777888999000`')
            .setFooter({ text: 'Premium System', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
        ]
      });
      await premium.addPremiumGuildWithExpiry(guildId, buyerId, planType, days);
      const now = new Date();
      const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const tierInfo = getPremiumTierInfo(planType);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x23272A)
            .setTitle(`${tierInfo.emoji} ${tierInfo.name} Activated`)
            .setDescription(`<a:okey:1467170671351173121> Guild \`${guildId}\` is now **premium!**`)
            .addFields([
              { name: 'Plan', value: `${tierInfo.emoji} ${tierInfo.name}`, inline: true },
              { name: 'Activated', value: now.toLocaleString(), inline: true },
              { name: 'Expires', value: expires.toLocaleString(), inline: true },
              { name: 'Duration', value: `${days} days`, inline: true },
              ...(buyerId ? [{ name: 'Buyer', value: `<@${buyerId}> (${buyerId})`, inline: true }] : [])
            ])
            .setFooter({ text: 'Premium System', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
        ]
      });
    }
    if (sub === 'remove') {
      const guildId = args[1];
      if (!guildId) return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x23272A)
            .setTitle('✨ Premium Guild Removal')
            .setDescription('Please provide a guild ID.')
            .setFooter({ text: 'Premium System', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
        ]
      });
      await premium.removePremiumGuild(guildId);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x23272A)
            .setTitle('✨ Premium Revoked')
            .setDescription(` Guild ${guildId} removed from premium.`)
            .setFooter({ text: 'Premium System', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
        ]
      });
    }
    if (sub === 'list') {
      // Fetch full details for each premium guild
      const guilds = await premium.listPremiumGuildsDetails();
      if (!guilds.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x23272A)
              .setTitle('✨ Premium Guilds')
              .setDescription('There are currently **no** premium guilds.\nUse the add command to grant premium!')
              .setFooter({ text: 'Premium System', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
              .setTimestamp()
          ]
        });
      }
      // Try to fetch server names for guilds the bot is in
      const details = await Promise.all(guilds.map(async g => {
        let name = null;
        try {
          const guild = message.client.guilds.cache.get(g.guild_id);
          name = guild ? guild.name : null;
        } catch { }
        const tierInfo = getPremiumTierInfo(g.plan_type);
        return {
          id: g.guild_id,
          name: name || 'Unknown/Not in Bot',
          activated: g.activated_at ? new Date(g.activated_at).toLocaleString() : 'Unknown',
          expires: g.expires_at ? new Date(g.expires_at).toLocaleString() : 'Permanent',
          plan: `${tierInfo.emoji} ${tierInfo.name}`,
          buyer: g.buyer_id ? `<@${g.buyer_id}> (${g.buyer_id})` : 'Unknown'
        };
      }));
      const embed = new EmbedBuilder()
        .setColor(0x23272A)
        .setTitle('・Premium Guilds')
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/616/616489.png')
        .setDescription('➡️ **Current Premium Guilds:**')
        .addFields(details.map(d => ({
          name: `${d.plan} | ${d.name} [${d.id}]`,
          value: `<a:okey:1467170671351173121> **Activated:** ${d.activated}\n⏳ **Expires:** ${d.expires}\n👤 **Buyer:** ${d.buyer}`,
          inline: false
        })))
        .setFooter({ text: `Total: ${details.length} | Premium System`, iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616489.png' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  }
};
