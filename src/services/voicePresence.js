const { ChannelType, PermissionsBitField: { Flags }, Routes, EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../database/guildConfig');
const { allowsGuild } = require('../config/development');
const logger = require('../utils/logger');

const defaultPhrases = [
  'FOCUS MODE', 'BUILT DIFFERENT', 'STAY SHARP', 'NO LIMITS',
  'POWER IN SILENCE', 'LEGENDS ONLY', 'MAKE IT HAPPEN', 'RESPECT THE ROOM',
  'NO NOISE. JUST RESULTS.', 'MOVE WITH PURPOSE', 'EARNED, NEVER GIVEN',
];
function createVoicePresence(options = {}) {
  const now = options.now || Date.now, random = options.random || Math.random;
  const configFor = options.configFor || (async id => (await getGuildConfig(id)).settings?.voicePresence || {});
  const ownerId = options.ownerId || (() => String(process.env.OWNER_ID || '').trim());
  const write = options.write || ((channel, status) => channel.client.rest.put(Routes.channelVoiceStatus(channel.id), { body: { status } }));
  const interval = options.setInterval || setInterval, clear = options.clearInterval || clearInterval;
  const states = new Map(), chains = new Map();
  let client, timer, cycle, stopped = false, active = 0;
  const waiters = [];
  async function limited(task) {
    if (active >= 2) await new Promise(resolve => waiters.push(resolve));
    else active++;
    try { if (!stopped) return await task(); }
    finally { const next = waiters.shift(); if (next) next(); else active--; }
  }
  async function update(guild, id, announce) {
    const config = await configFor(guild.id);
    if (stopped || !allowsGuild(guild.id) || config.enabled !== true) { states.delete(`${guild.id}:${id}`); return; }
    const channel = guild.channels.cache.get(id), bot = guild.members.me;
    if (channel?.type !== ChannelType.GuildVoice || !channel.permissionsFor(bot)?.has([Flags.ViewChannel,Flags.ManageChannels,Flags.SetVoiceChannelStatus])) return;
    const key = `${guild.id}:${id}`, previous = states.get(key) || { last: null, due: 0, announcedAt: null };
    const boss = ownerId(), present = Boolean(boss && guild.voiceStates.cache.get(boss)?.channelId === id);
    const rotating = config.channels?.includes(id) === true;
    if(!rotating && !present && previous.present !== true)return;
    let status;
    if (present) status = String(config.ownerStatus || '👑 BOSS IS HERE').replace(/\{owner\}/g, guild.members.cache.get(boss)?.displayName || 'THE BOSS').replace(/[\r\n]/g,' ').toUpperCase().slice(0,100);
    else if(!rotating)status=null;
    else {
      if (previous.present === false && now() < previous.due) return;
      const phrases = String(config.phrases || defaultPhrases.join('\n')).split('\n').map(value=>value.trim().toUpperCase()).filter(value=>value && value.length<=100).slice(0,30);
      const choices = phrases.filter(value=>value !== previous.last);
      const pool = choices.length ? choices : phrases.length ? phrases : defaultPhrases;
      status = pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
    }
    if (status !== previous.last) await write(channel,status);
    if (stopped) return;
    const record = { ...previous,last:status,present,due:now()+Math.max(5,Math.min(1440,Number(config.intervalMinutes)||15))*60000 };
    states.delete(key);states.set(key,record);
    while(states.size>10000)states.delete(states.keys().next().value);
    if (present && announce && guild.voiceStates.cache.get(boss)?.channelId === id && config.announceOwner !== false
      && (record.announcedAt == null || now()-record.announcedAt >= 5*60000)
      && channel.permissionsFor(bot)?.has([Flags.SendMessages,Flags.EmbedLinks])) {
      // Reserve before sending: reconnects and rapid moves cannot duplicate a successful announcement.
      record.announcedAt=now();
      await channel.send({embeds:[new EmbedBuilder().setColor(0xDFBD7C).setTitle('👑 BOSS IS HERE')
        .setDescription(String(config.ownerMessage || '**{owner} HAS ARRIVED.**\nTHE ROOM JUST CHANGED.').replace(/\{owner\}/g,`<@${boss}>`).slice(0,1000))
        .setFooter({text:'Raymond · Voice Presence'}).setTimestamp()],allowedMentions:{parse:[],repliedUser:false}});
    }
  }
  function enqueue(guild,id,announce=false) {
    if(stopped || !allowsGuild(guild.id))return Promise.resolve();
    const key=`${guild.id}:${id}`;
    const prior=chains.get(key) || Promise.resolve();
    const task=prior.then(()=>limited(()=>update(guild,id,announce))).catch(error=>logger.warn('Voice presence update failed',{guildId:guild.id,channelId:id,code:error.code||error.name}));
    chains.set(key,task);
    task.finally(()=>{if(chains.get(key)===task)chains.delete(key);});
    return task;
  }
  async function refreshGuild(guild) {
    if(stopped || !allowsGuild(guild.id))return;
    const config=await configFor(guild.id);
    const ids=config.enabled===true?new Set((config.channels || []).slice(0,25)):new Set();
    const bossRoom=config.enabled===true && guild.voiceStates.cache.get(ownerId())?.channelId;
    if(bossRoom)ids.add(bossRoom);
    for(const [key,record] of states)if(key.startsWith(`${guild.id}:`)&&!ids.has(key.slice(guild.id.length+1))) {
      if(config.enabled===true && record.present)ids.add(key.slice(guild.id.length+1));
      else if(config.enabled!==true || record.announcedAt==null || now()-record.announcedAt>=5*60000)states.delete(key);
    }
    await Promise.all([...ids].map(id=>enqueue(guild,id)));
  }
  function tick() {
    if(stopped || cycle || !client)return cycle || Promise.resolve();
    cycle=(async()=>{for(const guild of client.guilds.cache.values()) {
      try {await refreshGuild(guild);}catch(error){logger.warn('Voice presence settings unavailable',{guildId:guild.id,code:error.code||error.name});}
    }})().finally(()=>{cycle=null;});
    return cycle;
  }
  async function onVoiceState(before,after) {
    if(stopped || before.channelId===after.channelId || after.id!==ownerId())return;
    const guild=after.guild || before.guild;
    if(!guild || !allowsGuild(guild.id))return;
    await Promise.all([...new Set([before.channelId,after.channelId].filter(Boolean))].map(id=>enqueue(guild,id,id===after.channelId)));
  }
  function start(bot) {client=bot;if(timer)return;stopped=false;timer=interval(tick,60000);timer.unref?.();return tick();}
  async function stop() {stopped=true;if(timer)clear(timer);timer=null;await Promise.allSettled([cycle,...chains.values()].filter(Boolean));states.clear();}
  return {start,stop,tick,refreshGuild,onVoiceState};
}
module.exports = { ...createVoicePresence(),createVoicePresence,defaultPhrases };
