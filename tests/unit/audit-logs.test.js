const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField: { Flags }, AuditLogEvent } = require('discord.js');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const validation = require('../../src/services/setupValidation');
const icons = require('../../src/config/setupEmojis');

function service(config) {
  const queued=[],finished=[],failed=[],sent=[];
  const jobs=[];
  const everyone={id:'everyone'},bot={id:'bot'};
  const channel={id:'logs',type:ChannelType.GuildText,permissionsFor:member=>({has:()=>member!==everyone}),send:async payload=>{sent.push(payload);return{id:'sent'};}};
  const guild={id:'guild',roles:{everyone},members:{me:bot},channels:{cache:new Map([['logs',channel]])}};
  const instance=loadModule('src/services/auditLogs.js',{
    '../database/guildConfig':{getGuildConfig:async()=>({settings:{auditLogs:config}})},
    '../database/auditLogQueue':{enqueue:async(...args)=>{queued.push(args);return '1';},claim:async()=>jobs.shift()||null,
      finish:async(...args)=>finished.push(args),fail:async(...args)=>failed.push(args),prune:async()=>{}},
    '../config/development':{allowsGuild:id=>id==='guild'},'../config/setupEmojis':icons,'../utils/logger':silentLogger,
  });
  return{instance,queued,finished,failed,sent,jobs,guild,channel};
}
function job(payload={}){return{id:'1',guild_id:'guild',category:'messages',payload:{title:'Message Deleted',timestamp:new Date().toISOString(),fields:[],...payload}};}

test('audit routing supports category overrides, fallback, disabled config and channel exclusions',async()=>{
  const config={enabled:true,defaultChannelId:'logs',messagesChannelId:'messages',ignoredChannels:['private']};
  const context=service(config);
  assert.equal(context.instance.destination(config,'messages'),'messages');
  assert.equal(context.instance.destination(config,'members'),'logs');
  assert.equal(await context.instance.publish(context.guild,'messages','event',{title:'Deleted'},{id:'private'}),false);
  assert.equal(await context.instance.publish(context.guild,'messages','event',{title:'Deleted'},{id:'logs'}),false);
  assert.equal(await context.instance.publish(context.guild,'messages','event',{title:'Deleted'},{id:'normal'}),true);
  config.enabled=false;
  assert.equal(await context.instance.publish(context.guild,'messages','event2',{title:'Deleted'}),false);
  assert.equal(context.queued.length,1);
});

test('audit delivery sends only to staff channels, prevents mentions and redacts disabled message text',async()=>{
  const config={enabled:true,defaultChannelId:'logs',captureMessageContent:false};
  const context=service(config);
  context.jobs.push(job({hasMessageContent:true,fields:[{name:'Content',value:'Sensitive text @everyone'}]}));
  context.instance.start({guilds:{cache:new Map([['guild',context.guild]])}});
  await context.instance.processBatch();await context.instance.stop();
  assert.equal(context.sent.length,1);
  assert.equal(context.sent[0].allowedMentions.parse.length,0);
  assert.equal(context.sent[0].enforceNonce,true);
  assert.equal(context.sent[0].embeds[0].toJSON().fields[0].value,'Content capture is disabled.');
  assert.equal(context.finished[0][1],'delivered');
});

test('disabled logging discards pending jobs and a public destination cannot receive logs',async()=>{
  const config={enabled:false,defaultChannelId:'logs'};
  const context=service(config);context.jobs.push(job());
  context.instance.start({guilds:{cache:new Map([['guild',context.guild]])}});
  await context.instance.processBatch();
  assert.equal(context.finished[0][1],'discarded');assert.equal(context.sent.length,0);
  config.enabled=true;context.jobs.push(job());context.channel.permissionsFor=()=>({has:()=>true});
  await context.instance.processBatch();await context.instance.stop();
  assert.equal(context.sent.length,0);assert.equal(context.failed[0][1].code,50013);
});

test('audit embeds stay within Discord total and per-field size limits',()=>{
  const context=service({});
  const embed=context.instance.buildEmbed(job({description:'x'.repeat(2000),fields:Array.from({length:20},()=>({name:'n'.repeat(300),value:'x'.repeat(2000)}))}));
  const data=embed.toJSON();
  assert(embed.length<=6000);assert(data.fields.every(field=>field.value.length<=1024&&field.name.length<=256));
});

function observers(){
  const calls=[];
  const config={enabled:true,captureMessageContent:true};
  const instance=loadModule('src/services/auditEvents.js',{
    './auditLogs':{publish:async(...args)=>calls.push(args),settings:async()=>config},
    '../database/guildConfig':{getGuildConfig:async()=>({prefix:'='})},'../utils/logger':silentLogger,
  });
  return{instance,calls,config};
}

test('message logs never invent a deletion actor or retain private staff command text',async()=>{
  const {instance,calls}=observers();
  const message={id:'message',guild:{id:'guild'},channel:{id:'chat'},channelId:'chat',author:{id:'user',bot:false},content:'=mn add @member private note',partial:false,client:{commands:new Map()}};
  await instance.observe('messageDelete',[message]);
  const fields=calls[0][3].fields;
  assert(fields.find(field=>field.name==='Content').value.includes('Content omitted'));
  assert.equal(JSON.stringify(fields).includes('private note'),false);
  assert(fields.find(field=>field.name==='Deleted By').value.startsWith('Unknown'));
});

test('Discord audit entries use the confirmed executor and remove secret change values',async()=>{
  const {instance,calls}=observers();
  await instance.observe('guildAuditLogEntryCreate',[{
    id:'entry',action:AuditLogEvent.WebhookUpdate,executorId:'moderator',targetId:'webhook',createdTimestamp:Date.now(),
    changes:[{key:'token',new:'secret'},{key:'name',old:'Old',new:'New'}],
  },{id:'guild',channels:{cache:new Map()}}]);
  const report=calls[0][3];
  assert(report.fields.find(field=>field.name==='Performed By').value.includes('moderator'));
  assert.equal(JSON.stringify(report).includes('secret'),false);
  assert(report.fields.find(field=>field.name==='Changes').value.includes('Old'));
});

test('audit setup requires a destination, View Audit Log and a channel hidden from everyone',()=>{
  const everyone={};
  const guild={id:'guild',roles:{everyone},members:{me:{permissions:{has:()=>true}}},channels:{cache:new Map([['public',{type:ChannelType.GuildText,permissionsFor:()=>({has:()=>true})}]])}};
  assert.equal(validation.validateSetup('auditlogs',{enabled:false},guild).ready,true);
  assert.equal(validation.validateSetup('auditlogs',{enabled:true},guild).ready,false);
  assert.equal(validation.validateSetup('auditlogs',{enabled:true,defaultChannelId:'public'},guild).ready,false);
});

test('a broken category destination falls back to the private general channel',async()=>{
  const config={enabled:true,defaultChannelId:'logs',messagesChannelId:'deleted'};
  const context=service(config);context.guild.channels.fetch=async()=>{throw Object.assign(new Error('Missing channel'),{code:10003});};
  context.jobs.push(job());context.instance.start({guilds:{cache:new Map([['guild',context.guild]])}});
  await context.instance.processBatch();await context.instance.stop();
  assert.equal(context.sent.length,1);assert.equal(context.finished[0][1],'delivered');
});

test('log-channel messages are ignored without hiding changes to log-channel permissions',async()=>{
  const context=service({enabled:true,defaultChannelId:'logs'});
  assert.equal(await context.instance.publish(context.guild,'messages','message',{title:'Delete'},{id:'logs'}),false);
  assert.equal(await context.instance.publish(context.guild,'server','entry',{title:'Permissions updated'},{id:'logs'}),true);
  assert.equal(context.queued.length,1);
});

test('event dispatch observes activity once and keeps business actions working after a logger failure',async()=>{
  const { EventEmitter }=require('node:events');
  const client=new EventEmitter(),calls=[];
  const handler=loadModule('src/handlers/eventHandler.js',{
    fs:{readdirSync:()=>['messageCreate.js']},path:require('node:path'),chokidar:{},'../utils/logger':silentLogger,
    '../services/auditEvents':{supported:['messageCreate','messageDelete'],observe:async name=>{calls.push(name);throw new Error('Audit unavailable');}},
    '/events/messageCreate.js':{name:'messageCreate',execute:async()=>calls.push('business')},
  });
  handler.loadEvents(client,'/events');
  assert.equal(client.listenerCount('messageCreate'),1);assert.equal(client.listenerCount('messageDelete'),1);
  await client.listeners('messageCreate')[0]({});
  assert.equal(calls.join(','),'messageCreate,business');
});
