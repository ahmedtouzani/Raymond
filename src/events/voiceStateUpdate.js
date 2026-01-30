const { ChannelType, PermissionsBitField, OverwriteType } = require('discord.js');
const tempVoiceDB = require('../database/tempVoice');
const statsUpdater = require('../services/statsUpdater');
const { addXp } = require('../database/levelSystem');
const { handleLevelUpRoles } = require('../utils/levelRoleManager');
const logger = require('../utils/logger');

// This map will store the channels that are being deleted to avoid race conditions
const deletingChannels = new Map();

// Voice XP system config
const VOICE_XP_INTERVAL = 60 * 1000; // 1 minute
const VOICE_XP_COOLDOWN = 45 * 1000; // 45 seconds

// Ensure global tracking objects are initialized
if (!global.voiceXpTracking) global.voiceXpTracking = {};
if (!global.voiceXpCooldown) global.voiceXpCooldown = {};

async function handleChannelCreation(newState) {
  const { guild, member, channel } = newState;
  if (!channel) return; // User disconnected

  const configs = await tempVoiceDB.getAllTempVoiceConfigsForGuild(guild.id);
  if (!configs || configs.length === 0) return;

  const matchedConfig = configs.find(c => c.enabled && c.creatorChannelId === channel.id);
  if (!matchedConfig) return;

  logger.info(`User ${member.user.tag} joined creator channel '${channel.name}' for config '${matchedConfig.configName}'. Creating temp channel...`);



  // --- Start of Permission Logic ---
  const baseOverwriteSource =
    channel.permissionOverwrites.cache.size > 0
      ? channel.permissionOverwrites.cache
      : (channel.parent ? channel.parent.permissionOverwrites.cache : channel.permissionOverwrites.cache);

  const permissionOverwrites = Array.from(baseOverwriteSource.values()).map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow.bitfield,
    deny: ow.deny.bitfield,
  }));

  const ensureOverwrite = (id, type, requiredAllows) => {
    const required = new PermissionsBitField(requiredAllows).bitfield;

    const existingIndex = permissionOverwrites.findIndex((o) => o.id === id);
    if (existingIndex === -1) {
      permissionOverwrites.push({
        id,
        type,
        allow: required,
        deny: 0n,
      });
      return;
    }

    const existing = permissionOverwrites[existingIndex];
    const existingAllow = BigInt(existing.allow ?? 0n);
    const existingDeny = BigInt(existing.deny ?? 0n);

    permissionOverwrites[existingIndex] = {
      ...existing,
      type: existing.type ?? type,
      allow: existingAllow | required,
      deny: existingDeny & ~required,
    };
  };

  ensureOverwrite(member.id, OverwriteType.Member, [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.MoveMembers,
    PermissionsBitField.Flags.MuteMembers,
    PermissionsBitField.Flags.DeafenMembers,
    PermissionsBitField.Flags.Stream,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak,
  ]);

  if (matchedConfig.supportRoleId) {
    ensureOverwrite(matchedConfig.supportRoleId, OverwriteType.Role, [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
      PermissionsBitField.Flags.MoveMembers,
    ]);
  }
  // --- End of Permission Logic ---

  try {
    const newChannel = await guild.channels.create({
      name: `${channel.name} - ${member.displayName}`,
      type: ChannelType.GuildVoice,
      parent: matchedConfig.categoryId || channel.parentId,
      permissionOverwrites: permissionOverwrites,
      bitrate: channel.bitrate,
      userLimit: channel.userLimit,
      reason: `Temporary channel for ${member.user.tag} (config: ${matchedConfig.configName})`,
    });

    await member.voice.setChannel(newChannel);
    await tempVoiceDB.addTempChannel(newChannel.id, guild.id, member.id, matchedConfig.creatorChannelId);

    logger.info(`Created temp channel ${newChannel.name} (${newChannel.id}) for ${member.user.tag}.`);
  } catch (error) {
    logger.error(`Failed to create temp channel for ${member.user.tag}:`, error);
  }
}

async function handleChannelCleanup(oldState) {
  const { guild, channel } = oldState;
  if (!channel) return;

  // Check if the channel is a tracked temporary channel
  const allTempChannels = await tempVoiceDB.getAllTempChannels();
  const trackedChannel = allTempChannels.find(c => c.channelId === channel.id);

  if (!trackedChannel) return;

  // If the channel is empty and not already being deleted, delete it instantly
  if (channel.members.size === 0 && !deletingChannels.has(channel.id)) {
    deletingChannels.set(channel.id, true); // Mark as being deleted to prevent race conditions
    logger.info(`Temp channel ${channel.name} is empty. Deleting instantly...`);

    try {
      await channel.delete('Temporary channel empty.');
      await tempVoiceDB.removeTempChannel(channel.id);
      logger.info(`Successfully deleted empty temp channel ${channel.name} (${channel.id}).`);
    } catch (error) {
      // It might have been deleted manually already.
      if (error.code !== 10003) { // 10003 = Unknown Channel
        logger.error(`Failed to delete temp channel ${channel.id}:`, error);
      }
      // In case of error, still try to remove from DB if it exists
      await tempVoiceDB.removeTempChannel(channel.id).catch(() => { });
    } finally {
      // Clean up the lock
      deletingChannels.delete(channel.id);
    }
  }
}

async function startVoiceXpTracking(newState) {
  const { guild, member, channel } = newState;

  // Only track if user joins/moves to a voice channel
  if (
    !channel ||
    channel.type !== ChannelType.GuildVoice ||
    !member ||
    member.user.bot
  ) return;

  const key = `${guild.id}-${member.id}`;

  // Don't start if already tracking
  if (global.voiceXpTracking[key]) return;

  logger.debug(`Starting voice XP tracking for ${member.user.tag} in ${channel.name}`);

  global.voiceXpTracking[key] = setInterval(async () => {
    try {
      // Check cooldown
      const cooldownKey = `${guild.id}-${member.id}`;
      const now = Date.now();

      if (
        !global.voiceXpCooldown[cooldownKey] ||
        now - global.voiceXpCooldown[cooldownKey] > VOICE_XP_COOLDOWN
      ) {
        global.voiceXpCooldown[cooldownKey] = now;

        // Add XP (random between 10-20)
        const xpToAdd = Math.floor(10 + Math.random() * 11);

        try {
          const { level, leveledUp } = await addXp(guild.id, member.id, xpToAdd, 'voice');

          if (leveledUp) {
            await handleLevelUpRoles(newState.client, guild.id, member.id, 'voice', level);

            // Send congratulatory message via DM
            try {
              const dmChannel = await member.createDM();
              await dmChannel.send({
                content: `${member}, congrats! You reached voice level **${level}**!`
              });
            } catch (error) {
              // Handle DM failure silently
              logger.debug(`Could not send level up DM to ${member.user.tag}`);
            }
          }
        } catch (err) {
          logger.error('Error adding voice XP:', err);
        }
      }

      // Check if still in voice and eligible
      const currentMember = await guild.members.fetch(member.id).catch(() => null);
      if (
        !currentMember ||
        !currentMember.voice.channelId ||
        currentMember.voice.channel.type !== ChannelType.GuildVoice
      ) {
        stopVoiceXpTracking(guild.id, member.id);
      }
    } catch (err) {
      logger.error('Voice XP interval error:', err);
    }
  }, VOICE_XP_INTERVAL);
}

function stopVoiceXpTracking(guildId, memberId) {
  const key = `${guildId}-${memberId}`;

  if (global.voiceXpTracking[key]) {
    clearInterval(global.voiceXpTracking[key]);
    delete global.voiceXpTracking[key];
    logger.debug(`Stopped voice XP tracking for member ${memberId}`);
  }
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;

    // Scenario 1: User joins a channel or moves between channels
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      await handleChannelCreation(newState);
      await startVoiceXpTracking(newState);
    }

    // Scenario 2: User leaves a channel or moves
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await handleChannelCleanup(oldState);

      // Stop XP tracking if user left voice completely
      if (oldState.member && !newState.channelId) {
        stopVoiceXpTracking(oldState.guild.id, oldState.member.id);
      }
    }

    // Update voice count stats when voice state changes
    if (oldState.channelId !== newState.channelId) {
      await statsUpdater.updateVoiceCount(guild);
    }
  },
};