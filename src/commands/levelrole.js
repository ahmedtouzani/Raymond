const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { setLevelRole, removeLevelRole, getLevelRoles } = require('../database/levelRoles');

module.exports = {
  name: 'levelrole',
  aliases: ['lvlrole', 'rewardrole'],
  description: 'Admin: Configure level reward roles.',
  usage: 'levelrole <set|remove|list> [text|voice] <level> [@role]',
  prefixless: true,
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({
        embeds: [new EmbedBuilder().setDescription(' You need Manage Roles or Administrator to use this command.').setColor(0x23272A)]
      });
    }
    const sub = args[0];
    const ladder = (args[1] === 'voice') ? 'voice' : 'text';
    if (sub === 'set') {
      const level = parseInt(args[2], 10);
      const role = message.mentions.roles.first();
      if (!level || !role) {
        return message.reply({ embeds: [new EmbedBuilder().setDescription('Usage: levelrole set <text|voice> <level> @role').setColor(0x23272A)] });
      }
      await setLevelRole(message.guild.id, ladder, level, role.id);
      return message.reply({ embeds: [new EmbedBuilder().setDescription(`<a:okey:1467170671351173121> Set ${role} as reward for ${ladder} level ${level}.`).setColor(0x57F287)] });
    } else if (sub === 'remove') {
      const level = parseInt(args[2], 10);
      if (!level) {
        return message.reply({ embeds: [new EmbedBuilder().setDescription('Usage: levelrole remove <text|voice> <level>').setColor(0x23272A)] });
      }
      await removeLevelRole(message.guild.id, ladder, level);
      return message.reply({ embeds: [new EmbedBuilder().setDescription(`<a:okey:1467170671351173121> Removed reward role for ${ladder} level ${level}.`).setColor(0x57F287)] });
    } else if (sub === 'list') {
      const argLadder = args[1];

      // If user specified a specific ladder (text or voice), behave as before
      if (argLadder === 'text' || argLadder === 'voice') {
        const roles = await getLevelRoles(message.guild.id, argLadder);
        if (!roles.length) {
          return message.reply({ embeds: [new EmbedBuilder().setDescription(`No reward roles set for ${argLadder}.`).setColor(0x23272A)] });
        }
        const desc = roles.map(r => `Level **${r.level}**: <@&${r.role_id}>`).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle(`${argLadder.charAt(0).toUpperCase() + argLadder.slice(1)} Level Reward Roles`).setDescription(desc).setColor(0xFEE75C)] });
      }

      // Otherwise, list both ladders
      const ladders = ['text', 'voice'];
      const embed = new EmbedBuilder()
        .setTitle('Level Reward Roles')
        .setColor(0xFEE75C);

      let hasAny = false;
      for (const l of ladders) {
        const roles = await getLevelRoles(message.guild.id, l);
        if (roles.length) {
          hasAny = true;
          const fieldValue = roles.map(r => `Level **${r.level}**: <@&${r.role_id}>`).join('\n');
          embed.addFields({ name: `${l.charAt(0).toUpperCase() + l.slice(1)} Levels`, value: fieldValue, inline: false });
        }
      }
      if (!hasAny) {
        return message.reply({ embeds: [new EmbedBuilder().setDescription('No reward roles set for either text or voice.').setColor(0x23272A)] });
      }
      return message.reply({ embeds: [embed] });
    } else {
      return message.reply({ embeds: [new EmbedBuilder().setDescription('Usage: levelrole <set|remove|list> <text|voice> <level> [@role]').setColor(0x23272A)] });
    }
  }
};
