const { ChannelType } = require('discord.js');
const logger = require('../utils/logger');
function createVoiceXpScheduler(options = {}) {
  const now = options.now || Date.now;
  const interval = options.setInterval || setInterval, clear = options.clearInterval || clearInterval;
  const settingsFor = options.settingsFor || (id => require('../database/levelSettings').getGuildSettingsWithDefaults(id));
  const award = options.award || ((...args) => require('../database/levelSystem').addXp(...args));
  const leveled = options.leveled || ((...args) => require('./levelAnnouncements').announceLevelUp(...args));
  const guilds = new Map(); let stopping = false;
  function stopGuild(id) {
    const record = guilds.get(id);
    if (record) { clear(record.timer); record.members.clear(); record.stopped = true; }
    guilds.delete(id);
    return record?.job;
  }
  async function run(record) {
    const settings = await settingsFor(record.guild.id);
    if (!settings.voice_xp_enabled || stopping || record.stopped) {
      for (const entry of record.members.values()) entry.since = now();
      return;
    }
    const counts = new Map(), eligible = new Map();
    for (const [id, entry] of record.members) {
      const state = record.guild.voiceStates.cache.get(id), member = state?.member;
      if (!state?.channelId || !member || member.user.bot) { record.members.delete(id); continue; }
      const channel = state.channel;
      const allowed = channel?.type === ChannelType.GuildVoice && channel.id !== record.guild.afkChannelId
        && !settings.excluded_channels?.includes(channel.id)
        && !(settings.voice_ignore_muted && (state.selfMute || state.serverMute))
        && !(settings.voice_ignore_deafened && (state.selfDeaf || state.serverDeaf));
      if (!allowed) { entry.since = now(); continue; }
      counts.set(channel.id, (counts.get(channel.id) || 0) + 1);
      eligible.set(id, { member, channel, entry });
    }
    const candidates = [...eligible.values()]; let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (index < candidates.length && !stopping && !record.stopped) {
        const { member, channel, entry } = candidates[index++];
        if ((counts.get(channel.id) || 0) < (settings.voice_min_members ?? 2)) { entry.since = now(); continue; }
        if (now() - entry.since < 60000 || now() - entry.lastAward < 60000) continue;
        // Recheck current membership immediately before a write, including awaits above.
        const current = record.guild.voiceStates.cache.get(member.id);
        if (current?.channelId !== channel.id || !record.members.has(member.id)
          || settings.voice_ignore_muted && (current.selfMute || current.serverMute)
          || settings.voice_ignore_deafened && (current.selfDeaf || current.serverDeaf)) continue;
        const amount = Math.round((settings.voice_xp_rate ?? 10) * (settings.xp_multiplier ?? 1));
        if (amount <= 0) continue;
        try {
          const result = await award(record.guild.id, member.id, amount, 'voice');
          entry.lastAward = now();
          if (result.leveledUp) await leveled(record.guild, member, 'voice', result.level, settings);
        } catch (error) { logger.warn('Voice XP award failed', { guildId: record.guild.id, code: error.code || error.name }); }
      }
    }));
    if (!record.members.size) stopGuild(record.guild.id);
  }
  function tick(id) {
    const record = guilds.get(id);
    if (!record || stopping) return Promise.resolve();
    if (record.job) return record.job;
    record.job = run(record).catch(error => logger.warn('Voice XP tick failed', { guildId: id, code: error.code || error.name }))
      .finally(() => { record.job = null; });
    return record.job;
  }
  function sync(state) {
    if (stopping || !state.guild || !state.id) return;
    let record = guilds.get(state.guild.id);
    if (!state.channelId || state.channel?.type !== ChannelType.GuildVoice || state.member?.user.bot) {
      record?.members.delete(state.id);
      if (record && !record.members.size) stopGuild(state.guild.id);
      return;
    }
    if (!record) {
      record = { guild: state.guild, members: new Map(), job: null };
      record.timer = interval(() => tick(state.guild.id), 60000); record.timer.unref?.();
      guilds.set(state.guild.id, record);
    }
    const existing = record.members.get(state.id);
    if (!existing || existing.channelId !== state.channelId) record.members.set(state.id, { channelId: state.channelId, since: now(), lastAward: 0 });
  }
  async function stop() {
    stopping = true;
    const jobs = [...guilds.keys()].map(stopGuild).filter(Boolean);
    await Promise.allSettled(jobs);
  }
  return { sync, tick, stop, stopGuild };
}
module.exports = { ...createVoiceXpScheduler(), createVoiceXpScheduler };
