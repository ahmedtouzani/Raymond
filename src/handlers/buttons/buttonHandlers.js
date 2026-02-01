const { PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getGuildConfig } = require('../../database/guildConfig');
const { createEmbed } = require('../../utils/embed');
const fs = require('fs');
const path = require('path');

function parseChannelIdsFromInput(input) {
  if (!input) return [];
  const matches = input.match(/\d{17,20}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Math.min(max, Math.max(min, num));
}

function hasAdminPermission(interaction) {
  return Boolean(interaction?.memberPermissions?.has?.(PermissionsBitField.Flags.Administrator));
}

async function denyIfNotAdmin(interaction) {
  if (hasAdminPermission(interaction)) return false;
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ content: '❌ You need Administrator permission to use this.', flags: 64 }).catch(() => { });
  }
  return true;
}

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

/**
 * Safely defer an interaction with error handling for multiple bot instances
 * @param {Interaction} interaction - The interaction to defer
 * @returns {Promise<boolean>} - True if successfully deferred, false if already handled or expired
 */
async function safeDeferUpdate(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
      return true;
    }
    return false; // Already deferred/replied
  } catch (error) {
    // Code 40060: Already acknowledged (multiple bot instances)
    // Code 10062: Unknown interaction (expired/timeout)
    if (error.code === 40060) {
      console.log(`[SafeDefer] Interaction ${interaction.id} already acknowledged by another instance`);
      return false;
    }
    if (error.code === 10062) {
      console.log(`[SafeDefer] Interaction ${interaction.id} expired`);
      return false;
    }
    // Unknown error, rethrow
    throw error;
  }
}

// Helper function for leaderboard pagination
async function handleLeaderboardPage(interaction, type, page, isRefresh = false) {
  const { getLeaderboard } = require('../../database/levelSystem');
  const { generateLeaderboard } = require('../../utils/canvasLeaderboard');
  const { getGuildTheme } = require('../../database/levelSettings');
  const { AttachmentBuilder } = require('discord.js');

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

    function calculateNextLevelXp(level) {
      if (level >= 100) return 0;
      if (level < 30) {
        return 500 * level * level - 500 * level + 1000;
      } else {
        return 200000 + (level - 30) * 50000;
      }
    }

    // Prepare user data for Canvas
    const users = [];
    for (let i = 0; i < pageData.length; i++) {
      const globalRank = offset + i + 1;
      const user = pageData[i];

      try {
        const member = await interaction.guild.members.fetch(user.user_id);
        const nextLevelXp = user.next_level_xp || calculateNextLevelXp(user.level);

        users.push({
          rank: globalRank,
          username: member.user.username,
          avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
          level: user.level,
          currentXP: user.xp,
          nextLevelXP: nextLevelXp,
          totalXP: user.xp
        });
      } catch (error) {
        continue;
      }
    }

    if (users.length === 0) {
      await interaction.editReply({ content: 'No active users found on this page.', components: [] });
      return;
    }

    // Get server theme
    const theme = await getGuildTheme(interaction.guild.id);

    // Generate Canvas leaderboard
    const imageBuffer = await generateLeaderboard({
      users,
      guild: interaction.guild,
      type,
      page,
      totalPages,
      theme
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

    // Navigation buttons
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
      await interaction.editReply({ files: [attachment], components: [row] });
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

  // Level Setup handlers
  levelsetup_theme: async (interaction) => {
    const { getGuildSettingsWithDefaults, updateGuildSettings } = require('../../database/levelSettings');

    try {
      await safeDeferUpdate(interaction);

      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('🎨 Theme Selection')
        .setDescription('Choose a theme for rank cards and leaderboards')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Current Theme', value: `**${settings.theme_preset}**`, inline: false },
          { name: 'Available Themes', value: '• **Dark** - Classic dark theme\n• **Light** - Clean light theme\n• **Neon** - Vibrant neon colors\n• **Gradient** - Purple gradient', inline: false }
        );

      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('levelsetup_theme_select')
            .setPlaceholder('Select a theme')
            .addOptions([
              { label: 'Dark', value: 'dark', description: 'Classic dark theme', emoji: '🌑' },
              { label: 'Light', value: 'light', description: 'Clean light theme', emoji: '☀️' },
              { label: 'Neon', value: 'neon', description: 'Vibrant neon colors', emoji: '💜' },
              { label: 'Gradient', value: 'gradient', description: 'Purple gradient', emoji: '🌈' }
            ])
        );

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [row, backButton] });
    } catch (error) {
      console.error('[LevelSetup] Theme menu error:', error);
    }
  },

  levelsetup_xp: async (interaction) => {
    const { getGuildSettingsWithDefaults } = require('../../database/levelSettings');

    try {
      await safeDeferUpdate(interaction);

      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('⚡ XP Settings')
        .setDescription('Configure XP rates and cooldowns')
        .setColor(0x5865F2)
        .addFields(
          { name: 'XP Multiplier', value: `**${settings.xp_multiplier}x**`, inline: true },
          { name: 'Text XP Range', value: `${settings.text_xp_min}-${settings.text_xp_max}`, inline: true },
          { name: 'Voice XP Rate', value: `${settings.voice_xp_rate}/min`, inline: true },
          { name: 'Cooldown', value: `${settings.xp_cooldown}s`, inline: true },
          { name: 'Excluded Channels', value: (settings.excluded_channels && settings.excluded_channels.length > 0) ? settings.excluded_channels.map(id => `<#${id}>`).join(', ') : 'None', inline: false }
        );

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_xp_multiplier')
            .setLabel('Set Multiplier')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('[LevelSetup] XP menu error:', error);
    }
  },

  levelsetup_levelup: async (interaction) => {
    const { getGuildSettingsWithDefaults, updateGuildSettings } = require('../../database/levelSettings');

    try {
      await interaction.deferUpdate();

      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('📢 Level-Up Messages')
        .setDescription('Configure level-up announcements')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Status', value: settings.levelup_enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Channel', value: settings.levelup_channel_id ? `<#${settings.levelup_channel_id}>` : 'Same channel', inline: true },
          { name: 'Include Card', value: settings.levelup_include_card ? 'Yes' : 'No', inline: true },
          { name: 'Message Template', value: `\`${settings.levelup_message}\``, inline: false }
        );

      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_levelup_toggle')
            .setLabel(settings.levelup_enabled ? 'Disable' : 'Enable')
            .setStyle(settings.levelup_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('levelsetup_levelup_toggle_card')
            .setLabel(settings.levelup_include_card ? 'Card: ON' : 'Card: OFF')
            .setStyle(settings.levelup_include_card ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('levelsetup_levelup_set_channel')
            .setLabel('Set Channel')
            .setStyle(ButtonStyle.Primary)
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_levelup_set_message')
            .setLabel('Set Message')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
    } catch (error) {
      console.error('[LevelSetup] Level-up menu error:', error);
    }
  },

  levelsetup_back: async (interaction) => {
    const { getGuildSettingsWithDefaults } = require('../../database/levelSettings');

    try {
      await safeDeferUpdate(interaction);

      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Level System Setup')
        .setDescription('Configure your server\'s level system settings')
        .setColor(0x5865F2)
        .addFields(
          { name: '🎨 Theme', value: `Current: **${settings.theme_preset}**`, inline: true },
          { name: '⚡ XP Multiplier', value: `**${settings.xp_multiplier}x**`, inline: true },
          { name: '📢 Level-Up Messages', value: settings.levelup_enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '🎁 Role Rewards', value: `${Object.keys(settings.role_rewards || {}).length} configured`, inline: true },
          { name: '💬 Text XP Range', value: `${settings.text_xp_min}-${settings.text_xp_max} per message`, inline: true },
          { name: '🎤 Voice XP Rate', value: `${settings.voice_xp_rate} per minute`, inline: true }
        )
        .setFooter({ text: 'Select an option below to configure' })
        .setTimestamp();

      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_theme')
            .setLabel('🎨 Theme')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_xp')
            .setLabel('⚡ XP Settings')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_levelup')
            .setLabel('📢 Level-Up Messages')
            .setStyle(ButtonStyle.Primary)
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_roles')
            .setLabel('🎁 Role Rewards')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_preview')
            .setLabel('👁️ Preview')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('levelsetup_reset')
            .setLabel('🔄 Reset to Defaults')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
    } catch (error) {
      console.error('[LevelSetup] Back button error:', error);
    }
  },

  levelsetup_levelup_toggle: async (interaction) => {
    const { getGuildSettingsWithDefaults, updateGuildSettings } = require('../../database/levelSettings');

    try {
      await safeDeferUpdate(interaction);

      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);
      const newStatus = !settings.levelup_enabled;

      await updateGuildSettings(interaction.guild.id, {
        levelup_enabled: newStatus
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Level-Up Messages ' + (newStatus ? 'Enabled' : 'Disabled'))
        .setDescription(newStatus ? 'Users will now receive level-up messages!' : 'Level-up messages have been disabled.')
        .setColor(newStatus ? 0x57F287 : 0xED4245);

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_back')
            .setLabel('← Back to Menu')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] Toggle error:', error);
    }
  },

  levelsetup_theme_select: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await safeDeferUpdate(interaction);
      const selected = interaction.values?.[0];
      if (!selected) return;
      await updateGuildSettings(interaction.guild.id, { theme_preset: selected });

      const embed = new EmbedBuilder()
        .setTitle('✅ Theme Updated')
        .setDescription(`Server theme is now set to **${selected}**.`)
        .setColor(0x57F287);

      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('levelsetup_back')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] Theme select error:', error);
    }
  },

  levelsetup_xp_multiplier: async (interaction) => {
    if (await denyIfNotAdmin(interaction)) return;

    try {
      const modal = new ModalBuilder()
        .setCustomId('levelsetup_xp_multiplier_modal')
        .setTitle('Set XP Multiplier');

      const input = new TextInputBuilder()
        .setCustomId('multiplier')
        .setLabel('Multiplier (0.1 - 10)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Example: 1.0');

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] xp multiplier modal open error:', error);
    }
  },

  levelsetup_xp_multiplier_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const raw = interaction.fields.getTextInputValue('multiplier');
      const value = clampNumber(raw, 0.1, 10);
      if (value === null) {
        await interaction.editReply({ content: '❌ Invalid multiplier. Use a number between 0.1 and 10.' });
        return;
      }

      await updateGuildSettings(interaction.guild.id, { xp_multiplier: value });
      await interaction.editReply({ content: `✅ XP multiplier updated to **${value}x**.` });
    } catch (error) {
      console.error('[LevelSetup] xp multiplier modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update multiplier.' }).catch(() => { });
    }
  },

  levelsetup_text_xp_range: async (interaction) => {
    if (await denyIfNotAdmin(interaction)) return;

    try {
      const modal = new ModalBuilder()
        .setCustomId('levelsetup_text_xp_range_modal')
        .setTitle('Set Text XP Range');

      const minInput = new TextInputBuilder()
        .setCustomId('min')
        .setLabel('Min XP per message (1 - 500)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Example: 15');

      const maxInput = new TextInputBuilder()
        .setCustomId('max')
        .setLabel('Max XP per message (1 - 500)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Example: 25');

      modal.addComponents(
        new ActionRowBuilder().addComponents(minInput),
        new ActionRowBuilder().addComponents(maxInput)
      );
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] text xp range modal open error:', error);
    }
  },

  levelsetup_text_xp_range_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const minRaw = interaction.fields.getTextInputValue('min');
      const maxRaw = interaction.fields.getTextInputValue('max');
      const min = clampNumber(minRaw, 1, 500);
      const max = clampNumber(maxRaw, 1, 500);
      if (min === null || max === null || min > max) {
        await interaction.editReply({ content: '❌ Invalid range. Ensure both are numbers and min <= max.' });
        return;
      }

      await updateGuildSettings(interaction.guild.id, { text_xp_min: min, text_xp_max: max });
      await interaction.editReply({ content: `✅ Text XP range updated to **${min}-${max}**.` });
    } catch (error) {
      console.error('[LevelSetup] text xp range modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update text XP range.' }).catch(() => { });
    }
  },

  levelsetup_voice_xp_rate: async (interaction) => {
    if (await denyIfNotAdmin(interaction)) return;

    try {
      const modal = new ModalBuilder()
        .setCustomId('levelsetup_voice_xp_rate_modal')
        .setTitle('Set Voice XP Rate');

      const input = new TextInputBuilder()
        .setCustomId('rate')
        .setLabel('Voice XP per minute (0 - 1000)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Example: 10');

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] voice xp rate modal open error:', error);
    }
  },

  levelsetup_voice_xp_rate_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const raw = interaction.fields.getTextInputValue('rate');
      const value = clampNumber(raw, 0, 1000);
      if (value === null) {
        await interaction.editReply({ content: '❌ Invalid voice XP rate. Use a number between 0 and 1000.' });
        return;
      }

      await updateGuildSettings(interaction.guild.id, { voice_xp_rate: value });
      await interaction.editReply({ content: `✅ Voice XP rate updated to **${value}/min**.` });
    } catch (error) {
      console.error('[LevelSetup] voice xp rate modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update voice XP rate.' }).catch(() => { });
    }
  },

  levelsetup_xp_cooldown: async (interaction) => {
    if (await denyIfNotAdmin(interaction)) return;

    try {
      const modal = new ModalBuilder()
        .setCustomId('levelsetup_xp_cooldown_modal')
        .setTitle('Set XP Cooldown');

      const input = new TextInputBuilder()
        .setCustomId('cooldown')
        .setLabel('Cooldown in seconds (0 - 3600)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Example: 60');

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] cooldown modal open error:', error);
    }
  },

  levelsetup_xp_cooldown_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const raw = interaction.fields.getTextInputValue('cooldown');
      const value = clampNumber(raw, 0, 3600);
      if (value === null) {
        await interaction.editReply({ content: '❌ Invalid cooldown. Use a number between 0 and 3600.' });
        return;
      }

      await updateGuildSettings(interaction.guild.id, { xp_cooldown: value });
      await interaction.editReply({ content: `✅ XP cooldown updated to **${value}s**.` });
    } catch (error) {
      console.error('[LevelSetup] cooldown modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update cooldown.' }).catch(() => { });
    }
  },

  levelsetup_excluded_channels: async (interaction) => {
    const { getGuildSettingsWithDefaults } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const modal = new ModalBuilder()
        .setCustomId('levelsetup_excluded_channels_modal')
        .setTitle('Excluded Channels');

      const input = new TextInputBuilder()
        .setCustomId('channels')
        .setLabel('Channel IDs or #mentions (one line)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Example: #general #spam or 123... 456...')
        .setValue((settings.excluded_channels || []).join(' '));

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] excluded channels modal open error:', error);
    }
  },

  levelsetup_excluded_channels_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const raw = interaction.fields.getTextInputValue('channels');
      const ids = parseChannelIdsFromInput(raw);
      await updateGuildSettings(interaction.guild.id, { excluded_channels: ids });
      await interaction.editReply({ content: `✅ Excluded channels updated. Count: **${ids.length}**.` });
    } catch (error) {
      console.error('[LevelSetup] excluded channels modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update excluded channels.' }).catch(() => { });
    }
  },

  levelsetup_levelup_toggle_card: async (interaction) => {
    const { getGuildSettingsWithDefaults, updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferUpdate();
      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);
      await updateGuildSettings(interaction.guild.id, { levelup_include_card: !settings.levelup_include_card });
      await module.exports.levelsetup_levelup(interaction);
    } catch (error) {
      console.error('[LevelSetup] toggle include card error:', error);
    }
  },

  levelsetup_levelup_set_channel: async (interaction) => {
    const { getGuildSettingsWithDefaults } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const modal = new ModalBuilder()
        .setCustomId('levelsetup_levelup_set_channel_modal')
        .setTitle('Set Level-Up Channel');

      const input = new TextInputBuilder()
        .setCustomId('channel')
        .setLabel('Channel ID or #mention (empty = same channel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Example: #levels')
        .setValue(settings.levelup_channel_id || '');

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] set channel modal open error:', error);
    }
  },

  levelsetup_levelup_set_channel_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const raw = interaction.fields.getTextInputValue('channel') || '';
      const ids = parseChannelIdsFromInput(raw);
      const channelId = ids[0] || null;
      await updateGuildSettings(interaction.guild.id, { levelup_channel_id: channelId });
      await interaction.editReply({ content: channelId ? `✅ Level-up channel set to <#${channelId}>.` : '✅ Level-up channel set to current channel.' });
    } catch (error) {
      console.error('[LevelSetup] set channel modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update level-up channel.' }).catch(() => { });
    }
  },

  levelsetup_levelup_set_message: async (interaction) => {
    const { getGuildSettingsWithDefaults } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);

      const modal = new ModalBuilder()
        .setCustomId('levelsetup_levelup_set_message_modal')
        .setTitle('Set Level-Up Message');

      const input = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Template: use {user} and {level}')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(settings.levelup_message || 'Congratulations {user}! You reached level {level}!');

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[LevelSetup] set message modal open error:', error);
    }
  },

  levelsetup_levelup_set_message_modal: async (interaction) => {
    const { updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferReply({ flags: 64 });
      const message = interaction.fields.getTextInputValue('message');
      if (!message || message.length > 1500) {
        await interaction.editReply({ content: '❌ Message is required and must be under 1500 characters.' });
        return;
      }
      await updateGuildSettings(interaction.guild.id, { levelup_message: message });
      await interaction.editReply({ content: '✅ Level-up message updated.' });
    } catch (error) {
      console.error('[LevelSetup] set message modal submit error:', error);
      await interaction.editReply({ content: '❌ Failed to update message.' }).catch(() => { });
    }
  },

  levelsetup_reset: async (interaction) => {
    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferUpdate();
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Reset Level Settings')
        .setDescription('This will reset all level system settings for this server back to defaults.')
        .setColor(0xED4245);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('levelsetup_reset_confirm')
          .setLabel('Yes, Reset')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('levelsetup_back')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('[LevelSetup] reset prompt error:', error);
    }
  },

  levelsetup_reset_confirm: async (interaction) => {
    const { resetGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferUpdate();
      await resetGuildSettings(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Reset Complete')
        .setDescription('Level system settings have been reset to defaults.')
        .setColor(0x57F287);

      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('levelsetup_back')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] reset confirm error:', error);
    }
  },

  levelsetup_preview: async (interaction) => {
    const { getGuildSettingsWithDefaults } = require('../../database/levelSettings');
    const { generateRankCard } = require('../../utils/canvasRankCard');
    const { AttachmentBuilder } = require('discord.js');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferUpdate();
      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);
      const member = interaction.member;

      const fakeUserData = {
        guild_id: interaction.guild.id,
        user_id: member.id,
        text_xp: 120,
        text_level: 10,
        voice_xp: 50,
        voice_level: 5,
        text_next_level_xp: 300,
        voice_next_level_xp: 200
      };

      const buffer = await generateRankCard(fakeUserData, member, 'text', 1, settings.theme_preset || 'dark');
      const attachment = new AttachmentBuilder(buffer, { name: 'level-preview.png' });

      const embed = new EmbedBuilder()
        .setTitle('👁️ Preview')
        .setDescription('This is how your rank cards will look with the current server theme.')
        .setColor(0x5865F2);

      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('levelsetup_back')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], files: [attachment], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] preview error:', error);
    }
  },

  levelsetup_roles: async (interaction) => {
    const { getLevelRoles } = require('../../database/levelRoles');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await interaction.deferUpdate();
      const textRoles = await getLevelRoles(interaction.guild.id, 'text');
      const voiceRoles = await getLevelRoles(interaction.guild.id, 'voice');

      const embed = new EmbedBuilder()
        .setTitle('🎁 Role Rewards')
        .setDescription('Role rewards are currently configured via the `levelrole` command.')
        .setColor(0x5865F2);

      const textValue = textRoles.length
        ? textRoles.map(r => `Level **${r.level}**: <@&${r.role_id}>`).join('\n')
        : 'None';
      const voiceValue = voiceRoles.length
        ? voiceRoles.map(r => `Level **${r.level}**: <@&${r.role_id}>`).join('\n')
        : 'None';

      embed.addFields(
        { name: 'Text Ladder', value: textValue, inline: false },
        { name: 'Voice Ladder', value: voiceValue, inline: false }
      );

      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('levelsetup_back')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] roles screen error:', error);
    }
  }
};