const { PermissionFlagsBits } = require('discord.js');
const setup = require('./setup');
module.exports = {
  name: 'levelsetup', guildOnly: true, category: 'Admin',
  description: 'Configure XP, voice eligibility, rewards and level-up announcements.',
  usage: 'levelsetup', permissions: [PermissionFlagsBits.Administrator],
  execute(message) { return setup.execute(message, ['levels']); },
};
