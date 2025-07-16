const { hasStellarOrHigher } = require('../../../premium/premium');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'rolemenu',
  description: 'Displays a test message for Stellar+ features.',
  category: 'OwnerOnly',
  ownerOnly: true,
  async execute(message, args) {
    if (!(await hasStellarOrHigher(message.guild.id))) {
      const embed = new EmbedBuilder()
        .setColor(0x23272A)
        .setAuthor({ name: 'Parallel Ultra Bot' })
        .setTitle('⭐ Premium Feature Locked')
        .setDescription('This command is only available to servers with the **Stellar Matrix** plan or higher.')
        .addFields(
          { name: '➡️ How to Upgrade', value: 'To unlock this feature, upgrade your server to **Stellar Matrix** or **Godmode Parallel**.' },
          { name: '➡️ Need Help?', value: '📞 Contact the bot owner: <@716381717589393499> or join our: 🔗 [Support Server](https://discord.gg/8N5ygn5aWp)' }
        )
        .setFooter({ text: 'Upgrade to unlock powerful premium features!' });
      return message.reply({ embeds: [embed] });
    }
    // Test logic: reply with a success embed
    const embed = new EmbedBuilder()
      .setColor(0x23272A)
      .setAuthor({ name: 'Parallel Ultra Bot' })
      .setTitle('✨ Role Menu Test')
      .setDescription('✅ You have access to Stellar Matrix or higher features!')
      .setFooter({ text: 'Premium Plan: Stellar Matrix or Godmode Parallel' });
    return message.reply({ embeds: [embed] });
  }
};