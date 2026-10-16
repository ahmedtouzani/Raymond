const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AuditLogEvent,ChannelType}=require('discord.js');
const {loadModule,silentLogger}=require('../helpers/load-module.cjs');

function fixture() {
  const rows=new Map(),jobs=[],actions=[],reports=[],finished=[],deferred=[];
  const config={enabled:true,counterMute:true,counterMuteSeconds:60};
  let audit=[];
  const store={record:async(entry,guild,seconds)=>{
    if(rows.has(entry.id))return;
    const job={entry_id:entry.id,guild_id:guild,actor_id:entry.executorId,seconds,state:'prepared',undo_mute:false,undo_deaf:false};rows.set(entry.id,job);return job;
  },arm:async(job,mute,deaf)=>{job.undo_mute=mute;job.undo_deaf=deaf;},clearFlag:async(job,flag)=>{job[flag]=false;},
  activate:async id=>{rows.get(id).state='active';},finish:async(job,state='done')=>{job.state=state;finished.push({id:job.entry_id,state});},
  claim:async()=>jobs.shift(),retry:async job=>{job.retried=true;},defer:async job=>deferred.push(job),prune:async()=>{}};
  const members=new Map();
  for(const id of ['owner','actor'])members.set(id,{id,voice:{channelId:'room',serverMute:false,serverDeaf:false,
    setMute:async(value,reason)=>{actions.push({id,kind:'mute',value,reason});members.get(id).voice.serverMute=value;},
    setDeaf:async(value,reason)=>{actions.push({id,kind:'deaf',value,reason});members.get(id).voice.serverDeaf=value;}}});
  const guild={id:'guild',client:{user:{id:'bot'}},members:{me:{permissions:{has:()=>true}},fetch:async id=>members.get(id)},
    fetchAuditLogs:async()=>({entries:new Map(audit.map((entry,i)=>[i,entry]))})};
  const module=loadModule('src/services/ownerGuard.js',{'../database/guildConfig':{},'../config/development':{allowsGuild:id=>id==='guild'},
    '../database/ownerGuard':store,'./auditLogs':{},'../utils/logger':silentLogger});
  const recreate=()=>module.createOwnerGuard({store,configFor:async()=>config,ownerId:()=> 'owner',now:()=>100000,publish:async(...args)=>reports.push(args)});
  const guard=recreate();
  const entry={id:'entry',action:AuditLogEvent.MemberUpdate,targetId:'owner',executorId:'actor',createdTimestamp:100000,
    changes:[{key:'mute',old:false,new:true},{key:'deaf',old:false,new:true}]};
  return{guard,recreate,config,entry,guild,members,rows,jobs,actions,reports,finished,deferred,audit:value=>{audit=value;},client:{guilds:{cache:new Map([['guild',guild]])}}};
}

test('Owner Guard mirrors both flags only onto the confirmed actor once',async()=>{
  const f=fixture();await f.guard.onAudit(f.entry,f.guild);await f.guard.onAudit(f.entry,f.guild);
  assert.equal(f.actions.length,4);
  assert.equal(f.actions[0].id,'owner');assert.equal(f.actions[0].value,false);
  assert.equal(f.actions[1].kind,'deaf');assert.equal(f.actions[1].value,false);
  assert.equal(f.actions[2].id,'actor');assert.equal(f.actions[2].value,true);
  assert.equal(f.actions[3].kind,'deaf');assert.equal(f.actions[3].value,true);
  assert.equal(f.rows.get('entry').state,'active');assert.equal(f.rows.get('entry').seconds,60);
  await f.guard.stop();
});

test('self voice flags, missing actors, other targets, owner actions and bot loops never trigger retaliation',async()=>{
  for(const patch of [
    {changes:[{key:'self_mute',new:true},{key:'self_deaf',new:true}]},{executorId:null},{targetId:'other'},
    {executorId:'owner'},{executorId:'bot'},{createdTimestamp:1000},{changes:[{key:'mute',old:true,new:false}]},
  ]) {const f=fixture();await f.guard.onAudit({...f.entry,...patch},f.guild);assert.equal(f.actions.length,0);assert.equal(f.rows.size,0);await f.guard.stop();}
});

test('legacy disabled settings cannot turn off owner protection',async()=>{
  const f=fixture();f.config.enabled=false;await f.guard.onAudit(f.entry,f.guild);
  assert.equal(f.actions.length,4);await f.guard.stop();
});

test('missing permissions cannot mutate voice state',async()=>{
  const f=fixture();f.guild.members.me.permissions.has=()=>false;
  await f.guard.onAudit(f.entry,f.guild);assert.equal(f.actions.length,0);await f.guard.stop();
});

test('pre-existing flags are not mirrored again and disconnected actors are left untouched',async()=>{
  for(const disconnected of [false,true]) {
    const f=fixture();if(disconnected)f.members.get('actor').voice.channelId=null;else {f.members.get('actor').voice.serverMute=true;f.members.get('actor').voice.serverDeaf=true;}
    await f.guard.onAudit(f.entry,f.guild);
    assert.equal(f.actions.length,2);assert.equal(f.rows.get('entry').state,'done');await f.guard.stop();
  }
});

test('expiry survives worker recreation and only releases the mute confirmed as its own',async()=>{
  const f=fixture();await f.guard.onAudit(f.entry,f.guild);
  f.audit([{targetId:'actor',executorId:'bot',reason:f.actions[2].reason,createdTimestamp:100000,changes:[{key:'mute',new:true},{key:'deaf',new:true}]}]);
  f.jobs.push(f.rows.get('entry'));
  await f.guard.stop();const restarted=f.recreate();
  await restarted.start(f.client);await restarted.stop();
  assert.equal(f.actions.at(-1).id,'actor');assert.equal(f.actions.at(-1).value,false);
  assert.equal(f.rows.get('entry').state,'done');
});

test('a later moderator mute is preserved and marked for review',async()=>{
  const f=fixture();await f.guard.onAudit(f.entry,f.guild);
  f.audit([{targetId:'actor',executorId:'moderator',reason:'Unrelated moderation',createdTimestamp:100001,changes:[{key:'mute',new:true}]}]);
  f.jobs.push(f.rows.get('entry'));await f.guard.start(f.client);await f.guard.stop();
  assert.equal(f.actions.length,4);assert.equal(f.rows.get('entry').state,'review');
});

test('disconnected actors retain an expiry job and ambiguous mute failures are recoverable',async()=>{
  const f=fixture();await f.guard.onAudit(f.entry,f.guild);f.members.get('actor').voice.channelId=null;
  f.jobs.push(f.rows.get('entry'));await f.guard.start(f.client);await f.guard.stop();assert.equal(f.deferred.length,1);
  const another=fixture();another.members.get('actor').voice.setMute=async()=>{throw new Error('Ambiguous network response');};
  await another.guard.onAudit(another.entry,another.guild);
  assert.equal(another.rows.get('entry').state,'prepared');await another.guard.stop();
});

test('single-flag attacks mirror exactly that flag',async()=>{
  for(const key of ['mute','deaf']) {
    const f=fixture();f.entry.changes=[{key,old:false,new:true}];await f.guard.onAudit(f.entry,f.guild);
    assert.equal(f.actions.length,2);assert.equal(f.actions[1].kind,key);
    assert.equal(f.rows.get('entry').undo_mute,key==='mute');assert.equal(f.rows.get('entry').undo_deaf,key==='deaf');
    await f.guard.stop();
  }
});

test('expiry clears only the added deafen and preserves a pre-existing server mute',async()=>{
  const f=fixture();f.members.get('actor').voice.serverMute=true;await f.guard.onAudit(f.entry,f.guild);
  assert.equal(f.actions.length,3);assert.equal(f.actions[2].kind,'deaf');assert.equal(f.rows.get('entry').undo_mute,false);
  f.audit([{targetId:'actor',executorId:'bot',reason:f.actions[2].reason,createdTimestamp:100000,changes:[{key:'deaf',new:true}]}]);
  f.jobs.push(f.rows.get('entry'));await f.guard.start(f.client);await f.guard.stop();
  assert.equal(f.members.get('actor').voice.serverMute,true);assert.equal(f.members.get('actor').voice.serverDeaf,false);
  assert.equal(f.rows.get('entry').state,'done');
});

test('a later moderator mute is preserved while independently confirmed deafen still expires',async()=>{
  const f=fixture();await f.guard.onAudit(f.entry,f.guild);
  f.audit([
    {targetId:'actor',executorId:'bot',reason:f.actions[2].reason,createdTimestamp:100000,changes:[{key:'mute',new:true},{key:'deaf',new:true}]},
    {targetId:'actor',executorId:'moderator',createdTimestamp:100001,changes:[{key:'mute',new:true}]},
  ]);
  f.jobs.push(f.rows.get('entry'));await f.guard.start(f.client);await f.guard.stop();
  assert.equal(f.members.get('actor').voice.serverMute,true);assert.equal(f.members.get('actor').voice.serverDeaf,false);
  assert.equal(f.rows.get('entry').state,'review');assert.equal(f.rows.get('entry').undo_deaf,false);
});

test('mirror announcement is an embed with suppressed mentions and bounded repeat messages',async()=>{
  const f=fixture(),sent=[];
  f.members.get('owner').voice.channel={id:'room',type:ChannelType.GuildVoice,permissionsFor:()=>({has:()=>true}),send:async payload=>sent.push(payload)};
  await f.guard.onAudit(f.entry,f.guild);
  assert.equal(sent.length,1);assert.equal(sent[0].embeds[0].toJSON().title,'👑 WRONG TARGET — PROTECTION ACTIVE');
  assert.equal(sent[0].allowedMentions.parse.length,0);
  assert.match(sent[0].embeds[0].toJSON().description,/SERVER MUTE \+ SERVER DEAFEN/);
  f.members.get('actor').voice.serverMute=false;f.members.get('actor').voice.serverDeaf=false;
  await f.guard.onAudit({...f.entry,id:'another-entry'},f.guild);assert.equal(sent.length,1);
  await f.guard.stop();
});

test('a partial mirror failure is recovered after restart without touching an unapplied flag',async()=>{
  const f=fixture();f.members.get('actor').voice.setDeaf=async()=>{throw new Error('Network error');};
  await f.guard.onAudit(f.entry,f.guild);assert.equal(f.rows.get('entry').state,'prepared');
  f.audit([{targetId:'actor',executorId:'bot',reason:f.actions[2].reason,createdTimestamp:100000,changes:[{key:'mute',new:true}]}]);
  f.jobs.push(f.rows.get('entry'));await f.guard.stop();const restarted=f.recreate();
  await restarted.start(f.client);await restarted.stop();
  assert.equal(f.members.get('actor').voice.serverMute,false);assert.equal(f.rows.get('entry').state,'done');
});
