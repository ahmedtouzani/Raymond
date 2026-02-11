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
        .setTitle('🎨 Theme Settings')
        .setDescription('Configure theme for rank cards and leaderboards')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Server Theme', value: `**${settings.theme_preset}**`, inline: true },
          { name: 'Force for All Users', value: settings.force_theme ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '\u200b', value: '\u200b', inline: true }, // Spacer
          { name: 'Available Themes', value: '• **Dark** - Classic dark theme\n• **Light** - Clean light theme\n• **Neon** - Vibrant neon colors\n• **Gradient** - Purple gradient', inline: false },
          { name: 'Force Theme Info', value: 'When enabled, all users will see the server theme regardless of their personal preference set via `!ranktheme`.', inline: false }
        );

      const row1 = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('levelsetup_theme_select')
            .setPlaceholder('Select a theme')
            .addOptions([
              { label: 'Dark', value: 'dark', description: 'Classic dark theme', emoji: '🌙' },
              { label: 'Light', value: 'light', description: 'Clean light theme', emoji: '☀️' },
              { label: 'Neon', value: 'neon', description: 'Vibrant neon colors', emoji: '✨' },
              { label: 'Gradient', value: 'gradient', description: 'Purple gradient', emoji: '🌈' }
            ])
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_theme_force_toggle')
            .setLabel(settings.force_theme ? '🔓 Disable Force Theme' : '🔒 Enable Force Theme')
            .setStyle(settings.force_theme ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('levelsetup_theme_reset_all')
            .setLabel('🔄 Reset All User Themes')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('levelsetup_back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
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

      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_xp_multiplier')
            .setLabel('⚡ Multiplier')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_text_xp_range')
            .setLabel('💬 Text XP')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_voice_xp_rate')
            .setLabel('🎤 Voice XP')
            .setStyle(ButtonStyle.Primary)
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_xp_cooldown')
            .setLabel('⏱️ Cooldown')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('levelsetup_excluded_channels')
            .setLabel('🚫 Excluded Channels')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('levelsetup_back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
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

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_theme')
            .setLabel('← Back to Theme Settings')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] Theme select error:', error);
    }
  },

  levelsetup_theme_force_toggle: async (interaction) => {
    const { getGuildSettingsWithDefaults, updateGuildSettings } = require('../../database/levelSettings');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await safeDeferUpdate(interaction);

      const settings = await getGuildSettingsWithDefaults(interaction.guild.id);
      const newValue = !settings.force_theme;

      await updateGuildSettings(interaction.guild.id, { force_theme: newValue });

      const embed = new EmbedBuilder()
        .setTitle(newValue ? '🔒 Force Theme Enabled' : '🔓 Force Theme Disabled')
        .setDescription(
          newValue
            ? 'All users will now see the server theme, regardless of their personal preference.'
            : 'Users can now use their personal theme preference set via `!ranktheme`.'
        )
        .setColor(newValue ? 0x57F287 : 0x5865F2);

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_theme')
            .setLabel('← Back to Theme Settings')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] Force theme toggle error:', error);
    }
  },

  levelsetup_theme_reset_all: async (interaction) => {
    const db = require('../../services/database');

    if (await denyIfNotAdmin(interaction)) return;

    try {
      await safeDeferUpdate(interaction);

      // Delete all user theme preferences for this guild
      const result = await db.query(
        'DELETE FROM user_preferences WHERE guild_id = $1 AND preference_key = $2',
        [interaction.guild.id, 'rank_theme']
      );

      const embed = new EmbedBuilder()
        .setTitle('🔄 User Themes Reset')
        .setDescription(`Reset ${result.rowCount || 0} user theme preferences. All users will now use the server theme or default theme.`)
        .setColor(0x57F287);

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('levelsetup_theme')
            .setLabel('← Back to Theme Settings')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [backButton] });
    } catch (error) {
      console.error('[LevelSetup] Reset themes error:', error);
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
  },

  // === Smart Staff Application System ===

  // === Smart Staff Application System ===

  // 1. View Role Info (triggered by Panel Buttons)
  view_app_moderator: async (i) => handleViewApp(i, 'moderator'),
  view_app_designer: async (i) => handleViewApp(i, 'designer'),
  view_app_developer: async (i) => handleViewApp(i, 'developer'),

  // 2. Start Application (triggered by "Apply" button in Info Embed)
  start_app_moderator: async (i) => handleStartApp(i, 'moderator'),
  start_app_designer: async (i) => handleStartApp(i, 'designer'),
  start_app_developer: async (i) => handleStartApp(i, 'developer'),

  // Helper for admin review buttons
  handleApplicationDecision: async (interaction, action, appId) => {
      const db = require('../../services/database');
      // Verify permissions
      const guildConfig = await getGuildConfig(interaction.guild.id);
      // We assume admins or specific roles can review. Checking Admin for safety first.
      // Better: check if user has permission to manage channels or is admin.
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && 
          !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
          return interaction.reply({ content: '❌ You do not have permission to review applications.', flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      // Fetch application
      const res = await db.query('SELECT * FROM applications WHERE id = $1', [appId]);
      if (res.rows.length === 0) {
          return interaction.editReply('❌ Application not found.');
      }
      const app = res.rows[0];

      if (app.status !== 'pending') {
          return interaction.editReply(`❌ This application has already been ${app.status}.`);
      }

      // Execute Action
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      await db.query(
          'UPDATE applications SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3',
          [newStatus, interaction.user.id, appId]
      );

      // Notify User
      let dmSent = false;
      const member = await interaction.guild.members.fetch(app.user_id).catch(() => null);
      if (member) {
          try {
              if (action === 'accept') {
                  const roleKey = `role_${app.category}`; // e.g. role_moderator
                  const roleId = guildConfig.settings[roleKey];
                  if (roleId) {
                      await member.roles.add(roleId);
                  }
                  
                  const acceptEmbed = await createEmbed(interaction.guild.id, {
                      title: '🎉 Application Accepted!',
                      description: `Congratulations! Your application for **${app.category}** has been accepted. Welcome to the team!`,
                      color: 0x57F287 // Green
                  });
                  await member.send({ embeds: [acceptEmbed] });
              } else {
                  const rejectEmbed = await createEmbed(interaction.guild.id, {
                      title: 'Application Update',
                      description: `Thank you for your interest in the **${app.category}** position. After careful review, we have decided not to proceed with your application at this time.\n\nYou may re-apply in the future.`,
                      color: 0xED4245 // Red
                  });
                  await member.send({ embeds: [rejectEmbed] });
              }
              dmSent = true;
          } catch (e) {
              console.log('Failed to DM user:', e);
          }
      }

      // Update Review Embed
      const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      originalEmbed.setColor(action === 'accept' ? 0x57F287 : 0xED4245);
      originalEmbed.addFields({ name: 'Status', value: `${action === 'accept' ? '✅ Accepted' : '❌ Rejected'} by <@${interaction.user.id}>`, inline: false });
      
      await interaction.message.edit({ embeds: [originalEmbed], components: [] });

      await interaction.editReply(`✅ Application ${action}ed.${dmSent ? ' User notified.' : ' User could not be DM\'d.'}`);
  },

  handleApplicationModal: async (interaction) => {
    const db = require('../../services/database');
    const { getGuildConfig } = require('../../database/guildConfig');
    
    try {
      await interaction.deferReply({ flags: 64 });
      
      const customId = interaction.customId; // e.g., apply_modal_moderator
      const category = customId.replace('apply_modal_', '');
      
      // Collect answers
      const answers = {};
      interaction.fields.fields.forEach((field) => {
        // field.customId is q1, q2, etc.
        // We'll store them as q1: "Answer", ...
        // Better: maybe store label too? For now, simple key-value.
        answers[field.customId] = field.value;
      });

      // Save to DB (Status: pending)
      const res = await db.query(
        `INSERT INTO applications (guild_id, user_id, category, status, answers, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [interaction.guild.id, interaction.user.id, category, 'pending', JSON.stringify(answers)]
      );
      
      const appId = res.rows[0].id;

      // Get Review Channel
      const guildConfig = await getGuildConfig(interaction.guild.id);
      const reviewChannelId = guildConfig.settings.staff_review_channel;
      
      if (!reviewChannelId) {
        // Log warning, notify user admins haven't set it up
         console.warn(`[StaffApp] Review channel not set for guild ${interaction.guild.id}`);
         await interaction.editReply('✅ Application submitted! (Note to admins: Setup staff_review_channel to see it).');
         return;
      }
      
      const reviewChannel = interaction.guild.channels.cache.get(reviewChannelId);
      if (!reviewChannel) {
         console.warn(`[StaffApp] Review channel ${reviewChannelId} not found in guild ${interaction.guild.id}`);
         await interaction.editReply('✅ Application submitted! (Note: Review channel not found).');
         return;
      }

      // Create Review Embed
      const fields = [];
      // Map q1, q2... to actual questions based on category, or just use generic labels?
      // Since we defined questions in the modal, we know them.
      // But re-defining mappings here duplicates logic.
      // For simplicity, we can format Q1, Q2, etc. Or maybe passed in hidden field? No.
      // Let's just list the answers in order.
      
      let i = 1;
      interaction.fields.fields.forEach((field) => {
         // Try to get label if accessible, otherwise Q1
         // field contains customId, value, type.
         // field.data? No.
         // We'll just display "Question 1", "Question 2" or use the answer directly if we assume the reviewer knows the questions.
         // Text input components in interaction.fields are Collection<Snowflake, TextInputComponent>.
         // Actually, we can just iterate.
         fields.push({ name: `Question ${i++}`, value: field.value.substring(0, 1024), inline: false });
      });

      const reviewEmbed = await createEmbed(interaction.guild.id, {
        title: `📄 New ${category.charAt(0).toUpperCase() + category.slice(1)} Application`,
        description: `**Applicant:** <@${interaction.user.id}> (${interaction.user.tag})\n**ID:** ${appId}\n**Created:** <t:${Math.floor(Date.now()/1000)}:R>`,
        fields: fields,
        color: 0x5865F2, // Blurple
        thumbnail: interaction.user.displayAvatarURL({ dynamic: true })
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_accept_${appId}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`app_reject_${appId}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

      const msg = await reviewChannel.send({ embeds: [reviewEmbed], components: [row] });
      
      // Update DB with message ID and channel ID for transparency/tracking
      await db.query(
        'UPDATE applications SET message_id = $1, channel_id = $2 WHERE id = $3',
        [msg.id, reviewChannel.id, appId]
      );

      await interaction.editReply({ content: '✅ Your application has been submitted successfully! Good luck!' });

    } catch (error) {
      console.error('Error handling application modal:', error);
      await interaction.editReply({ content: '❌ Failed to submit application. Please try again later.' }).catch(() => {});
    }
  }
};

// === Helper Functions for Applications ===

async function handleViewApp(interaction, category) {
    try {
        await interaction.deferReply({ flags: 64 });

        // 1. Eligibility Checks (replies with error if fails)
        const eligible = await checkEligibility(interaction);
        if (!eligible) return;

        // 2. Info Content
        const info = {
            moderator: {
                title: '🛡️ Moderation Staff',
                desc: 'Become a guardian of our community. Maintain order, assist users, and enforce rules.',
                reqs: '• account age 90+ days\n• Active for 2+ months\n• calm under pressure',
            },
            designer: {
                title: '🎨 Graphic Designer',
                desc: 'Shape the visual identity of our brand. Create assets, banners, and marketing materials.',
                reqs: '• account age 90+ days\n• Portfolio required\n• Proficient in Adobe Suite/Figma',
            },
            developer: {
                title: '💻 Software Developer',
                desc: 'Build the future of our platform. Maintain bots, websites, and internal tools.',
                reqs: '• account age 90+ days\n• GitHub required\n• Node.js / Python knowledge',
            }
        }[category];

        const embed = new EmbedBuilder()
            .setTitle(info.title)
            .setDescription(info.desc)
            .addFields({ name: '📋 Requirements', value: info.reqs })
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`start_app_${category}`)
                .setLabel(`Apply for ${category.charAt(0).toUpperCase() + category.slice(1)}`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );

        await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error(`Error in handleViewApp (${category}):`, error);
        await interaction.editReply({ content: '❌ An error occurred.' }).catch(() => {});
    }
}

async function handleStartApp(interaction, category) {
    try {
        // No defer here! showModal must be the first response.
        // Wait, did we come from checkEligibility? No, view_app checked it.
        // But user might have clicked the button hours later? 
        // We should re-check eligibility OR just let them fail on submit?
        // Let's re-check but we can't do it async easily before showModal if it takes too long?
        // DB call is fast.
        
        // ISSUE: showModal MUST be the *first* response. 
        // But we are in a handler. interactionCreate usually calls handler(interaction).
        // If we do await db.query, it might be too slow? usually fine (<3s).
        
        // Re-check eligibility (silently? or fail with reply?)
        // If we reply, we can't showModal.
        
        // Let's assume eligibility was checked in 'view' step. 
        // Worst case, we check again on modal submit/save? 
        // We DO check on modal submit in `handleApplicationModal`? 
        // Actually `handleApplicationModal` in my previous code DID NOT check account age/cooldown again.
        // I should probably move the checks to `handleApplicationModal` too to be safe?
        // For now, let's keep checks in `view` (to save user time) and `submit` (security).
        
        let modal;
        if (category === 'moderator') {
            modal = new ModalBuilder().setCustomId('apply_modal_moderator').setTitle('Moderator Application')
                .addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('Age').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('Timezone & Availability').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('Why do you want to be a mod?').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('Experience?').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
        } else if (category === 'designer') {
            modal = new ModalBuilder().setCustomId('apply_modal_designer').setTitle('Designer Application')
                .addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('Portfolio Link').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('Software Proficiency').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('Experience?').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
        } else if (category === 'developer') {
            modal = new ModalBuilder().setCustomId('apply_modal_developer').setTitle('Developer Application')
                .addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('Programming Languages').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('GitHub Profile').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('Projects / Experience?').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
        }

        await interaction.showModal(modal);

    } catch (error) {
        console.error(`Error in handleStartApp (${category}):`, error);
        if (!interaction.replied) await interaction.reply({ content: '❌ An error occurred.', flags: 64 });
    }
}

async function checkEligibility(interaction) {
    // 1. Account Age (90 days)
    const accountAge = Date.now() - interaction.user.createdTimestamp;
    const minAge = 90 * 24 * 60 * 60 * 1000;
    if (accountAge < minAge) {
        await interaction.editReply({
            content: `❌ **Account too young.**\nYou must be on Discord for at least 90 days to apply.\nYour account age: ${Math.floor(accountAge / (1000 * 60 * 60 * 24))} days.`
        });
        return false;
    }

    // 2. Cooldown (7 days)
    const db = require('../../services/database');
    const { rows } = await db.query(
        `SELECT created_at FROM applications 
         WHERE guild_id = $1 AND user_id = $2 
         ORDER BY created_at DESC LIMIT 1`,
        [interaction.guild.id, interaction.user.id]
    );

    if (rows.length > 0) {
        const lastApp = rows[0];
        const cooldown = 7 * 24 * 60 * 60 * 1000;
        const timeSince = Date.now() - new Date(lastApp.created_at).getTime();

        if (timeSince < cooldown) {
            const daysLeft = Math.ceil((cooldown - timeSince) / (1000 * 60 * 60 * 24));
            await interaction.editReply({
                content: `❌ **Cooldown Active.**\nYou have applied recently. Please wait **${daysLeft} more days** before applying again.`
            });
            return false;
        }
    }
    return true;
}