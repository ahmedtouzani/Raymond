const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const logger = require('../utils/logger');

const pending = new Map();
function destroy(connection) {
  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
}
async function joinAfk(guild, channelId) {
  if (pending.has(guild.id)) throw Object.assign(new Error('A voice connection is already being established.'), { code: 'VOICE_BUSY' });
  const existing = getVoiceConnection(guild.id);
  if (existing?.state.status === VoiceConnectionStatus.Ready && existing.joinConfig.channelId === channelId) return { alreadyJoined: true };
  const attempt = { cancelled: false, connection: null };
  pending.set(guild.id, attempt);
  try {
    const connection = joinVoiceChannel({ channelId, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfMute: true, selfDeaf: true });
    attempt.connection = connection;
    connection.on('error', error => logger.warn('AFK voice transport error', { guildId: guild.id, code: error.code || error.name }));
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    if (attempt.cancelled) return { cancelled: true };
    // Allow normal channel moves/resumption, but clean up unrecoverable sessions.
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        if (connection.state.status === VoiceConnectionStatus.Disconnected) destroy(connection);
      }
    });
    return { alreadyJoined: false };
  } catch (error) {
    destroy(attempt.connection);
    if (attempt.cancelled) return { cancelled: true };
    throw error;
  } finally {
    pending.delete(guild.id);
  }
}
function leaveAfk(guildId) {
  const attempt = pending.get(guildId);
  if (attempt) attempt.cancelled = true;
  const connection = attempt?.connection || getVoiceConnection(guildId);
  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) return false;
  destroy(connection);
  return true;
}
module.exports = { joinAfk, leaveAfk };
