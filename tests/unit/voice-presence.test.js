const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType,PermissionsBitField:{Flags}}=require('discord.js');
const {loadModule,silentLogger}=require('../helpers/load-module.cjs');
const validation=require('../../src/services/setupValidation');

function fixture({write}={}) {
  const module=loadModule('src/services/voicePresence.js',{
    '../database/guildConfig':{},'../config/development':{allowsGuild:id=>id==='guild'},'../utils/logger':silentLogger,
  });
  let time=0,timers=0;
  const writes=[],messages=[],states=new Map();
  const config={enabled:true,channels:['a','b'],intervalMinutes:15,phrases:'First phrase\nSecond phrase',announceOwner:true};
  const bot={id:'bot',permissions:{has:()=>true}},guild={id:'guild',members:{me:bot,cache:new Map([['owner',{displayName:'Boss'}]])},voiceStates:{cache:states},channels:{cache:new Map()}};
  for(const id of ['a','b'])guild.channels.cache.set(id,{id,type:ChannelType.GuildVoice,permissionsFor:()=>({has:()=>true}),send:async payload=>messages.push({id,payload})});
  const worker=module.createVoicePresence({configFor:async()=>config,ownerId:()=> 'owner',now:()=>time,random:()=>0,
    write:write || (async(channel,status)=>writes.push({id:channel.id,status})),setInterval:()=>{timers++;return{unref(){}};},clearInterval:()=>{}});
  const client={guilds:{cache:new Map([['guild',guild]])}};
  async function move(from,to,id='owner') {
    if(to)states.set(id,{channelId:to});else states.delete(id);
    await worker.onVoiceState({guild,id,channelId:from},{guild,id,channelId:to});
  }
  return{module,worker,config,guild,client,writes,messages,move,states,time:value=>{time=value;},timers:()=>timers};
}

test('voice statuses rotate on schedule, avoid repeated phrases and use one timer',async()=>{
  const f=fixture();await f.worker.start(f.client);await f.worker.start(f.client);
  assert.equal(f.timers(),1);assert.equal(f.writes.length,2);
  await f.worker.tick();assert.equal(f.writes.length,2);
  f.time(15*60000);await f.worker.tick();
  assert.equal(f.writes.length,4);assert.equal(f.writes.at(-1).status,'SECOND PHRASE');
  assert.equal(f.messages.length,0);await f.worker.stop();
});

test('only the configured bot owner gets priority and arrival embeds with mentions disabled',async()=>{
  const f=fixture();await f.worker.start(f.client);
  await f.move(null,'a','ordinary');assert.equal(f.messages.length,0);
  await f.move(null,'a');
  assert.equal(f.writes.at(-1).status,'👑 BOSS IS HERE');assert.equal(f.messages.length,1);
  assert.equal(f.messages[0].payload.embeds[0].toJSON().title,'👑 BOSS IS HERE');
  assert.equal(f.messages[0].payload.allowedMentions.parse.length,0);
  await f.move('a','a');assert.equal(f.messages.length,1);
  await f.move('a','b');
  assert.equal(f.messages.length,2);
  assert(f.writes.some(row=>row.id==='a'&&row.status!=='👑 BOSS IS HERE'));
  await f.move('b','a');assert.equal(f.messages.length,2);
  await f.move('a',null);assert.notEqual(f.writes.at(-1).status,'👑 BOSS IS HERE');
  f.time(5*60000);await f.move(null,'a');assert.equal(f.messages.length,3);
  await f.worker.stop();
});

test('restart does not announce an owner already present and disabling stops all owner activity',async()=>{
  const f=fixture();f.states.set('owner',{channelId:'a'});
  await f.worker.start(f.client);assert.equal(f.messages.length,0);
  assert.equal(f.writes.find(row=>row.id==='a').status,'👑 BOSS IS HERE');
  f.config.enabled=false;f.time(30*60000);await f.worker.tick();
  const count=f.writes.length;await f.move('a','b');assert.equal(f.writes.length,count);assert.equal(f.messages.length,0);
  f.config.enabled=true;f.config.channels=['a'];await f.move('b',null);await f.move(null,'b');
  assert.equal(f.messages.length,1);assert.equal(f.writes.at(-1).status,'👑 BOSS IS HERE');await f.worker.stop();
});

test('owner arrival messages are optional and missing status permission prevents writes',async()=>{
  const f=fixture();f.config.announceOwner=false;
  f.guild.channels.cache.get('b').permissionsFor=()=>({has:flags=>!flags.includes(Flags.SetVoiceChannelStatus)});
  await f.worker.start(f.client);assert.equal(f.writes.length,1);
  await f.move(null,'a');assert.equal(f.messages.length,0);assert.equal(f.writes.at(-1).status,'👑 BOSS IS HERE');
  await f.worker.stop();
});

test('voice presence setup rejects text channels, missing permissions and oversized phrase lists',()=>{
  const f=fixture(),guild=f.guild;
  assert.equal(validation.validateSetup('voicepresence',{enabled:false},guild).ready,true);
  assert.equal(validation.validateSetup('voicepresence',{enabled:true,channels:['a']},guild).ready,true);
  assert.equal(validation.validateSetup('voicepresence',{enabled:true,channels:[]},guild).ready,true);
  guild.channels.cache.get('a').type=ChannelType.GuildText;
  assert.equal(validation.validateSetup('voicepresence',{enabled:true,channels:['a']},guild).ready,false);
  guild.channels.cache.get('a').type=ChannelType.GuildVoice;
  assert.equal(validation.validateSetup('voicepresence',{enabled:true,channels:['a'],phrases:'x'.repeat(101)},guild).ready,false);
  assert.equal(validation.validateSetup('voicepresence',{enabled:true,channels:['a'],phrases:Array(31).fill('Short').join('\n')},guild).ready,false);
});

test('owner presence works in unselected rooms and cleanup keeps the per-room announcement cooldown',async()=>{
  const f=fixture();f.config.channels=[];
  await f.worker.start(f.client);assert.equal(f.writes.length,0);
  await f.move(null,'a');assert.equal(f.writes.at(-1).status,'👑 BOSS IS HERE');assert.equal(f.messages.length,1);
  await f.move('a','b');
  assert.equal(f.writes.findLast(row=>row.id==='a').status,null);
  assert.equal(f.writes.findLast(row=>row.id==='b').status,'👑 BOSS IS HERE');
  await f.worker.tick();
  await f.move('b','a');assert.equal(f.messages.length,2);
  await f.move('a',null);assert.equal(f.writes.at(-1).status,null);
  await f.worker.stop();
});

test('startup discovers an owner in any voice room without starting random rotation there',async()=>{
  const f=fixture();f.config.channels=[];f.states.set('owner',{channelId:'b'});
  await f.worker.start(f.client);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].id,'b');assert.equal(f.messages.length,0);
  f.time(30*60000);await f.worker.tick();assert.equal(f.writes.length,1);
  await f.worker.stop();
});

test('the default writer uses the official voice status REST route and payload',async()=>{
  const f=fixture(),requests=[];
  for(const channel of f.guild.channels.cache.values())channel.client={rest:{put:async(route,payload)=>requests.push({route,payload})}};
  const worker=f.module.createVoicePresence({configFor:async()=>f.config,ownerId:()=> 'owner',random:()=>0,setInterval:()=>({unref(){}}),clearInterval:()=>{}});
  await worker.start(f.client);await worker.stop();
  assert.equal(requests.length,2);assert.equal(requests[0].route,'/channels/a/voice-status');
  assert.equal(requests[0].payload.body.status,'FIRST PHRASE');
});

test('leaving during an in-flight owner status update suppresses a stale arrival message',async()=>{
  let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const f=fixture({write:async(channel,status)=>{f.writes.push({id:channel.id,status});if(status==='👑 BOSS IS HERE'){started();await gate;}}});
  await f.worker.start(f.client);
  const arrival=f.move(null,'a');await entered;
  const leaving=f.move('a',null);release();await Promise.all([arrival,leaving]);
  assert.equal(f.messages.length,0);assert.notEqual(f.writes.at(-1).status,'👑 BOSS IS HERE');
  await f.worker.stop();
});
