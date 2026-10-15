const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, createUsageEmbed } = require('../../utils/embed');
const { parseEmojis, planImports, hasImportPermission, botCanImport, downloadEmoji, publicError } = require('../../services/emojiImport');
const icons = require('../../config/setupEmojis');
const logger = require('../../utils/logger');
const pendingGuilds = new Set();
const markup = spec => `<${spec.animated ? 'a' : ''}:${spec.name}:${spec.id}>`;

module.exports = {
  name: 'stealemoji', aliases: ['se', 'addemoji'], prefixless: true, guildOnly: true,
  category: 'Moderation', cooldown: 5,
  description: 'Preview and import custom emojis, including animated emojis, into this server.',
  usage: 'se <custom emoji> [new_name] | se <emoji1> <emoji2>',
  async execute(message, args = []) {
    if (!hasImportPermission(message.member, message.author.id)) return message.reply({ embeds: [await createEmbed(message.guild.id, {
      title: 'Permission Denied', description: `${icons.warning} You need Create Expressions or Manage Expressions to import emojis.`,
    })] });
    let specs;
    try { specs = parseEmojis(args); }
    catch (error) {
      return message.reply({ embeds: [await createUsageEmbed(message.guild.id, {
        command: 'stealemoji / se', description: `${icons.warning} ${error.message}`,
        usage: '`se <custom emoji> [new_name]`\n`se <emoji1> <emoji2>`',
        examples: '`se <a:warningbug:1467300628907954300>`\n`se <a:warningbug:1467300628907954300> Warning`',
      })], allowedMentions: { parse: [] } });
    }
    if (pendingGuilds.has(message.guild.id)) return message.reply('An emoji import is already open in this server. Finish or cancel it first.');
    pendingGuilds.add(message.guild.id);
    let panel, collector, phase = 'preview';
    try {
      await Promise.all([message.guild.emojis.fetch(), message.guild.members.fetchMe()]);
      if (!botCanImport(message.guild.members.me)) throw new Error('The bot needs Create Expressions or Manage Expressions.');
      const plan = planImports(message.guild, specs);
      const fields = [];
      if (plan.accepted.length) fields.push({ name: `Ready to Import · ${plan.accepted.length}`, value: plan.accepted.map(spec => `${markup(spec)} **${spec.name}** · ${spec.animated ? 'Animated' : 'Static'}`).join('\n') });
      if (plan.skipped.length) fields.push({ name: 'Skipped', value: plan.skipped.map(spec => `**${spec.name}** · ${spec.reason}`).join('\n') });
      fields.push({ name: 'Available Slots', value: `Static: **${plan.remaining.static}** · Animated: **${plan.remaining.animated}**` });
      const embed = await createEmbed(message.guild.id, { title: 'Emoji Import', color: 0x8594F0,
        description: `${icons.designer} Review your emojis before adding them to **${message.guild.name}**.\nNothing is added until you confirm.`,
        fields, ...(plan.accepted.length === 1 ? { thumbnail: `https://cdn.discordapp.com/emojis/${plan.accepted[0].id}.${plan.accepted[0].animated ? 'gif' : 'png'}?size=128` } : {}) });
      if (!plan.accepted.length) { pendingGuilds.delete(message.guild.id); return message.reply({ embeds: [embed], allowedMentions: { parse: [] } }); }
      const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emojiimport:confirm').setLabel('Import Emojis').setEmoji(icons.success).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('emojiimport:cancel').setLabel('Cancel').setEmoji(icons.cross).setStyle(ButtonStyle.Secondary));
      panel = await message.reply({ embeds: [embed], components: [controls], allowedMentions: { parse: [] } });
      collector = panel.createMessageComponentCollector({ time: 90_000, filter: interaction => interaction.customId.startsWith('emojiimport:') });
      collector.on('collect', interaction => {
        if (interaction.user.id !== message.author.id) {
          interaction.reply({ content: 'Only the person who opened this preview can confirm it.', flags: 64 }).catch(() => {}); return;
        }
        if (phase !== 'preview') { interaction.deferUpdate().catch(() => {}); return; }
        phase = interaction.customId === 'emojiimport:cancel' ? 'cancelled' : 'importing';
        (async () => {
          await interaction.deferUpdate();
          collector.stop(phase);
          if (phase === 'cancelled') {
            await panel.edit({ embeds: [await createEmbed(message.guild.id, { title: 'Import Cancelled', description: `${icons.cross} No emojis were added.` })], components: [] }); return;
          }
          await panel.edit({ embeds: [await createEmbed(message.guild.id, { title: 'Importing Emojis', description: `${icons.utility} Adding your selected emojis…` })], components: [] });
          const member = await message.guild.members.fetch({ user: message.author.id, force: true });
          await Promise.all([message.guild.members.fetchMe(), message.guild.emojis.fetch()]);
          if (!hasImportPermission(member, message.author.id) || !botCanImport(message.guild.members.me)) throw new Error('Create Expressions or Manage Expressions permission is no longer available.');
          const current = planImports(message.guild, plan.accepted);
          const failures = [...plan.skipped, ...current.skipped], added = [];
          for (const spec of current.accepted) {
            try {
              const attachment = await downloadEmoji(spec);
              const created = await message.guild.emojis.create({ attachment, name: spec.name, reason: `Emoji import requested by ${message.author.id}; source ${spec.id}` });
              added.push(created.toString());
            } catch (error) {
              failures.push({ ...spec, reason: publicError(error) });
              logger.warn('Emoji import item failed', { code: error.code || error.name, sourceId: spec.id });
            }
          }
          const fields = [];
          if (added.length) fields.push({ name: `Added · ${added.length}`, value: added.join(' ') });
          if (failures.length) fields.push({ name: 'Not Added', value: failures.map(spec => `**${spec.name}** · ${spec.reason}`).join('\n') });
          await panel.edit({ embeds: [await createEmbed(message.guild.id, { title: 'Emoji Import Complete', description: `${added.length ? icons.success : icons.warning} ${added.length} emoji(s) added to this server.`, fields })], components: [] });
        })().catch(async error => {
          logger.error('Emoji import failed:', error);
          if (panel) await panel.edit({ embeds: [await createEmbed(message.guild.id, { title: 'Import Stopped', description: `${icons.warning} ${/permission|Expressions/.test(error.message || '') ? error.message : 'Could not complete the import. Please try again.'}` })], components: [] }).catch(() => {});
        }).finally(() => pendingGuilds.delete(message.guild.id));
      });
      collector.on('end', () => {
        if (phase !== 'preview') return;
        phase = 'expired'; pendingGuilds.delete(message.guild.id);
        (async () => panel.edit({ embeds: [await createEmbed(message.guild.id, { title: 'Preview Expired', description: `${icons.category} No emojis were added. Run se again to open a new preview.` })], components: [] }))().catch(() => {});
      });
    } catch (error) {
      pendingGuilds.delete(message.guild.id); logger.error('Failed to open emoji import:', error);
      if (collector) collector.stop('error');
      await message.reply({ embeds: [await createEmbed(message.guild.id, { title: 'Emoji Import Unavailable', description: `${icons.warning} ${/Expressions/.test(error.message || '') ? error.message : 'Could not load server emojis. Check the bot permissions and try again.'}` })] });
    }
  },
};
