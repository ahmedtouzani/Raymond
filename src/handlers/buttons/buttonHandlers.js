const { PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { createEmbed } = require('../../utils/embed');
const fs = require('fs');
const path = require('path');

// Helper to scan commands (reuse from help.js)
function scanCommands(dir) {
  const categories = {};
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subdir = path.join(dir, entry.name);
      const subcommands = scanCommands(subdir);
      if (Object.keys(subcommands).length > 0) {
        categories[entry.name] = subcommands[entry.name] || [];
        Object.assign(categories, subcommands);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const filePath = path.join(dir, entry.name);
      try {
        const cmd = require(filePath);
        const name = cmd.name;
        const description = cmd.description;
        const category = path.basename(path.dirname(filePath));
        if (!categories[category]) categories[category] = [];
        categories[category].push({ name, description, filePath });
      } catch (e) { }
    }
  }
  return categories;
}

const prefixCategories = scanCommands(path.join(__dirname, '../../commands'));

// Helper function for leaderboard pagination
async function handleLeaderboardPage(interaction, type, page, isRefresh = false) {
  const { getLeaderboard } = require('../../database/levelSystem');

  try {
    // Interaction is already deferred by the routing layer
    const usersPerPage = 10;
    const offset = (page - 1) * usersPerPage;

    const leaderboard = await getLeaderboard(interaction.guild.id, type, 100);

    if (!leaderboard || leaderboard.length === 0) {
      await interaction.editReply({ content: `No ${type} XP data available yet.`, components: [] });
      return;
    }

    const totalPages = Math.ceil(leaderboard.length / usersPerPage);
    const pageData = leaderboard.slice(offset, offset + usersPerPage);

    const medals = ["🥇", "🥈", "🥉"];
    const formatXP = n => n.toLocaleString();

    function createProgressBar(xp, nextLevelXp, length = 12) {
      const percent = Math.min(1, xp / nextLevelXp);
      const filled = Math.round(percent * length);
      return `▰`.repeat(filled) + `▱`.repeat(length - filled);
    }

    function calculateNextLevelXp(level) {
      if (level >= 100) return 0;
      if (level < 30) {
        return 500 * level * level - 500 * level + 1000;
      } else {
        return 200000 + (level - 30) * 50000;
      }
    }

    let description = '';
    for (let i = 0; i < pageData.length; i++) {
      const globalRank = offset + i + 1;
      const user = pageData[i];
      const medal = globalRank <= 3 ? medals[globalRank - 1] : `**${globalRank}.**`;

      try {
        const member = await interaction.guild.members.fetch(user.user_id);
        const nextLevelXp = user.next_level_xp || calculateNextLevelXp(user.level);
        const bar = createProgressBar(user.xp, nextLevelXp);

        description += `${medal} ${member.user.username}\n`;
        description += `Level **${user.level}** • ${formatXP(user.xp)} / ${formatXP(nextLevelXp)} XP\n`;
        description += `${bar}\n\n`;
      } catch (error) {
        continue;
      }
    }

    if (!description) {
      description = 'No active users found.';
    }

    const embed = new EmbedBuilder()
      .setTitle(`${type === 'text' ? '📝 Text' : '🎤 Voice'} Leaderboard`)
      .setDescription(description)
      .setColor(type === 'text' ? 0x5865F2 : 0xED4245)
      .setFooter({ text: `Page ${page}/${totalPages} • ${leaderboard.length} total users${isRefresh ? ' • Refreshed' : ''}` })
      .setTimestamp();

    if (leaderboard[0]) {
      try {
        const topMember = await interaction.guild.members.fetch(leaderboard[0].user_id);
        embed.setThumbnail(topMember.user.displayAvatarURL({ extension: 'png', size: 128 }));
      } catch (error) { }
    }

    const totalXP = leaderboard.reduce((sum, u) => sum + u.xp, 0);
    const avgLevel = Math.round(leaderboard.reduce((sum, u) => sum + u.level, 0) / leaderboard.length);

    embed.addFields({
      name: '📊 Server Stats',
      value: `Total XP: **${formatXP(totalXP)}**\nAverage Level: **${avgLevel}**`,
      inline: false
    });

    const row = new ActionRowBuilder();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lb_${type}_${Math.max(1, page - 1)}`)
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),

      new ButtonBuilder()
        .setCustomId(`lb_page_${type}_${page}`)
        .setLabel(`Page ${page}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId(`lb_${type}_${Math.min(totalPages, page + 1)}`)
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),

      new ButtonBuilder()
        .setCustomId(`lb_refresh_${type}_${page}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Success)
    );

    // Only edit if interaction was deferred or replied
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    console.error('Error handling leaderboard page:', error);
    // Only edit if interaction was deferred or replied
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ Failed to load leaderboard.', components: [] }).catch(() => { });
    }
  }
}

module.exports = {
  create_ticket: async (interaction) => {
    // CRITICAL: Defer immediately to prevent 3-second timeout
    try {
      await interaction.deferReply({ flags: 64 }); // flags: 64 = ephemeral
    } catch (deferError) {
      console.error('Failed to defer interaction:', deferError);
      return; // Can't proceed if we can't defer
    }

    try {
      const guild = interaction.guild;
      const ticketChannelName = `ticket-${interaction.user.username}-${interaction.user.discriminator}`;

      // Check if the user already has an open ticket
      const existingChannel = guild.channels.cache.find(ch =>
        ch.name.startsWith('ticket-') &&
        ch.topic &&
        ch.topic.includes(interaction.user.id)
      );

      if (existingChannel) {
        await interaction.editReply({ content: 'You already have an open ticket!' });
        return;
      }

      // Retrieve the guild configuration to get the ticket category ID
      const guildConfig = await getGuildConfig(guild.id);
      if (!guildConfig || !guildConfig.settings || !guildConfig.settings.ticketCategoryId) {
        await interaction.editReply({ content: '❌ Ticket system is not configured. Please contact an administrator.' });
        return;
      }
      const ticketCategoryId = guildConfig.settings.ticketCategoryId;

      // Build permission overwrites array
      const overwrites = [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        }
      ];

      // Add all mod roles from per-guild config
      const modRoleIds = (guildConfig.settings.modRoles || []);
      for (const roleId of modRoleIds) {
        if (guild.roles.cache.has(roleId)) {
          overwrites.push({
            id: roleId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          });
        }
      }

      // Create a new text channel for the ticket under the guild-specific category
      const ticketChannel = await guild.channels.create({
        name: ticketChannelName,
        type: ChannelType.GuildText,
        parent: ticketCategoryId,
        topic: `Ticket channel for user ID: ${interaction.user.id}`,
        permissionOverwrites: overwrites,
      });

      // Mention mod roles and greet them in the new ticket channel
      const modRoleIDs = (guildConfig.settings.modRoleIDs || guildConfig.settings.modRoles || []);
      const modMentions = modRoleIDs.map(id => `<@&${id}>`).join(' ');
      await ticketChannel.send({
        content: `Hi ${modMentions}, this member ${interaction.user} needs you!`,
        allowedMentions: { roles: modRoleIDs }
      });

      // Create a Close Ticket button
      const closeTicketButton = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(closeTicketButton);

      // Create an embed for the ticket welcome message
      const ticketEmbed = new EmbedBuilder()
        .setColor(0x131416)
        .setTitle('Ticket Created')
        .setDescription(
          'Thank you for opening a ticket! Please describe your issue in detail. A moderator will be with you shortly.\\n\\nWhen your issue is resolved, click the **Close Ticket** button below.'
        )
        .setTimestamp();

      await ticketChannel.send({
        embeds: [ticketEmbed],
        components: [row],
      });

      await interaction.editReply({ content: `Your ticket has been created: ${ticketChannel}` });
    } catch (error) {
      console.error('Error creating ticket channel:', error);
      try {
        await interaction.editReply({ content: 'There was an error creating your ticket. Please try again later.' }).catch(() => { });
      } catch (err) {
        console.error('Could not reply to interaction error:', err);
      }
    }
  },
  close_ticket: async (interaction) => {
    try {
      await interaction.deferReply({ flags: 64 });
      const ticketChannel = interaction.channel;
      // Verify if the user is allowed to close the ticket.
      // Check whether the channel's topic contains the ticket creator's ID.
      if (!ticketChannel.topic || !ticketChannel.topic.includes(interaction.user.id)) {
        // If not the ticket owner, require Administrator permissions.
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.editReply({ content: "You don't have permission to close this ticket." });
          return;
        }
      }
      await interaction.editReply({ content: 'Closing ticket...' });
      // Delay deletion for confirmation (3 seconds)
      setTimeout(() => ticketChannel.delete('Ticket closed'), 3000);
    } catch (error) {
      console.error('Error closing ticket channel:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'There was an error closing the ticket. Please try again later.' });
      } else {
        await interaction.reply({ content: 'There was an error closing the ticket. Please try again later.', flags: 64 });
      }
    }
  },

  // Leaderboard pagination handlers
  lb_text_handler: async (interaction, page) => {
    await handleLeaderboardPage(interaction, 'text', page);
  },

  lb_voice_handler: async (interaction, page) => {
    await handleLeaderboardPage(interaction, 'voice', page);
  },

  lb_refresh_handler: async (interaction, type, page) => {
    await handleLeaderboardPage(interaction, type, page, true);
  },
};