const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { hasStellarOrHigher } = require('../../../premium/premium');
const logger = require('../../../utils/logger');

// Cooldown management (15 seconds per guild)
const moveCooldowns = new Map();
const MOVE_COOLDOWN = 15000;

module.exports = {
  name: 'moveall',
  aliases: ['mvall', 'moveallvc', 'massmove'],
  description: '⚡️ Instantly move all members between voice channels (Premium)',
  usage: '!moveall <source> <target>',
  category: 'Moderation',
  permissions: [PermissionFlagsBits.MoveMembers],
  prefixless: true,
  cooldown: 5,

  async execute(message, args) {
    // Validate environment
    if (!message.guild) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle(' Server Only Command')
          .setDescription('This command requires a server environment')
          .setColor(0xE74C3C)
        ]
      });
    }

    // Cooldown check
    const cooldownEnd = moveCooldowns.get(message.guild.id) || 0;
    if (Date.now() < cooldownEnd) {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Command Cooldown')
          .setDescription(`Please wait ${remaining} seconds before using this command again`)
          .setColor(0xF39C12)
        ]
      });
    }
    moveCooldowns.set(message.guild.id, Date.now() + MOVE_COOLDOWN);

    // Premium verification
    if (!(await hasStellarOrHigher(message.guild.id))) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🌟 Premium Required')
          .setDescription('This command requires **Stellar Matrix** tier or higher')
          .setColor(0x9B59B6)
          .setFooter({ text: 'Upgrade at https://yourdomain.com/premium' })
        ]
      });
    }

    // Argument validation
    if (args.length < 2) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle(' Missing Arguments')
          .setDescription(`**Usage:** \`${this.usage}\`\nExample: \`!moveall "General VC" Afk\``)
          .setColor(0xE74C3C)
        ]
      });
    }

    try {
      const [sourceInput, targetInput] = args;
      const botMember = message.guild.members.me;
      const executor = message.member;

      // Permission verification
      if (!executor.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(' Permission Denied')
            .setDescription('You need **Move Members** permission')
            .setColor(0xE74C3C)
          ]
        });
      }

      if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(' Bot Permission Missing')
            .setDescription('I need **Move Members** permission')
            .setColor(0xE74C3C)
          ]
        });
      }

      // Async channel resolution helper: tries cache, then fetch, ensures GuildVoice
      const resolveChannel = async (input) => {
        // ID or mention
        const idMatch = input.match(/(\d{17,19})/);
        let channel = null;
        if (idMatch) {
          channel = message.guild.channels.cache.get(idMatch[1]);
          if (!channel) {
            try {
              channel = await message.guild.channels.fetch(idMatch[1]);
            } catch (_) { /* ignore */ }
          }
          if (channel && channel.type === ChannelType.GuildVoice) return channel;
        }
        // Name search (fuzzy match)
        const normalizedInput = input.toLowerCase();
        channel = message.guild.channels.cache.find(
          c => c.name.toLowerCase().includes(normalizedInput) &&
            c.type === ChannelType.GuildVoice
        );
        if (channel) return channel;
        // Try fetch all channels and search
        try {
          const allChannels = await message.guild.channels.fetch();
          return allChannels.find(c => c.name.toLowerCase().includes(normalizedInput) && c.type === ChannelType.GuildVoice) || null;
        } catch (_) { return null; }
      };

      // Resolve channels (async)
      const sourceChannel = await resolveChannel(sourceInput);
      const targetChannel = await resolveChannel(targetInput);

      // Channel validation
      if (!sourceChannel) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle('🔍 Source Not Found')
              .setDescription(`Couldn't find voice channel: \`${sourceInput}\``)
              .setColor(0xE74C3C)
            ]
          });
        } else {
          logger.error('Could not reply: Source channel not found and message.channel missing', { guild: message.guild.id });
          return;
        }
      }

      if (!targetChannel) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle('🔍 Target Not Found')
              .setDescription(`Couldn't find voice channel: \`${targetInput}\``)
              .setColor(0xE74C3C)
            ]
          });
        } else {
          logger.error('Could not reply: Target channel not found and message.channel missing', { guild: message.guild.id });
          return;
        }
      }

      if (sourceChannel.id === targetChannel.id) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle('🚫 Same Channel')
              .setDescription('Source and target cannot be identical')
              .setColor(0xE74C3C)
            ]
          });
        } else {
          logger.error('Could not reply: Source and target channel are the same and message.channel missing', { guild: message.guild.id });
          return;
        }
      }

      // Get members to move
      const membersToMove = sourceChannel.members;
      if (membersToMove.size === 0) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle('🔇 Empty Channel')
              .setDescription(`${sourceChannel} has no members to move`)
              .setColor(0xF39C12)
            ]
          });
        } else {
          logger.error('Could not reply: Source channel empty and message.channel missing', { guild: message.guild.id });
          return;
        }
      }

      // Check target capacity
      if (targetChannel.userLimit > 0 &&
        targetChannel.members.size + membersToMove.size > targetChannel.userLimit) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle('🚫 Channel Full')
              .setDescription(`${targetChannel} can't hold all members`)
              .setColor(0xE74C3C)
            ]
          });
        } else {
          logger.error('Could not reply: Target channel full and message.channel missing', { guild: message.guild.id });
          return;
        }
      }

      // Start processing
      const processEmbed = new EmbedBuilder()
        .setTitle('⚡️ Moving Members')
        .setDescription(`Moving ${membersToMove.size} members to ${targetChannel}`)
        .addFields(
          { name: 'Source', value: sourceChannel.toString(), inline: true },
          { name: 'Target', value: targetChannel.toString(), inline: true }
        )
        .setColor(0x3498DB)
        .setFooter({ text: 'This will complete almost instantly...' });
      let processMsg = null;
      if (message.channel) {
        processMsg = await message.reply({ embeds: [processEmbed] });
      } else {
        logger.error('Could not reply: process embed and message.channel missing', { guild: message.guild.id });
        return;
      }

      // Bulk move operation - optimized for speed
      const moveStart = Date.now();
      const moveResults = await bulkMoveMembers(
        membersToMove,
        targetChannel,
        `Moved by ${executor.displayName}`
      );

      const moveTime = Date.now() - moveStart;

      // Results embed
      const resultEmbed = new EmbedBuilder()
        .setTitle('<a:okey:1467170671351173121> Move Complete')
        .setDescription(`Moved ${moveResults.successCount} members in ${moveTime}ms`)
        .addFields(
          { name: 'Source', value: sourceChannel.toString(), inline: true },
          { name: 'Target', value: targetChannel.toString(), inline: true },
          { name: 'Speed', value: `${moveTime}ms`, inline: true }
        )
        .setColor(0x2ECC71);

      if (moveResults.failedCount > 0) {
        resultEmbed
          .setTitle('Partial Completion')
          .setDescription('<a:warningbug:1467300628907954300> ' + (resultEmbed.data.description || 'Some members could not be moved.'))
          .setColor(0xF39C12)
          .addFields({
            name: ` Failed (${moveResults.failedCount})`,
            value: moveResults.failedMembers.slice(0, 5).join('\n') +
              (moveResults.failedMembers.length > 5 ? `\n...and ${moveResults.failedMembers.length - 5} more` : ''),
            inline: false
          });
      }

      // Update message
      if (processMsg) {
        await processMsg.edit({ embeds: [resultEmbed] });
      }

    } catch (error) {
      logger.error(`Moveall command failed: ${error.message}`, {
        guild: message.guild.id,
        user: message.author.id,
        error
      });
      // Specific error handling for Discord API and cache issues
      if (error?.rawError?.code === 10003 || (error.message && error.message.includes('Unknown Channel'))) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle(' Unknown Channel')
              .setDescription('One or more channels could not be found or I lost access. Please check channel IDs and my permissions.')
              .setColor(0xE74C3C)
            ]
          });
        } else {
          logger.error('Could not reply: Unknown Channel and message.channel missing', { guild: message.guild.id });
          return;
        }
      }
      if (error.code === 'ChannelNotCached' || (error.message && error.message.includes('ChannelNotCached'))) {
        if (message.channel) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle(' Channel Not Cached')
              .setDescription('Could not find the channel in cache. Please try again or check bot permissions.')
              .setColor(0xE74C3C)
            ]
          });
        } else {
          logger.error('Could not reply: ChannelNotCached and message.channel missing', { guild: message.guild.id });
          return;
        }
      }
      // Fallback generic error
      if (message.channel) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle('Critical Error')
            .setDescription('<a:warningbug:1467300628907954300> An unexpected error occurred. Please try again later.')
            .setColor(0xE74C3C)
          ]
        });
      } else {
        logger.error('Could not reply: Critical Error and message.channel missing', { guild: message.guild.id });
        return;
      }
    } finally {
      // Clear cooldown on completion
      moveCooldowns.delete(message.guild.id);
    }
  }
};

/**
 * Bulk move members with optimized API calls
 * @param {Collection} members - Members to move
 * @param {VoiceChannel} targetChannel - Target voice channel
 * @param {string} reason - Audit log reason
 * @returns {Promise<Object>} - Move results
 */
async function bulkMoveMembers(members, targetChannel, reason) {
  const results = {
    successCount: 0,
    failedCount: 0,
    failedMembers: []
  };

  // Prepare all move operations
  const moveOperations = [];

  for (const [, member] of members) {
    // Skip if not in voice
    if (!member.voice?.channel) {
      results.failedCount++;
      results.failedMembers.push(`${member.displayName} (not in voice)`);
      continue;
    }

    // Skip if already in target
    if (member.voice.channel.id === targetChannel.id) {
      results.failedCount++;
      results.failedMembers.push(`${member.displayName} (already in target)`);
      continue;
    }

    // Queue move operation
    moveOperations.push(
      member.voice.setChannel(targetChannel, reason)
        .then(() => {
          results.successCount++;
        })
        .catch(error => {
          results.failedCount++;

          const errorType =
            error.code === 40032 ? 'Already in channel' :
              error.code === 40041 ? 'Wrong channel type' :
                error.code === 50013 ? 'Permission denied' :
                  'Unknown error';

          results.failedMembers.push(`${member.displayName} (${errorType})`);
        })
    );
  }

  // Execute all moves simultaneously with safety
  const BATCH_SIZE = 10; // Discord's API can handle ~10 concurrent moves
  const totalBatches = Math.ceil(moveOperations.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * BATCH_SIZE;
    const batchEnd = batchStart + BATCH_SIZE;
    const batch = moveOperations.slice(batchStart, batchEnd);

    try {
      await Promise.all(batch);
    } catch {
      // Individual errors are handled, so we ignore batch errors
    }

    // Add minimal delay between batches to prevent flooding
    if (i < totalBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    }
  }

  return results;
}