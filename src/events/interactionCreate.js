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
const buttonHandlers = require('../handlers/buttons/buttonHandlers');

// Import the reaction role handler
const { handleReaction } = require('./reactionRoles');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // ─────────────────────────────
    // ─ Slash Command Handling ─
    // ─────────────────────────────
    if (interaction.isCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
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

    // ─────────────────────────────────
    // ─ Button Interaction Handling ─
    // ─────────────────────────────────
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      logger.info(`[InteractionCreate] Received component interaction with customId: "${interaction.customId}"`);

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
      if (['w_btn', 'w_sel', 'w_toggle', 'w_single', 'add_role', 'finish', 'cancel', 'Primary', 'Secondary', 'Success', 'Danger'].includes(interaction.customId) || interaction.customId.startsWith('w_') || interaction.customId.startsWith('tpl_')) {
        return;
      }

      const handler = buttonHandlers[interaction.customId];
      if (handler) {
        try {
          await handler(interaction);
        } catch (error) {
          logger.error(`Error handling button ${interaction.customId}:`, error);
          await interaction.reply({ content: 'There was an error handling this button.', flags: 64 });
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