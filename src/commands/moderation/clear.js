const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'clear',
  aliases: ['ms7'],
  description: 'Bulk delete messages in the channel.',
  usage: '=clear [amount]',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageMessages],
  category: 'Moderation',
  prefixless: true,

  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    // Ensure the user (or bot owner) has permissions.
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Manage Messages** permission to use this command.',
        color: 0x23272A,
      });
    }

    // Validate and parse the argument.
    let amount = parseInt(args[0], 10);
    if (!amount || isNaN(amount)) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'clear',
        description: '<a:warningbug:1467300628907954300> **Invalid Amount**\nPlease provide a valid number of messages to delete.',
        usage: '`!clear [amount]`',
        examples: '`!clear 5`\n`!clear 50`'
      });
      return message.reply({ embeds: [embed] });
    }

    /* 
      Discord's bulkDelete method accepts up to 100 messages.
      We add the command message to the deletion.
      Therefore, if the user requests 100 messages, we adjust the number so that (amount + 1) equals 100.
    */
    if (amount >= 100) {
      amount = 99;
    }
    const deleteCount = amount + 1;

    try {
      // Attempt to bulk delete messages
      const deleted = await message.channel.bulkDelete(deleteCount, true);
      // If the command message was deleted, subtract it from the count.
      const successCount = deleted.has(message.id) ? deleted.size - 1 : deleted.size;

      // Send a confirmation embed that will auto-delete after 5 seconds.
      const confirmation = await message.channel.send({
        embeds: [{
          title: '🧹 Messages Deleted',
          description: `Successfully deleted **${successCount}** messages.`,
          color: 0x23272A,
          footer: {
            text: 'Parallel Ultra Bot',
            icon_url: 'https://cdn.discordapp.com/attachments/1378500623967981600/1378530914182627481/pu.jpg?ex=683cf075&is=683b9ef5&hm=ddde0abba25b5431ff9d65670ee0317457bc66db8713313e58fe3dfe25d12336&'
          }
        }]
      });
      setTimeout(() => {
        confirmation.delete().catch(console.error);
      }, 5000);
    } catch (error) {
      try {
        // Try to send the error message without replying to the original message
        await message.channel.send({
          embeds: [{
            title: '<a:warningbug:1467300628907954300> Error',
            description: `Failed to delete messages: \`${error.message}\`\nNote: Discord only allows bulk deletion of messages under 14 days old.`,
            color: 0x23272A,
            footer: {
              text: 'Parallel Ultra Bot',
              icon_url: 'https://cdn.discordapp.com/attachments/1378500623967981600/1378530914182627481/pu.jpg?ex=683cf075&is=683b9ef5&hm=ddde0abba25b5431ff9d65670ee0317457bc66db8713313e58fe3dfe25d12336&'
            }
          }]
        });
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  },
};