const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const os = require('os');
const path = require('path');

module.exports = {
  name: 'botinfo',
  aliases: ['about', 'info'],
  description: 'Displays information about Project Raymond.',
  category: 'Utility',

  async execute(message, args, client) {
    // 1. Create the banner attachment
    // "assets" is in the root directory. 
    // We are in src/commands/utility, so root is ../../../
    const bannerPath = path.join(__dirname, '../../../assets/banner.png');
    const banner = new AttachmentBuilder(bannerPath, { name: 'banner.png' });

    // 2. Build the Embed
    const embed = new EmbedBuilder()
      .setColor(0x000001) // Pitch Black
      .setTitle('<a:utiliti:1466829554055381055> Project Raymond v2: Overlord')
      .setDescription(
        "**The Premium Discord Server Operating System**\n\n" +
        "Raymond is not just a bot; it's an **autonomous neural interface** designed to elevate your community. " +
        "Built on the **Parallel Universe Engine**, it combines high-fidelity graphics generation with a context-aware AI core.\n\n" +
        "**⚡ Core Capabilities:**\n" +
        "• **Neural Core:** Powered by `DeepSeek` & `Gemini` with Smart Fallback.\n" +
        "• **Visual Engine:** 4K Canvas rendering for Ranks & Leaderboards.\n" +
        "• **Autonomous Admin:** No-code dashboard & self-healing systems."
      )
      // Display the banner image
      .setImage('attachment://banner.png')
      .addFields(
        {
          name: '<a:endlessspinne:1463992178010230906> Lead Architect & Data Wizard',
          value: '**Ahmed Touzani**\n*The only man behind the magic.*\n📸 **Insta:** `ah_4__8`',
          inline: true
        },
        {
          name: '<a:system:1469335652431564852> System Status',
          value: `**Ping:** ${client.ws.ping}ms\n**Uptime:** <t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`,
          inline: true
        }
      )
      .setFooter({ text: '© 2026 Parallel Universe Inc. All Rights Reserved.', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    // 3. Action Row (Links)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Invite Raymond')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/oauth2/authorize?client_id=1005909843837714512&permissions=8&integration_type=0&scope=bot'),

      new ButtonBuilder()
        .setLabel('Parallel Universe HQ')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.gg/u2DcPn3j3z'),

      new ButtonBuilder()
        .setLabel('Developer Profile')
        .setStyle(ButtonStyle.Link)
        .setURL('https://github.com/ahmedtouzani'),

      new ButtonBuilder()
        .setLabel('Instagram')
        .setStyle(ButtonStyle.Link)
        .setURL('https://instagram.com/ah_4__8')
    );

    // 4. Send Message
    return message.reply({ embeds: [embed], components: [row], files: [banner] });
  }
};