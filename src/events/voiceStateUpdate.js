const { ChannelType, PermissionsBitField, OverwriteType } = require('discord.js');
const tempVoiceDB = require('../database/tempVoice');
const statsUpdater = require('../services/statsUpdater');
const logger = require('../utils/logger');
const { isDevelopment } = require('../config/development');
const voiceXp = require('../services/voiceXp');

// This map will store the channels that are being deleted to avoid race conditions
const deletingChannels = new Map();

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
    PermissionsBitField.Flags.Stream,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak,
  ]);

  if (matchedConfig.supportRoleId) {
    ensureOverwrite(matchedConfig.supportRoleId, OverwriteType.Role, [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
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

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    if (isDevelopment()) return;
    const guild = newState.guild || oldState.guild;

    // Scenario 1: User joins a channel or moves between channels
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      await handleChannelCreation(newState);

    }

    // Scenario 2: User leaves a channel or moves
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await handleChannelCleanup(oldState);


    }

    voiceXp.sync(newState);

    // Update voice count stats when voice state changes
    if (oldState.channelId !== newState.channelId) {
      await statsUpdater.updateVoiceCount(guild);
    }
  },
};