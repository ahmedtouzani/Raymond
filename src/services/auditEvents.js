const { AuditLogEvent, escapeMarkdown } = require('discord.js');
const logs = require('./auditLogs');
const { allowsGuild } = require('../config/development');
const names = new Map(Object.entries(AuditLogEvent).filter(([key])=>!/^\d+$/.test(key)).map(([name,id])=>[id,name]));
const supported = ['guildAuditLogEntryCreate','messageDelete','messageDeleteBulk','messageUpdate','guildMemberAdd','guildMemberRemove','voiceStateUpdate'];
const label = value => String(value).replace(/([a-z])([A-Z])/g,'$1 $2');
const clean = value => escapeMarkdown(String(value ?? 'Unknown')).slice(0,800);
const when = timestamp => timestamp ? `<t:${Math.floor(timestamp/1000)}:F>` : 'Unknown';
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
async function observe(name,args,client) {
  if (!supported.includes(name)) return;
  const eventGuild=name==='guildAuditLogEntryCreate'?args[1]:name==='messageDeleteBulk'?(args[1]?.guild||args[0]?.first()?.guild):(args[0]?.guild||args[1]?.guild);
  if(!eventGuild || !allowsGuild(eventGuild.id))return;
  try {
    if (name==='guildAuditLogEntryCreate') {
      const [entry,guild]=args, action=names.get(entry.action)||`Action ${entry.action}`;
      const changes=(entry.changes||[]).filter(change=>!/(token|secret|password|authorization|code|url|avatar|image)/i.test(change.key)).slice(0,8);
      const fields=[{name:'Performed By',value:entry.executorId ? `<@${entry.executorId}> · \`${entry.executorId}\`` : 'Unknown · Discord did not provide the actor.'}];
      if(entry.targetId)fields.push({name:'Target',value:/^(Member|BotAdd)/.test(action)?`<@${entry.targetId}> · \`${entry.targetId}\``:/^Role/.test(action)?`<@&${entry.targetId}>`:/^Channel/.test(action)?`<#${entry.targetId}>`:`\`${String(entry.targetId).slice(0,100)}\``});
      if(entry.reason)fields.push({name:'Reason',value:clean(entry.reason)});
      if(entry.extra?.count)fields.push({name:'Count',value:String(entry.extra.count)});
      const details=changes.map(change=>{
        const show=value=>typeof value==='object' && value!==null ? clean(JSON.stringify(value).slice(0,180)) : clean(value);
        return `**${clean(change.key)}**\nBefore: ${show(change.old)}\nAfter: ${show(change.new)}`;
      }).join('\n\n');
      if(details)fields.push({name:'Changes',value:details.slice(0,1000)});
      const sourceId=entry.extra?.channel?.id || entry.extra?.channelId || (/^(Channel|Thread)/.test(action)?entry.targetId:null);
      const source=sourceId ? {id:sourceId,parentId:guild.channels.cache.get(sourceId)?.parentId} : null;
      await logs.publish(guild,category(action),`discord-audit:${entry.id}`,{title:label(action),description:'Confirmed Discord audit entry.',fields,timestamp:new Date(entry.createdTimestamp).toISOString()},source);
      return;
    }
    if(name==='messageDelete' || name==='messageUpdate') {
      const before=args[0],after=args[1],message=after||before;
      if(!message.guild || message.author?.bot || before.author?.bot)return;
      if(name==='messageUpdate' && before.content===after.content && before.attachments?.size===after.attachments?.size)return;
      const config=await logs.settings(message.guild.id);
      if(config.enabled!==true)return;
      const prefix=(await require('../database/guildConfig').getGuildConfig(message.guild.id)).prefix;
      const fields=[{name:'Channel',value:`<#${message.channelId}>`},{name:'Author',value:message.author?.id?`<@${message.author.id}>`:'Unknown · Message was not cached.'},
        {name:'Message ID',value:message.id}];
      if(after){fields.push({name:'Before',value:content(before,config,prefix)},{name:'After',value:content(after,config,prefix)});}
      else fields.push({name:'Content',value:content(before,config,prefix)},{name:'Deleted By',value:'Unknown · Message deletion events do not identify who deleted this exact message.'});
      const version=after?.editedTimestamp || 'deleted';
      await logs.publish(message.guild,'messages',`message:${message.id}:${version}`,{title:after?'Message Edited':'Message Deleted',description:after?`[Open message](${message.url})`:'A message was removed.',fields,hasMessageContent:true},message.channel);
      return;
    }
    if(name==='messageDeleteBulk') {
      const messages=args[0],channel=args[1] || messages.first()?.channel;
      if(!channel?.guild)return;
      const ids=[...messages.keys()].sort();
      await logs.publish(channel.guild,'messages',`bulk:${channel.id}:${ids[0]}:${ids.length}`,{title:'Messages Bulk Deleted',description:`${ids.length} messages removed from <#${channel.id}>.`,fields:[{name:'Actor',value:'See the corresponding Discord audit entry when available. No exact message-to-actor attribution is assumed.'}]},channel);
      return;
    }
    if(name==='guildMemberAdd' || name==='guildMemberRemove') {
      const member=args[0];
      await logs.publish(member.guild,'members',`member:${name}:${member.id}:${name==='guildMemberAdd'?member.joinedTimestamp:Date.now()}`,{
        title:name==='guildMemberAdd'?'Member Joined':'Member Left',description:`<@${member.id}> · \`${member.id}\``,fields:[
          {name:'Account Created',value:when(member.user?.createdTimestamp),inline:true},{name:'Joined Server',value:when(member.joinedTimestamp),inline:true},
          ...(name==='guildMemberRemove'?[{name:'Departure Type',value:'Not inferred. Kicks and bans are reported separately from confirmed audit entries.'}]:[])]});
      return;
    }
    if(name==='voiceStateUpdate') {
      const [before,after]=args;
      if(before.channelId===after.channelId)return;
      const member=after.member||before.member,guild=after.guild||before.guild;
      const config=await logs.settings(guild.id);
      if(logs.ignored(config,before.channel,'voice')||logs.ignored(config,after.channel,'voice'))return;
      const source=after.channel || before.channel;
      await logs.publish(guild,'voice',`voice:${member?.id||after.id}:${Date.now()}:${after.channelId||'left'}`,{title:!before.channelId?'Voice Joined':!after.channelId?'Voice Left':'Voice Moved',
        description:`<@${member?.id||after.id}>`,fields:[{name:'From',value:before.channelId?`<#${before.channelId}>`:'Not connected',inline:true},{name:'To',value:after.channelId?`<#${after.channelId}>`:'Not connected',inline:true},
          {name:'Actor',value:'This connection event does not identify an actor. Moderator moves may have a separate confirmed audit entry.'}]},source);
    }
  } catch(error) { require('../utils/logger').error('Audit observer failed:',{event:name,code:error.code||error.name}); }
}
module.exports={ supported,observe,content };
