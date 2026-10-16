const { AuditLogEvent } = require('discord.js');
const logs = require('./auditLogs');
const { allowsGuild } = require('../config/development');
const { label, clean, when, changesSummary, securityReview } = require('./auditDetails');
const { routeFor } = require('./auditRoutes');
const names = new Map(Object.entries(AuditLogEvent).filter(([key])=>!/^\d+$/.test(key)).map(([name,id])=>[id,name]));
const supported = ['guildAuditLogEntryCreate','messageDelete','messageDeleteBulk','messageUpdate','guildMemberAdd','guildMemberRemove','voiceStateUpdate'];
function category(action) {
  if (/^(Member|BotAdd|AutoModeration)/.test(action)) return 'moderation';
  if (/^Message/.test(action)) return 'messages';
  return 'server';
}
function content(message, config, prefix) {
  if (config.captureMessageContent !== true) return 'Content capture is disabled.';
  if (message.partial || typeof message.content !== 'string') return 'Content unavailable · Message was not cached.';
  let token=message.content.trim().split(/\s+/)[0].toLowerCase();
  if(prefix && token.startsWith(prefix.toLowerCase())) token=token.slice(prefix.length);
  const command=[...(message.client?.commands?.values() || [])].find(item=>item.name.toLowerCase()===token||item.aliases?.includes(token));
  if (['mn','modnote','case','cases','modcase'].includes(token) || command?.ownerOnly || ['owner','owneronly','godmode'].includes(String(command?.category || '').toLowerCase())) return 'Private staff command · Content omitted.';
  return message.content ? clean(message.content) : 'No text content.';
}
function attachments(message, config, prefix) {
  if (config.captureMessageContent !== true) return 'Content capture is disabled.';
  if (content(message, config, prefix).startsWith('Private staff command')) return 'Private staff command · Attachments omitted.';
  if (message.partial) return 'Unavailable · Message was not cached.';
  const files = [...(message.attachments?.values() || [])];
  return files.length ? files.slice(0, 6).map(file => `${clean(file.name || 'Attachment', 100)} · ${Math.ceil((file.size || 0) / 1024)} KB`).join('\n')
    + (files.length > 6 ? `\n+${files.length - 6} more` : '') : 'None';
}
function attachmentVersion(message) {
  return [...(message.attachments?.keys() || [])].sort().join(',');
}
async function observe(name,args,client) {
  if (!supported.includes(name)) return;
  const eventGuild=name==='guildAuditLogEntryCreate'?args[1]:name==='messageDeleteBulk'?(args[1]?.guild||args[0]?.first()?.guild):(args[0]?.guild||args[1]?.guild);
  if(!eventGuild || !allowsGuild(eventGuild.id))return;
  try {
    if (name==='guildAuditLogEntryCreate') {
      const [entry,guild]=args, action=names.get(entry.action)||`Action ${entry.action}`;
      const fields=[{name:'Performed By',value:entry.executorId ? `<@${entry.executorId}> · \`${entry.executorId}\`` : 'Unknown · Discord did not provide the actor.'}];
      if(entry.targetId) {
        const mention=/^(Member|BotAdd)/.test(action)?`<@${entry.targetId}>`:/^Role/.test(action)?`<@&${entry.targetId}>`:/^(Channel|Thread)/.test(action)?`<#${entry.targetId}>`:null;
        fields.push({name:'Target',value:[mention,entry.target?.name?clean(entry.target.name,100):null,`\`${String(entry.targetId).slice(0,100)}\``].filter(Boolean).join(' · ')});
      }
      if(entry.reason)fields.push({name:'Reason',value:clean(entry.reason)});
      if(entry.extra?.count)fields.push({name:'Count',value:String(entry.extra.count)});
      const details=changesSummary(entry.changes);
      if(details)fields.push({name:'Changes',value:details.slice(0,1000)});
      const review=securityReview(entry.changes);
      if(review)fields.push({name:'Permission Review',value:review});
      fields.push({name:'Audit Entry ID',value:`\`${entry.id}\``,inline:true});
      if(entry.extra?.channel?.id || entry.extra?.channelId)fields.push({name:'Channel',value:`<#${entry.extra.channel?.id || entry.extra.channelId}>`,inline:true});
      if(entry.extra?.id)fields.push({name:'Related ID',value:`\`${clean(entry.extra.id, 100)}\``,inline:true});
      const sourceId=entry.extra?.channel?.id || entry.extra?.channelId || (/^(Channel|Thread)/.test(action)?entry.targetId:null);
      const source=sourceId ? {id:sourceId,parentId:guild.channels.cache.get(sourceId)?.parentId} : null;
      await logs.publish(guild,category(action),`discord-audit:${entry.id}`,{title:label(action),route:routeFor(action,entry.changes),review:Boolean(review),description:'Confirmed Discord audit entry.',fields,timestamp:new Date(entry.createdTimestamp).toISOString()},source);
      return;
    }
    if(name==='messageDelete' || name==='messageUpdate') {
      const before=args[0],after=args[1],message=after||before;
      if(!message.guild || message.author?.bot || before.author?.bot)return;
      if(name==='messageUpdate' && before.content===after.content && attachmentVersion(before)===attachmentVersion(after))return;
      const config=await logs.settings(message.guild.id);
      if(config.enabled!==true)return;
      const prefix=(await require('../database/guildConfig').getGuildConfig(message.guild.id)).prefix;
      const fields=[{name:'Channel',value:`<#${message.channelId}>`},{name:'Author',value:message.author?.id?`<@${message.author.id}> · \`${message.author.id}\``:'Unknown · Message was not cached.'},
        {name:'Message ID',value:message.id}];
      if(after){fields.push({name:'Before',value:content(before,config,prefix)},{name:'After',value:content(after,config,prefix)});}
      else fields.push({name:'Content',value:content(before,config,prefix)},{name:'Deleted By',value:'Unknown · Message deletion events do not identify who deleted this exact message.'});
      if(before.attachments?.size || after?.attachments?.size) {
        fields.push({name:after?'Attachments Before':'Attachments',value:attachments(before,config,prefix)});
        if(after)fields.push({name:'Attachments After',value:attachments(after,config,prefix)});
      }
      fields.push({name:'Sent',value:when(message.createdTimestamp),inline:true});
      const version=after?.editedTimestamp || 'deleted';
      await logs.publish(message.guild,'messages',`message:${message.id}:${version}`,{title:after?'Message Edited':'Message Deleted',route:'messages',description:after?`[Open message](https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.id})`:'A message was removed.',fields,hasMessageContent:true},message.channel);
      return;
    }
    if(name==='messageDeleteBulk') {
      const messages=args[0],channel=args[1] || messages.first()?.channel;
      if(!channel?.guild)return;
      const ids=[...messages.keys()].sort();
      await logs.publish(channel.guild,'messages',`bulk:${channel.id}:${ids[0]}:${ids.length}`,{title:'Messages Bulk Deleted',route:'messages',description:`${ids.length} messages removed from <#${channel.id}>.`,fields:[{name:'Actor',value:'See the corresponding Discord audit entry when available. No exact message-to-actor attribution is assumed.'}]},channel);
      return;
    }
    if(name==='guildMemberAdd' || name==='guildMemberRemove') {
      const member=args[0];
      await logs.publish(member.guild,'members',`member:${name}:${member.id}:${name==='guildMemberAdd'?member.joinedTimestamp:Date.now()}`,{
        title:name==='guildMemberAdd'?'Member Joined':'Member Left',route:name==='guildMemberAdd'?'memberJoined':'memberLeft',description:`<@${member.id}> · \`${member.id}\``,fields:[
          {name:'Account Created',value:when(member.user?.createdTimestamp),inline:true},{name:'Joined Server',value:when(member.joinedTimestamp),inline:true},
          {name:'Account Type',value:member.user?.bot?'Bot':'Member',inline:true},
          ...(name==='guildMemberAdd' && member.user?.createdTimestamp && Date.now()-member.user.createdTimestamp < 7*86400000
            ? [{name:'Review',value:'Account created less than 7 days ago. This is context, not proof of abuse.'}] : []),
          ...(name==='guildMemberRemove'?[{name:'Roles at Departure',value:[...(member.roles?.cache?.values() || [])].filter(role=>role.id!==member.guild.id).slice(0,12).map(role=>`<@&${role.id}>`).join(' ')||'Unavailable or none'},
            {name:'Departure Type',value:'Not inferred. Kicks and bans are reported separately from confirmed audit entries.'}]:[])]});
      return;
    }
    if(name==='voiceStateUpdate') {
      const [before,after]=args;
      const member=after.member||before.member,guild=after.guild||before.guild;
      const config=await logs.settings(guild.id);
      if(config.enabled!==true)return;
      if(logs.ignored(config,before.channel,'voice')||logs.ignored(config,after.channel,'voice'))return;
      const source=after.channel || before.channel;
      if(before.channelId===after.channelId) {
        if(!after.channelId || config.captureVoiceStates!==true)return;
        const flags=[['selfMute','Self Mute'],['selfDeaf','Self Deafen'],['serverMute','Server Mute'],['serverDeaf','Server Deafen'],['streaming','Streaming'],['selfVideo','Camera']];
        const changed=flags.filter(([key])=>Boolean(before[key])!==Boolean(after[key]));
        if(!changed.length)return;
        await logs.publish(guild,'voice',`voice-state:${after.id}:${Date.now()}:${flags.map(([key])=>Number(Boolean(after[key]))).join('')}`,{
          title:'Voice State Updated',route:'voiceStates',voiceStateChange:true,description:`<@${after.id}> · \`${after.id}\``,fields:[{name:'Channel',value:`<#${after.channelId}>`},
            {name:'Changes',value:changed.map(([key,name])=>`**${name}**: ${before[key]?'On':'Off'} → ${after[key]?'On':'Off'}`).join('\n')},
            {name:'Actor',value:'Connection state only. Server mute/deafen actors are reported separately by confirmed Discord audit entries.'}]},source);
        return;
      }
      await logs.publish(guild,'voice',`voice:${member?.id||after.id}:${Date.now()}:${after.channelId||'left'}`,{title:!before.channelId?'Voice Joined':!after.channelId?'Voice Left':'Voice Moved',
        route:!before.channelId?'voiceJoined':!after.channelId?'voiceLeft':'voiceMoved',
        description:`<@${member?.id||after.id}>`,fields:[{name:'From',value:before.channelId?`<#${before.channelId}>`:'Not connected',inline:true},{name:'To',value:after.channelId?`<#${after.channelId}>`:'Not connected',inline:true},
          {name:'Actor',value:'This connection event does not identify an actor. Moderator moves may have a separate confirmed audit entry.'}]},source);
    }
  } catch(error) { require('../utils/logger').error('Audit observer failed:',{event:name,code:error.code||error.name}); }
}
module.exports={ supported,observe,content };
