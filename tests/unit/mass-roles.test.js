const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PermissionsBitField:{Flags}}=require('discord.js');
const {loadModule,silentLogger}=require('../helpers/load-module.cjs');
const icons=require('../../src/config/setupEmojis');

function fixture() {
  const changes=[],items=new Map(),members=new Map(),edits=[];
  const role=(id,position)=>({id,position,managed:false,permissions:{has:()=>false}});
  const roles=new Map([['source',role('source',2)],['target',role('target',1)]]);
  const highest=position=>({comparePositionTo:value=>position-value.position});
  const issuer={id:'owner',user:{bot:false},permissions:{has:()=>true},roles:{highest:highest(20),cache:new Map()}};
  const bot={id:'bot',user:{bot:true},permissions:{has:()=>true},roles:{highest:highest(10),cache:new Map()}};
  members.set('owner',issuer);members.set('bot',bot);
  const job={id:'1',guild_id:'guild',issuer_id:'owner',source_role_id:'source',target_role_id:'target',include_bots:false,state:'pending',lease_token:'lease',channel_id:'channel',message_id:'panel'};
  const store={
    claim:async()=>{if(job.state!=='pending')return;job.state='running';return job;},
    renew:async()=>job.state,
    items:async()=>[...items.values()].filter(item=>item.state==='pending'),
    item:async(_,id,update)=>Object.assign(items.get(id),update),
    release:async(_,state,note)=>{job.state=job.state==='cancelling'?'cancelled':state;job.last_error=note;},
    get:async()=>({...job,total:items.size,done:[...items.values()].filter(i=>i.state==='done').length,
      skipped:[...items.values()].filter(i=>i.state==='skipped').length,failed:[...items.values()].filter(i=>i.state==='failed').length,
      remaining:[...items.values()].filter(i=>i.state==='pending').length}),prune:async()=>{},
  };
  const guild={id:'guild',name:'Guild',ownerId:'guild-owner',roles:{cache:roles,fetch:async()=>roles},
    members:{me:bot,fetchMe:async()=>bot,fetch:async input=>{
      if(input==null)return members;
      const found=members.get(typeof input==='string'?input:input.user);
      if(!found)throw Object.assign(new Error('Left'),{code:10007});return found;
    }},channels:{cache:new Map([['channel',{messages:{fetch:async()=>({edit:async payload=>edits.push(payload)})}}]])}};
  const module=loadModule('src/services/massRoles.js',{'../handlers/commandAuthorization':{isBotOwner:id=>id==='owner'},
    '../config/development':{allowsGuild:id=>id==='guild'},'../database/massRoles':store,'../utils/logger':silentLogger,'../config/setupEmojis':icons});
  function add(id,held=['source'],botUser=false) {
    const member={id,user:{bot:botUser},roles:{cache:new Map(held.map(key=>[key,roles.get(key)])),
      add:async key=>{changes.push(['add',id,key]);member.roles.cache.set(key,roles.get(key));},
      remove:async key=>{changes.push(['remove',id,key]);member.roles.cache.delete(key);}}};
    members.set(id,member);items.set(id,{user_id:id,state:'pending',started:false,target_added:false});return member;
  }
  const worker=module.createWorker({store,pace:async()=>{}}),client={guilds:{cache:new Map([['guild',guild]])}};
  return{module,worker,client,guild,roles,issuer,bot,members,items,job,store,changes,edits,add};
}

test('role swap preview is source-scoped, skips bots by default and makes no changes',async()=>{
  const f=fixture();f.add('member');f.add('both',['source','target']);f.add('outsider',['target']);f.add('other-bot',['source'],true);
  f.bot.roles.cache.set('source',f.roles.get('source'));
  const plan=await f.module.preview(f.guild,'owner','source','target');
  assert.deepEqual(Array.from(plan.memberIds),['member','both']);assert.equal(plan.alreadyTarget,1);assert.equal(plan.skippedBots,2);
  assert.equal(f.changes.length,0);
  const all=await f.module.preview(f.guild,'owner','source','target',true);assert.equal(all.memberIds.length,3);
});

test('managed, identical, missing and hierarchy-protected roles are rejected',async()=>{
  const f=fixture();
  await assert.rejects(f.module.validate(f.guild,'owner','source','source'),/different/);
  await assert.rejects(f.module.validate(f.guild,'owner','source','missing'),/existing roles/);
  f.roles.get('target').managed=true;await assert.rejects(f.module.validate(f.guild,'owner','source','target'),/managed/);
  f.roles.get('target').managed=false;f.roles.get('target').position=11;
  await assert.rejects(f.module.validate(f.guild,'owner','source','target'),/bot role/);
  f.roles.get('target').position=1;f.issuer.permissions.has=()=>false;
  await assert.rejects(f.module.validate(f.guild,'owner','source','target'),/Manage Roles/);
});

test('worker adds and confirms the replacement before removing the source and preserves other roles',async()=>{
  const f=fixture(),member=f.add('member',['source','unrelated']);
  await f.worker.start(f.client);await f.worker.stop();
  assert.deepEqual(f.changes,[['add','member','target'],['remove','member','source']]);
  assert(member.roles.cache.has('target'));assert(member.roles.cache.has('unrelated'));assert(!member.roles.cache.has('source'));
  assert.equal(f.items.get('member').state,'done');assert.equal(f.job.state,'completed');
});

test('failed role addition never removes the source and failed items can resume safely',async()=>{
  const f=fixture(),member=f.add('member');const add=member.roles.add;
  member.roles.add=async()=>{throw new Error('Network failure');};
  await f.worker.start(f.client);
  assert.equal(member.roles.cache.has('source'),true);assert.equal(f.changes.length,0);assert.equal(f.items.get('member').state,'failed');
  member.roles.add=add;f.items.get('member').state='pending';f.job.state='pending';await f.worker.tick();await f.worker.stop();
  assert.equal(f.items.get('member').state,'done');
});

test('missing replacement after an ambiguous add keeps the source role',async()=>{
  const f=fixture(),member=f.add('member');member.roles.add=async()=>{};
  await f.worker.start(f.client);await f.worker.stop();
  assert.equal(member.roles.cache.has('source'),true);assert.equal(f.items.get('member').state,'failed');assert.equal(f.changes.length,0);
});

test('a resumed member already holding both roles only loses the source role',async()=>{
  const f=fixture();f.add('member',['source','target']);f.items.get('member').started=true;
  await f.worker.start(f.client);await f.worker.stop();
  assert.deepEqual(f.changes,[['remove','member','source']]);assert.equal(f.items.get('member').state,'done');
});

test('cancellation stops after the current member and does not start another member',async()=>{
  const f=fixture(),first=f.add('first');f.add('second');const add=first.roles.add;
  first.roles.add=async key=>{await add(key);f.job.state='cancelling';};
  await f.worker.start(f.client);await f.worker.stop();
  assert.equal(f.items.get('first').state,'done');assert.equal(f.items.get('second').state,'pending');assert.equal(f.job.state,'cancelled');
});

test('permission loss pauses the job before any member mutation',async()=>{
  const f=fixture();f.add('member');f.bot.permissions.has=()=>false;
  await f.worker.start(f.client);await f.worker.stop();assert.equal(f.job.state,'paused');assert.equal(f.changes.length,0);
});

test('progress includes a small failure sample without enabling mentions',()=>{
  const f=fixture();const payload=f.module.progress({...f.job,failed:1,errors:[{user_id:'member',last_error:'Role update failed (50013)'}]});
  assert(payload.embeds[0].toJSON().fields.some(field=>field.name==='Failed Members · First 5'&&field.value.includes('50013')));
  assert.equal(payload.allowedMentions.parse.length,0);
});

function commandFixture() {
  const collector=new EventEmitter();let phaseEdits=0;
  collector.stop=()=>collector.emit('end');
  const edits=[],replies=[],created=[],cancelled=[];
  const panel={id:'panel',edit:async payload=>{edits.push(payload);phaseEdits++;},createMessageComponentCollector:()=>collector};
  const source='123456789012345678',target='223456789012345678';
  const command=loadModule('src/commands/OwnerOnly/massrole.js',{
    '../../handlers/commandAuthorization':{isBotOwner:id=>id==='owner'},'../../config/setupEmojis':icons,'../../utils/logger':silentLogger,
    '../../services/massRoles':{preview:async()=>({memberIds:['member'],alreadyTarget:0,skippedBots:0,includeBots:false}),validate:async()=>{},progress:()=>({embeds:[]})},
    '../../database/massRoles':{active:async()=>null,create:async job=>{created.push(job);return{id:'1'};},get:async()=>({id:'1'}),
      cancel:async(...args)=>{cancelled.push(args);return{id:'1'};}},
  });
  const message={guild:{id:'guild',name:'Guild'},channel:{id:'channel'},author:{id:'owner'},member:{permissions:{has:()=>true}},reply:async payload=>{replies.push(payload);return panel;}};
  async function click(user,id='massrole:confirm') {
    collector.emit('collect',{customId:id,user:{id:user},deferUpdate:async()=>{},reply:async payload=>replies.push(payload)});
    for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
  }
  return{command,message,source,target,edits,replies,created,cancelled,click,collector};
}

test('massrole is owner-only and confirmation rejects other users without creating a job',async()=>{
  const f=commandFixture();assert.equal(f.command.ownerOnly,true);assert.equal(f.command.hidden,true);
  await f.command.execute(f.message,[f.source,f.target]);assert.equal(f.created.length,0);
  await f.click('stranger');assert.equal(f.created.length,0);
  await f.click('owner');assert.equal(f.created.length,1);assert.equal(f.created[0].guildId,'guild');
  await f.click('owner');assert.equal(f.created.length,1);
});

test('cancelling the preview never starts a role mutation job',async()=>{
  const f=commandFixture();await f.command.execute(f.message,[f.source,f.target]);
  await f.click('owner','massrole:cancel');assert.equal(f.created.length,0);
});

test('the owner can cancel immediately even after requester or bot role permissions were lost',async()=>{
  const f=commandFixture();f.message.member.permissions.has=()=>false;
  assert.equal(f.command.cooldown,0);assert.equal(f.command.botPermissions,undefined);
  await f.command.execute(f.message,['cancel']);assert.equal(f.cancelled.length,1);assert.equal(f.created.length,0);
});
