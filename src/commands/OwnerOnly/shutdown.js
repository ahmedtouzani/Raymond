const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { gracefulShutdown } = require('../../utils/gracefulShutdown');
const db = require('../../services/database');

module.exports = {
  name: 'shutdown',
  aliases: ['tfi'],
  description: 'Safely shuts down the bot (Bot owner only).',
  usage: '=shutdown',
  category: 'OwnerOnly',
  ownerOnly: true, // Let the command handler manage the owner check
  cooldown: 0,
  permissions: [],
  async execute(message, args, client) {
    await sendEmbed(message, {
      title: '🛑 Shutdown Initiated',
      description: 'The bot is shutting down safely...',
      color: 0x23272A,
    });

    // Call graceful shutdown, passing the database client to ensure a fast exit
    gracefulShutdown('COMMAND', client, db);
  },
};