const { sendEmbed } = require('../handlers/functions/sendEmbed');

module.exports = {
  name: 'ping',
  description: 'Replies with Pong!',
  async execute(message, args, client) {
    await sendEmbed(message, {
      title: '🏓 Pong!',
      description: 'The bot is online and responsive.',
    });
  },
};
