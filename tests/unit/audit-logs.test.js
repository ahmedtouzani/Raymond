const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField: { Flags }, AuditLogEvent } = require('discord.js');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const validation = require('../../src/services/setupValidation');
const icons = require('../../src/config/setupEmojis');
const details = require('../../src/services/auditDetails');

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
    './auditDetails':details,
    './auditRoutes':require('../../src/services/auditRoutes'),
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
    './auditRoutes':require('../../src/services/auditRoutes'),
    '../config/development':{allowsGuild:id=>id==='guild'},
    './auditLogs':{publish:async(...args)=>calls.push(args),settings:async()=>config,ignored:(settings,channel)=>settings.ignoredChannels?.includes(channel?.id)},
    './auditDetails':details,
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

test('permission changes name added and removed flags and role updates show role mentions',()=>{
  const changes=details.changesSummary([
    {key:'permissions',old:String(Flags.ViewChannel|Flags.SendMessages),new:String(Flags.ViewChannel|Flags.Administrator)},
    {key:'$add',new:[{id:'123456789012345678',name:'Staff'}]},
    {key:'$remove',new:[{id:'223456789012345678',name:'Member'}]},
    {key:'metadata',new:{token:'hidden-credential',nested:{password:'hidden-password'},name:'Visible'}},
  ]);
  assert.match(changes,/Added: Administrator/);
  assert.match(changes,/Removed: Send Messages/);
  assert.match(changes,/Roles Added/);assert.match(changes,/<@&123456789012345678>/);
  assert.match(changes,/Roles Removed/);assert.match(changes,/Visible/);
  assert(!changes.includes('hidden-credential'));assert(!changes.includes('hidden-password'));
});

test('sensitive permission additions request review without treating removals or unchanged flags as escalation',()=>{
  assert.match(details.securityReview([{key:'permissions',old:'0',new:String(Flags.Administrator)}]),/Administrator/);
  assert.equal(details.securityReview([{key:'permissions',old:String(Flags.Administrator),new:'0'}]),null);
  assert.equal(details.securityReview([{key:'permissions',old:String(Flags.Administrator),new:String(Flags.Administrator)}]),null);
  assert.equal(details.securityReview([{key:'deny',old:'0',new:String(Flags.Administrator)}]),null);
  assert.equal(details.securityReview([{key:'allow',new:'not-a-number'}]),null);
  const context=service({});
  assert.equal(context.instance.buildEmbed(job({review:true})).toJSON().color,0xE6A34A);
});

test('attachment replacements with equal counts are logged and private attachments are omitted',async()=>{
  const {instance,calls,config}=observers();
  const before={id:'message',guild:{id:'guild'},channel:{id:'chat'},channelId:'chat',author:{id:'user'},content:'hello',attachments:new Map([['old',{name:'old.txt',size:1024}]])};
  const after={...before,editedTimestamp:123,attachments:new Map([['new',{name:'new.txt',size:2048}]])};
  await instance.observe('messageUpdate',[before,after]);
  assert.equal(calls.length,1);
  assert.match(calls[0][3].fields.find(f=>f.name==='Attachments Before').value,/old/);
  assert.match(calls[0][3].fields.find(f=>f.name==='Attachments After').value,/new/);
  before.content='=mn add user staff secret';
  before.attachments=new Map([['private',{name:'confidential.txt'}]]);
  await instance.observe('messageDelete',[before]);
  assert(!JSON.stringify(calls[1]).includes('confidential'));
  config.captureMessageContent=false;
  await instance.observe('messageUpdate',[before,{...after,editedTimestamp:124}]);
  assert(!JSON.stringify(calls[2]).includes('new.txt'));
});

test('voice state changes are opt in, compare booleans and obey channel exclusions',async()=>{
  const {instance,calls,config}=observers();
  const before={id:'member',guild:{id:'guild'},channelId:'voice',channel:{id:'voice'},selfMute:false};
  const after={...before,selfMute:true};
  await instance.observe('voiceStateUpdate',[before,after]);assert.equal(calls.length,0);
  config.captureVoiceStates=true;
  await instance.observe('voiceStateUpdate',[before,after]);assert.equal(calls.length,1);
  assert.match(calls[0][3].fields.find(f=>f.name==='Changes').value,/Self Mute.*Off → On/);
  assert(!calls[0][3].fields.find(f=>f.name==='Actor').value.includes('Performed by'));
  config.ignoredChannels=['voice'];
  await instance.observe('voiceStateUpdate',[before,after]);assert.equal(calls.length,1);
});

test('young account joins include context and departures retain cached roles without guessing kicks',async()=>{
  const {instance,calls}=observers();
  const member={id:'member',guild:{id:'guild'},user:{createdTimestamp:Date.now()-3600000},roles:{cache:new Map([['role',{id:'123456789012345678'}]])}};
  await instance.observe('guildMemberAdd',[member]);
  assert.match(calls[0][3].fields.find(f=>f.name==='Review').value,/not proof/);
  await instance.observe('guildMemberRemove',[member]);
  assert.match(calls[1][3].fields.find(f=>f.name==='Roles at Departure').value,/<@&123456789012345678>/);
  assert.match(calls[1][3].fields.find(f=>f.name==='Departure Type').value,/Not inferred/);
});

test('disabling capture before delivery redacts attachment names as well as message text',async()=>{
  const context=service({enabled:true,defaultChannelId:'logs',captureMessageContent:false});
  context.jobs.push(job({hasMessageContent:true,fields:[{name:'Attachments Before',value:'private.txt'},{name:'Attachments After',value:'secret.txt'}]}));
  context.instance.start({guilds:{cache:new Map([['guild',context.guild]])}});
  await context.instance.processBatch();await context.instance.stop();
  const output=JSON.stringify(context.sent[0]);assert(!output.includes('private.txt'));assert(!output.includes('secret.txt'));
});

test('turning off optional voice state capture discards queued state events',async()=>{
  const context=service({enabled:true,defaultChannelId:'logs',captureVoiceStates:false});
  context.jobs.push({...job({voiceStateChange:true,title:'Voice State Updated'}),category:'voice'});
  context.instance.start({guilds:{cache:new Map([['guild',context.guild]])}});
  await context.instance.processBatch();await context.instance.stop();
  assert.equal(context.sent.length,0);assert.equal(context.finished[0][1],'discarded');
});

function logsCommand(config, authorized = true) {
  const reports=[],queued=[],replies=[];
  const command=loadModule('src/commands/Admin/auditlogs.js',{
    '../../services/auditRoutes':require('../../src/services/auditRoutes'),
    '../../handlers/commandAuthorization':{isBotOwner:()=>false},
    '../../services/auditLogs':{settings:async()=>config,destination:(settings,name,route)=>settings.routes?.[route]||settings[`${name}ChannelId`]||settings.defaultChannelId,
      publish:async(...args)=>{queued.push(args);return true;}},
    '../../database/auditLogQueue':{status:async()=>[{status:'failed',count:2}],health:async()=>({failed:2,oldest_waiting:new Date(Date.now()-600000),last_delivered:null})},
    '../../handlers/functions/sendEmbed':{sendEmbed:async(message,data)=>reports.push(data)},'../../config/setupEmojis':icons,
  });
  const message={id:'request',author:{id:'admin'},member:{permissions:{has:()=>authorized}},guild:{id:'guild',members:{me:{permissions:{has:()=>false}}}},reply:async data=>replies.push(data)};
  return {command,message,reports,queued,replies};
}

test('logs test all checks distinct destinations once and supports an individual category',async()=>{
  const context=logsCommand({enabled:true,defaultChannelId:'general',moderationChannelId:'staff',messagesChannelId:'chatlogs'});
  await context.command.execute(context.message,['test','all']);
  assert.equal(context.queued.length,3);
  assert.equal(new Set(context.queued.map(call=>call[2])).size,3);
  assert.equal(context.queued.filter(call=>call[3].fields[1].value==='<#general>').length,1);
  context.queued.length=0;
  await context.command.execute(context.message,['test','voice']);
  assert.equal(context.queued.length,1);assert.equal(context.queued[0][1],'voice');
});

test('audit health reports guild routing, missing audit permission, failures and stalled queue',async()=>{
  const context=logsCommand({enabled:true,defaultChannelId:'general',voiceChannelId:'voicelogs'});
  await context.command.execute(context.message,['status']);
  const fields=context.reports[0].fields;
  assert.match(fields.find(f=>f.name==='Category Routing').value,/voicelogs/);
  const health=fields.find(f=>f.name==='Health').value;
  assert.match(health,/View Audit Log/);assert.match(health,/2 failed/);assert.match(health,/5 minutes/);
});

test('ordinary members cannot inspect audit health or enqueue test messages',async()=>{
  const context=logsCommand({enabled:true,defaultChannelId:'general'},false);
  await context.command.execute(context.message,['test','all']);
  assert.equal(context.queued.length,0);assert.equal(context.reports.length,0);assert.equal(context.replies.length,1);
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

test('detailed routing overrides broad destinations and broken detailed channels fall back safely',async()=>{
  const config={enabled:true,defaultChannelId:'logs',routes:{roleCreated:'detail'}};
  const context=service(config),destinations=[];
  const detail={...context.channel,id:'detail',send:async()=>{destinations.push('detail');return{id:'sent-detail'};}};
  context.guild.channels.cache.set('detail',detail);
  context.channel.send=async()=>{destinations.push('general');return{id:'sent-general'};};
  assert.equal(context.instance.destination(config,'server','roleCreated'),'detail');
  assert.equal(await context.instance.publish(context.guild,'messages','ignore',{title:'Deleted'},{id:'detail'}),false);
  context.jobs.push({...job({route:'roleCreated'}),category:'server'});
  context.instance.start({guilds:{cache:new Map([['guild',context.guild]])}});
  await context.instance.processBatch();
  assert.equal(destinations[0],'detail');
  detail.permissionsFor=()=>({has:()=>true});
  context.jobs.push({...job({route:'roleCreated'}),category:'server'});
  await context.instance.processBatch();await context.instance.stop();
  assert.equal(destinations[1],'general');assert.equal(context.failed.length,0);
});

test('logs test all includes every distinct detailed route and individual route keys are accepted',async()=>{
  const context=logsCommand({enabled:true,defaultChannelId:'general',routes:{roleCreated:'new-role',voiceJoined:'voice-join'}});
  await context.command.execute(context.message,['test','all']);
  assert.equal(context.queued.length,3);
  assert(context.queued.some(call=>call[3].route==='roleCreated'));
  context.queued.length=0;
  await context.command.execute(context.message,['test','voiceJoined']);
  assert.equal(context.queued.length,1);assert.equal(context.queued[0][3].route,'voiceJoined');
});

for (const [platform, paths, eventsPath] of [
  ['native', require('node:path'), require('node:path').resolve('fixtures', 'events')],
  ['POSIX', require('node:path').posix, '/fixtures/events'],
  ['Windows', require('node:path').win32, 'C:\\fixtures\\events'],
]) {
  test(`event dispatch on ${platform} observes once and preserves business actions after logger failure`, async () => {
    const { EventEmitter } = require('node:events');
    const client = new EventEmitter(), calls = [];
    const handler = loadModule('src/handlers/eventHandler.js', {
      fs: { readdirSync: () => ['messageCreate.js'] }, path: paths, chokidar: {}, '../utils/logger': silentLogger,
      '../services/auditEvents': { supported: ['messageCreate', 'messageDelete'], observe: async name => { calls.push(name); throw new Error('Audit unavailable'); } },
      [paths.join(eventsPath, 'messageCreate.js')]: { name: 'messageCreate', execute: async () => calls.push('business') },
    });
    handler.loadEvents(client, eventsPath);
    assert.equal(client.listenerCount('messageCreate'), 1); assert.equal(client.listenerCount('messageDelete'), 1);
    await client.listeners('messageCreate')[0]({});
    assert.equal(calls.join(','), 'messageCreate,business');
  });
}
