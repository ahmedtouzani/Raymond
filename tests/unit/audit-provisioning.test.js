const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField, OverwriteType } = require('discord.js');
const { Flags } = PermissionsBitField;
const provisioning = require('../../src/services/auditProvisioning');
const { routes, routeFor } = require('../../src/services/auditRoutes');

function fixture() {
  const channels = new Map(), created = [], saved = [];
  const everyone = { id: 'guild' }, staff = { id: 'staff' };
  const bot = { id: 'bot', permissions: new PermissionsBitField([Flags.ViewChannel,Flags.ManageChannels,Flags.ManageRoles,Flags.ViewAuditLog,Flags.ReadMessageHistory,Flags.SendMessages,Flags.EmbedLinks]) };
  const category = { id: 'category', name: 'Logs', type: ChannelType.GuildCategory, permissionsFor: () => bot.permissions };
  channels.set(category.id, category);
  const guild = { id: 'guild', roles: { everyone,cache: new Map([['guild',everyone],['staff',staff]]),fetch: async()=>{} },
    members: { me: bot,fetchMe:async()=>bot }, channels: {cache:channels,fetch:async()=>channels} };
  const state = { failAt: 0 };
  guild.channels.create = async input => {
    if(state.failAt && created.length+1===state.failAt)throw Object.assign(new Error('Rate/network error'),{code:50013});
    const channel = { id: `created-${created.length}`,parentId:input.parent,type:input.type,name:input.name,topic:input.topic,input,
      permissionsFor(entity) {
        let bits = new PermissionsBitField([Flags.ViewChannel,Flags.SendMessages,Flags.EmbedLinks,Flags.ReadMessageHistory]).bitfield;
        const all=input.permissionOverwrites.find(item=>item.id==='guild');
        bits &= ~new PermissionsBitField(all?.deny || []).bitfield;
        const selected=input.permissionOverwrites.find(item=>item.id===entity?.id && item.id!=='guild');
        bits |= new PermissionsBitField(selected?.allow || []).bitfield;
        return new PermissionsBitField(bits);
      } };
    created.push(channel);channels.set(channel.id,channel);return channel;
  };
  const options={categoryId:'category',staffRoleIds:['staff'],actorId:'admin',config:{captureMessageContent:false},authorized:async()=>true,
    persist:async config=>{saved.push(config);return true;}};
  return {guild,options,created,saved,state,category,channels,staff,bot};
}

test('audit channel preview performs no mutations and checks category capacity and access',()=>{
  const f=fixture();
  assert.equal(provisioning.plan(f.guild,f.options).createCount,routes.length);
  assert.equal(f.created.length,0);assert.equal(f.saved.length,0);
  assert.throws(()=>provisioning.plan(f.guild,{...f.options,categoryId:'foreign'}),/existing category/);
  assert.throws(()=>provisioning.plan(f.guild,{...f.options,staffRoleIds:['guild']}),/regular staff/);
  for(let i=0;i<30;i++)f.channels.set(`other-${i}`,{id:`other-${i}`,parentId:'category',type:ChannelType.GuildText});
  assert.throws(()=>provisioning.plan(f.guild,f.options),/50 channels/);
  f.bot.permissions.remove(Flags.ManageRoles);
  assert.throws(()=>provisioning.plan(f.guild,f.options),/Manage Roles/);
});

test('creation makes private read-only staff channels, preserves category and saves all routes once',async()=>{
  const f=fixture(),originalCategory=Object.keys(f.category).join(',');
  const result=await provisioning.create(f.guild,f.options);
  assert.equal(result.created,routes.length);assert.equal(f.saved.length,1);
  assert.equal(f.saved[0].enabled,true);assert.equal(f.saved[0].captureMessageContent,false);
  assert.equal(Object.keys(f.saved[0].routes).length,routes.length);
  assert.equal(f.saved[0].defaultChannelId,f.saved[0].routes.general);
  assert.equal(f.saved[0].voiceChannelId,f.saved[0].routes.voiceMoved);
  assert.equal(Object.keys(f.category).join(','),originalCategory);
  for(const channel of f.created) {
    assert.equal(channel.permissionsFor(f.guild.roles.everyone).has(Flags.ViewChannel),false);
    assert.equal(channel.permissionsFor(f.staff).has(Flags.ViewChannel),true);
    assert.equal(channel.permissionsFor(f.staff).has(Flags.SendMessages),false);
    assert.equal(channel.permissionsFor(f.bot).has([Flags.ViewChannel,Flags.SendMessages,Flags.EmbedLinks]),true);
    assert.equal(channel.input.permissionOverwrites.find(item=>item.id==='bot').type,OverwriteType.Member);
  }
  const repeated=await provisioning.create(f.guild,{...f.options,config:f.saved[0]});
  assert.equal(repeated.created,0);assert.equal(repeated.reused,routes.length);assert.equal(f.created.length,routes.length);
});

test('partial failures retain private channels and a retry reuses them without duplicate creation',async()=>{
  const f=fixture();f.state.failAt=4;
  await assert.rejects(provisioning.create(f.guild,f.options),/3 created channel\(s\) were retained/);
  assert.equal(f.saved.length,0);assert.equal(f.created.length,3);
  f.state.failAt=0;
  const result=await provisioning.create(f.guild,f.options);
  assert.equal(result.reused,3);assert.equal(result.created,routes.length-3);
  assert.equal(f.created.length,routes.length);
});

test('stale settings or revoked authorization never result in a successful save',async()=>{
  const f=fixture();
  await assert.rejects(provisioning.create(f.guild,{...f.options,persist:async()=>false}),/changed in another session/);
  assert.equal(f.saved.length,0);assert.equal(f.created.length,routes.length);
  const another=fixture();
  await assert.rejects(provisioning.create(another.guild,{...another.options,authorized:async()=>another.created.length<2}),/access changed/);
  assert.equal(another.created.length,2);assert.equal(another.saved.length,0);
});

test('unlinked name collisions and unsafe reused channels block provisioning before writes',async()=>{
  const f=fixture();
  f.channels.set('unrelated',{id:'unrelated',name:routes[0].name,parentId:'category',type:ChannelType.GuildText});
  assert.throws(()=>provisioning.plan(f.guild,f.options),/unlinked/);
  assert.equal(f.created.length,0);
  f.channels.delete('unrelated');
  f.channels.set('unsafe',{id:'unsafe',name:routes[0].name,topic:provisioning.marker(routes[0].key),parentId:'category',type:ChannelType.GuildText,
    permissionsFor:()=>new PermissionsBitField(Flags.ViewChannel)});
  assert.throws(()=>provisioning.plan(f.guild,f.options),/must be private/);
});

test('only one channel provisioning operation can run per guild in a process',async()=>{
  const f=fixture();let unblock,entered;
  const gate=new Promise(resolve=>{unblock=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const create=f.guild.channels.create;
  f.guild.channels.create=async input=>{entered();await gate;return create(input);};
  const first=provisioning.create(f.guild,f.options);
  await started;
  await assert.rejects(provisioning.create(f.guild,f.options),/Another logs setup/);
  unblock();await first;
});

test('native audit actions and Raymond cases map to detailed routes without changing queue categories',()=>{
  for(const [action,changes,expected] of [
    ['RoleCreate',[],'roleCreated'],['RoleDelete',[],'roleDeleted'],['RoleUpdate',[],'roleUpdated'],
    ['MemberRoleUpdate',[],'roleMembers'],['MemberUpdate',[{key:'nick'}],'nicknames'],
    ['MemberUpdate',[{key:'communication_disabled_until'}],'timeouts'],['MemberMove',[],'voiceMoved'],
    ['MemberBanAdd',[],'bans'],['WebhookCreate',[],'security'],['InviteDelete',[],'invites'],
    ['ThreadUpdate',[],'channels'],['warn',[],'warnings'],['verify',[],'verification'],['unjail',[],'verification'],
  ]) assert.equal(routeFor(action,changes),expected,action);
});
