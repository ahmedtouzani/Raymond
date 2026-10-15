// File: src/events/interactionCreate.js
const logger = require('../utils/logger');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  Events
} = require('discord.js');
const { hasStellarOrHigher } = require('../premium/premium');
const { getGuildConfig } = require('../database/guildConfig');
const { authorizeCommand } = require('../handlers/commandAuthorization');
const { allowsGuild } = require('../config/development');
const buttonHandlers = require('../handlers/buttons/buttonHandlers');

// Import the reaction role handler
const { handleReaction } = require('./reactionRoles');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!allowsGuild(interaction.guildId || interaction.guild?.id)) {
      return interaction.reply({ content: 'This development bot is restricted to its test server.', flags: 64 });
    }
    // Setup panels own their component collectors, including role/channel selectors.
    if (['setup:', 'emojiimport:', 'help:'].some(prefix => interaction.customId?.startsWith(prefix))) return;
    // ─────────────────────────────
    // ─ Slash Command Handling ─
    // ─────────────────────────────
    if (interaction.isCommand()) {
      const command = interaction.client.slashCommands.get(interaction.commandName);
      if (!command) return;
      try {
        const authorization = authorizeCommand(command, interaction);
        if (!authorization.allowed) {
          return interaction.reply({ content: authorization.message, flags: 64, allowedMentions: { parse: [] } });
        }
        await command.execute(interaction);
      } catch (error) {
        logger.error('Error executing slash command:', error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error executing this command.', flags: 64 });
        } else {
          await interaction.reply({ content: 'There was an error executing this command.', flags: 64 });
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      logger.info(`[InteractionCreate] Received modal submit with customId: "${interaction.customId}" (ID: ${interaction.id})`);

      // Staff Application Modal Routing
      if (interaction.customId.startsWith('apply_modal_')) {
        try {
          await buttonHandlers.handleApplicationModal(interaction);
        } catch (error) {
          logger.error(`Error handling application modal ${interaction.customId}:`, error);
           if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({ content: '❌ Error processing application.', flags: 64 });
           }
        }
        return;
      }

      const handler = buttonHandlers[interaction.customId];
      if (handler) {
        try {
          await handler(interaction);
        } catch (error) {
          logger.error(`Error handling modal ${interaction.customId}:`, error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error handling this form.', flags: 64 }).catch(() => { });
          } else {
            await interaction.reply({ content: 'There was an error handling this form.', flags: 64 }).catch(() => { });
          }
        }
      } else {
        await interaction.reply({ content: 'Unknown form submission.', flags: 64 }).catch(() => { });
      }
      return;
    }

    // ─────────────────────────────────
    // ─ Button Interaction Handling ─
    // ─────────────────────────────────
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      logger.info(`[InteractionCreate] Received component interaction with customId: "${interaction.customId}" (ID: ${interaction.id})`);

      // Role Menu Handler Hook
      if (interaction.customId.startsWith('rm_')) {
        const { handleRoleMenuInteraction } = require('../handlers/roleMenuHandler');
        try {
          await handleRoleMenuInteraction(interaction);
        } catch (error) {
          logger.error('Error in RoleMenu handler:', error);
          if (!interaction.replied) await interaction.reply({ content: '❌ Error processing menu.', ephemeral: true });
        }
        return;
      }

      // Ignore Wizard interactions (handled locally by collector)
      // Ignore Wizard interactions (handled locally by collector)
      if (['w_btn', 'w_sel', 'w_toggle', 'w_single', 'add_role', 'finish', 'cancel', 'Primary', 'Secondary', 'Success', 'Danger', 'help_menu', 'help_category', 'help_command'].includes(interaction.customId) || interaction.customId.startsWith('w_') || interaction.customId.startsWith('tpl_')) {
        return;
      }

      // Leaderboard pagination handler
      if (interaction.customId.startsWith('lb_')) {
        const parts = interaction.customId.split('_');

        // Defer immediately to prevent timeout
        try {
          await interaction.deferUpdate();
        } catch (deferError) {
          // If already acknowledged, continue anyway (e.g., multiple bot instances)
          if (deferError.code !== 40060) {
            throw deferError;
          }
        }

        if (parts[1] === 'refresh') {
          // lb_refresh_text_1 or lb_refresh_voice_1
          const type = parts[2];
          const page = parseInt(parts[3]) || 1;
          await buttonHandlers.lb_refresh_handler(interaction, type, page);
        } else if (parts[1] === 'page') {
          // lb_page_text_1 - page indicator button (disabled, should not trigger)
          // Already deferred above, nothing else to do
        } else {
          // lb_text_1 or lb_voice_1
          const type = parts[1];
          const page = parseInt(parts[2]) || 1;
          if (type === 'text') {
            await buttonHandlers.lb_text_handler(interaction, page);
          } else if (type === 'voice') {
            await buttonHandlers.lb_voice_handler(interaction, page);
          } else {
            // Unknown leaderboard button type
            await interaction.editReply({ content: '❌ Unknown leaderboard button.' }).catch(() => { });
          }
        }
        return;
      }

      // Staff Application Decision Routing (app_accept_ID, app_reject_ID)
      if (interaction.customId.startsWith('app_')) {
         const parts = interaction.customId.split('_');
         // expected: app, accept/reject, id
         if (parts.length >= 3 && (parts[1] === 'accept' || parts[1] === 'reject')) {
            const action = parts[1];
            const appId = parts[2];
            try {
               await buttonHandlers.handleApplicationDecision(interaction, action, appId);
            } catch (error) {
               logger.error(`Error handling application decision ${interaction.customId}:`, error);
               if (!interaction.replied && !interaction.deferred) {
                  await interaction.reply({ content: '❌ Error processing decision.', flags: 64 });
               }
            }
            return;
         }
      }

      const handler = buttonHandlers[interaction.customId];
      if (handler) {
        try {
          await handler(interaction);
        } catch (error) {
          logger.error(`Error handling button ${interaction.customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'There was an error handling this button.', flags: 64 }).catch(() => { });
          }
        }
      } else {
        await interaction.reply({ content: 'Unknown button interaction.', flags: 64 });
      }
    }
  },

  // Add reaction role event handlers
  setup(client) {
    // Handle reaction additions
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      try {
        await handleReaction(reaction, user, 'add');
      } catch (error) {
        logger.error('Error in MessageReactionAdd handler:', error);
      }
    });

    // Handle reaction removals
    client.on(Events.MessageReactionRemove, async (reaction, user) => {
      try {
        await handleReaction(reaction, user, 'remove');
      } catch (error) {
        logger.error('Error in MessageReactionRemove handler:', error);
      }
    });

    logger.info('Reaction role event handlers registered');
  }
};

// This allows the setup function to be called when the bot starts
if (require.main === module) {
  // This will be called when the bot starts up
  const { client } = require('../../index');
  if (client) {
    module.exports.setup(client);
  }
}
