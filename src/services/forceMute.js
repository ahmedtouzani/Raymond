const { PermissionFlagsBits } = require('discord.js');
const { isBotOwner } = require('../handlers/commandAuthorization');

// Members this bot server-muted with forcemute, per guild. forceunmute only lifts these
// mutes, so punishments and Owner Guard mirror mutes applied by other means stay in place.
const forced = new Map();
// Members whose force mute was lifted while they were out of voice. Discord only lets a
// server mute be removed while the member is connected, so it is lifted when they rejoin.
const pendingUnmute = new Map();

const bucket = (store, guildId) => {
  if (!store.has(guildId)) store.set(guildId, new Set());
  return store.get(guildId);
};

function canForceMute(member, userId, ownerId = process.env.OWNER_ID) {
  return isBotOwner(userId, ownerId)
    || member?.guild?.ownerId === userId
    || Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

// Everyone in the room except the issuer, bots, the bot owner and the server owner.
function muteTargets(channel, issuerId, ownerId = process.env.OWNER_ID) {
  return [...channel.members.values()].filter(member => member.id !== issuerId
    && !member.user?.bot
    && !isBotOwner(member.id, ownerId)
    && member.id !== channel.guild?.ownerId);
}

async function muteRoom(channel, issuer, ownerId = process.env.OWNER_ID) {
  const reason = `Raymond forcemute by ${issuer.user?.tag || issuer.id} in #${channel.name}`;
  const result = { muted: [], already: [], failed: [] };
  const mine = bucket(forced, channel.guild.id);
  for (const member of muteTargets(channel, issuer.id, ownerId)) {
    bucket(pendingUnmute, channel.guild.id).delete(member.id);
    if (member.voice.serverMute) {
      // A mute that predates forcemute is not ours to lift later.
      if (!mine.has(member.id)) result.already.push(member);
      else result.muted.push(member);
      continue;
    }
    try {
      await member.voice.setMute(true, reason);
      mine.add(member.id);
      result.muted.push(member);
    } catch {
      result.failed.push(member);
    }
  }
  return result;
}

async function unmuteForced(guild, issuer) {
  const reason = `Raymond forceunmute by ${issuer.user?.tag || issuer.id}`;
  const mine = bucket(forced, guild.id);
  const result = { unmuted: [], pending: [], failed: [] };
  for (const id of [...mine]) {
    const member = guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
    if (!member) { mine.delete(id); continue; }
    if (!member.voice.channelId) {
      mine.delete(id);
      bucket(pendingUnmute, guild.id).add(id);
      result.pending.push(member);
      continue;
    }
    try {
      if (member.voice.serverMute) await member.voice.setMute(false, reason);
      mine.delete(id);
      result.unmuted.push(member);
    } catch {
      result.failed.push(member);
    }
  }
  return result;
}

// Server-muted members in the issuer's room that forcemute did not mute (for example after a
// restart cleared the in-memory list). Lifted only when the issuer asks for it with `all`.
async function unmuteRoom(channel, issuer, ownerId = process.env.OWNER_ID) {
  const reason = `Raymond forceunmute all by ${issuer.user?.tag || issuer.id} in #${channel.name}`;
  const mine = bucket(forced, channel.guild.id);
  const result = { unmuted: [], pending: [], failed: [] };
  for (const member of muteTargets(channel, issuer.id, ownerId)) {
    if (!member.voice.serverMute) continue;
    try {
      await member.voice.setMute(false, reason);
      mine.delete(member.id);
      result.unmuted.push(member);
    } catch {
      result.failed.push(member);
    }
  }
  return result;
}

async function onVoiceState(oldState, newState) {
  const guildId = newState.guild?.id;
  const waiting = guildId && pendingUnmute.get(guildId);
  if (!waiting?.has(newState.id) || !newState.channelId || oldState.channelId) return;
  waiting.delete(newState.id);
  if (newState.serverMute) await newState.setMute(false, 'Raymond forceunmute: lifted on rejoin');
}

const forcedCount = guildId => forced.get(guildId)?.size || 0;

module.exports = { canForceMute, muteTargets, muteRoom, unmuteForced, unmuteRoom, onVoiceState, forcedCount, _state: { forced, pendingUnmute } };
