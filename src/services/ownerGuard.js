const { AuditLogEvent, ChannelType, EmbedBuilder, PermissionsBitField: { Flags } } = require('discord.js');
const { getGuildConfig } = require('../database/guildConfig');
const { allowsGuild } = require('../config/development');
const store = require('../database/ownerGuard');
const logs = require('./auditLogs');
const logger = require('../utils/logger');
const reason = entryId => `Raymond Owner Guard | audit ${entryId}`;

function createOwnerGuard(options={}) {
  const data=options.store || store,now=options.now || Date.now;
  const configFor=options.configFor || (async id=>(await getGuildConfig(id)).settings?.ownerGuard || {});
  const ownerId=options.ownerId || (()=>String(process.env.OWNER_ID || '').trim());
  const publish=options.publish || ((guild,key,description)=>logs.publish(guild,'moderation',key,{title:'Owner Guard',route:'security',description}));
  const pending=new Map(),inflight=new Set(),notices=new Map();let client,timer,cycle,stopped=false,lastPrune=0;
  async function announce(guild,target,actorId,flags,seconds) {
    const channel=target.voice.channel,bot=guild.members.me;
    if(channel?.type!==ChannelType.GuildVoice || !channel.permissionsFor(bot)?.has([Flags.SendMessages,Flags.EmbedLinks]))return;
    const key=`${guild.id}:${channel.id}`;
    if(notices.has(key)&&now()-notices.get(key)<10000)return;
    notices.delete(key);notices.set(key,now());while(notices.size>2048)notices.delete(notices.keys().next().value);
    await channel.send({embeds:[new EmbedBuilder().setColor(0xDFBD7C).setTitle('👑 WRONG TARGET — PROTECTION ACTIVE')
      .setDescription(`**OWNER RESTORED. ACTION MIRRORED.**\n\nConfirmed actor: <@${actorId}>\nResponse: **${flags.join(' + ')}**\nDuration: **${seconds} seconds**`)
      .setFooter({text:'Raymond · Owner Guard'}).setTimestamp()],allowedMentions:{parse:[],repliedUser:false}});
  }
  async function handle(entry,guild) {
    const owner=ownerId();
    const changes=(entry.changes || []).filter(change=>['mute','deaf'].includes(change.key)&&change.new===true&&change.old!==true);
    if(stopped || !allowsGuild(guild.id) || !owner || entry.action!==AuditLogEvent.MemberUpdate || entry.targetId!==owner
      || !entry.executorId || [owner,guild.client.user.id].includes(entry.executorId) || !changes.length
      || !Number.isFinite(entry.createdTimestamp) || now()-entry.createdTimestamp>30000 || entry.createdTimestamp-now()>5000)return;
    const config=await configFor(guild.id);
    const bot=guild.members.me || await guild.members.fetchMe();
    const permissions=[Flags.ViewAuditLog,Flags.MuteMembers,...(changes.some(change=>change.key==='deaf')?[Flags.DeafenMembers]:[])];
    if(!bot.permissions.has(permissions))return;
    const job=await data.record(entry,guild.id,Math.max(30,Math.min(600,Number(config.counterMuteSeconds)||60)));
    if(!job)return;
    inflight.add(job.entry_id);
    let mayHaveActed=false;
    try {
      const target=await guild.members.fetch(owner);
      if(!target.voice.channelId){await data.finish(job);return;}
      if(changes.some(change=>change.key==='mute'))await target.voice.setMute(false,'Raymond Owner Guard: restore owner voice');
      if(changes.some(change=>change.key==='deaf'))await target.voice.setDeaf(false,'Raymond Owner Guard: restore owner hearing');
      if(config.counterMute===false){await data.finish(job);await publish(guild,`owner-guard:${entry.id}`,'Owner voice restored. Mirror punishment is disabled.');return;}
      const actor=await guild.members.fetch(entry.executorId);
      if(now()-entry.createdTimestamp>30000){await data.finish(job);return;}
      if(!actor.voice.channelId){await data.finish(job);await publish(guild,`owner-guard:${entry.id}`,'Owner voice restored. The confirmed actor was disconnected; no mirror punishment was added.');return;}
      const mute=changes.some(change=>change.key==='mute')&&!actor.voice.serverMute;
      const deaf=changes.some(change=>change.key==='deaf')&&!actor.voice.serverDeaf;
      if(!mute&&!deaf){await data.finish(job);return;}
      await data.arm(job,mute,deaf);
      mayHaveActed=true;
      const applied=[];
      if(mute){await actor.voice.setMute(true,reason(entry.id));applied.push('SERVER MUTE');}
      if(deaf){await actor.voice.setDeaf(true,reason(entry.id));applied.push('SERVER DEAFEN');}
      await data.activate(job.entry_id);
      await publish(guild,`owner-guard:${entry.id}`,`Owner voice restored. Confirmed actor <@${entry.executorId}> received temporary **${applied.join(' + ')}**. Audit entry: \`${entry.id}\`.`);
      await announce(guild,target,entry.executorId,applied,Math.max(30,Math.min(600,Number(config.counterMuteSeconds)||60)));
    } catch(error) {
      // An ambiguous mute response must retain its expiry job for audit-based recovery.
      if(!mayHaveActed)await data.finish(job);
      logger.warn('Owner Guard action failed',{guildId:guild.id,code:error.code||error.name});
    } finally {inflight.delete(job.entry_id);}
  }
  function onAudit(entry,guild) {
    if(stopped || !guild || entry.action!==AuditLogEvent.MemberUpdate || entry.targetId!==ownerId())return Promise.resolve();
    const previous=pending.get(guild.id) || Promise.resolve();
    const job=previous.then(()=>handle(entry,guild)).catch(error=>logger.warn('Owner Guard event failed',{guildId:guild.id,code:error.code||error.name}));
    pending.set(guild.id,job);job.finally(()=>{if(pending.get(guild.id)===job)pending.delete(guild.id);});return job;
  }
  async function release(job) {
    if(inflight.has(job.entry_id)){await data.defer(job);return;}
    if(!job.undo_mute&&!job.undo_deaf){await data.finish(job);return;}
    const guild=client.guilds.cache.get(job.guild_id);
    if(!guild || !allowsGuild(guild.id)){await data.finish(job,'review');return;}
    try {
      const actor=await guild.members.fetch(job.actor_id);
      if(!actor.voice.channelId){await data.defer(job);return;}
      // Each flag has independent provenance. A later mute must not block safe deafen cleanup (or vice versa).
      let audit;
      let review=false;
      for(const [key,flag,current,method] of [['mute','undo_mute','serverMute','setMute'],['deaf','undo_deaf','serverDeaf','setDeaf']]) {
        if(job[flag]!==true)continue;
        if(!actor.voice[current]){await data.clearFlag(job,flag);continue;}
        audit ||= await guild.fetchAuditLogs({type:AuditLogEvent.MemberUpdate,limit:50});
        const latest=[...audit.entries.values()].filter(entry=>entry.targetId===job.actor_id&&entry.changes?.some(change=>change.key===key))
          .sort((a,b)=>b.createdTimestamp-a.createdTimestamp||String(b.id||'').localeCompare(String(a.id||'')))[0];
        const ours=latest?.executorId===guild.client.user.id&&latest.reason===reason(job.entry_id)&&latest.changes.some(change=>change.key===key&&change.new===true);
        if(!ours){review=true;continue;}
        await actor.voice[method](false,'Raymond Owner Guard: mirror punishment expired');
        await data.clearFlag(job,flag);
      }
      await data.finish(job,review?'review':'done');
      await publish(guild,`owner-guard-expired:${job.entry_id}`,review?'Mirror expiry needs review for flags changed later or lacking confirmation. Other verified flags were cleared.':`Temporary mirror punishment expired for <@${job.actor_id}>.`);
    } catch(error) {
      if([10007,10013].includes(Number(error.code))){await data.finish(job);return;}
      if(Number(error.code)===40032){await data.defer(job);return;}
      await data.retry(job);logger.warn('Owner Guard expiry retry',{guildId:job.guild_id,code:error.code||error.name});
    }
  }
  function tick() {
    if(stopped || cycle || !client)return cycle || Promise.resolve();
    cycle=(async()=>{
      for(let i=0;i<20&&!stopped;i++){const job=await data.claim();if(!job)break;await release(job);}
      if(now()-lastPrune>3600000){await data.prune();lastPrune=now();}
    })().catch(error=>logger.warn('Owner Guard worker failed',{code:error.code||error.name})).finally(()=>{cycle=null;});return cycle;
  }
  function start(bot){client=bot;stopped=false;if(timer)return;timer=setInterval(tick,15000);timer.unref?.();return tick();}
  async function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;await Promise.allSettled([cycle,...pending.values()].filter(Boolean));}
  return{onAudit,start,stop,tick};
}
module.exports={...createOwnerGuard(),createOwnerGuard};
