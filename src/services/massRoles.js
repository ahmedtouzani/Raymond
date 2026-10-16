const {PermissionsBitField:{Flags},EmbedBuilder}=require('discord.js');
const {isBotOwner}=require('../handlers/commandAuthorization');
const {allowsGuild}=require('../config/development');
const store=require('../database/massRoles');
const logger=require('../utils/logger');
const icons=require('../config/setupEmojis');
const error=message=>Object.assign(new Error(message),{code:'ROLE_ACCESS'});

async function validate(guild,issuerId,sourceId,targetId) {
  if(!allowsGuild(guild.id)||!isBotOwner(issuerId))throw error('This operation is restricted to the bot owner in an allowed server.');
  await Promise.all([guild.roles.fetch(),guild.members.fetchMe()]);
  const issuer=await guild.members.fetch({user:issuerId,force:true}),bot=guild.members.me;
  if(!issuer.permissions.has(Flags.ManageRoles))throw error('You need Manage Roles in this server.');
  if(!bot?.permissions.has(Flags.ManageRoles))throw error('The bot needs Manage Roles.');
  const source=guild.roles.cache.get(sourceId),target=guild.roles.cache.get(targetId);
  if(!source||!target)throw error('Choose two existing roles from this server.');
  if(sourceId===targetId)throw error('The current and replacement roles must be different.');
  for(const role of [source,target]) {
    if(role.id===guild.id||role.managed)throw error('@everyone and managed/integration roles cannot be swapped.');
    if(bot.roles.highest.comparePositionTo(role)<=0)throw error('Move the bot role above both selected roles.');
    if(issuer.id!==guild.ownerId&&issuer.roles.highest.comparePositionTo(role)<=0)throw error('Both roles must be below your highest role.');
  }
  return{source,target};
}
async function preview(guild,issuerId,sourceId,targetId,includeBots=false) {
  const roles=await validate(guild,issuerId,sourceId,targetId);
  const members=await guild.members.fetch();
  const selected=[];let skippedBots=0,alreadyTarget=0;
  for(const member of members.values()) {
    if(!member.roles.cache.has(sourceId))continue;
    if(member.id===guild.members.me.id || member.user.bot&&!includeBots){skippedBots++;continue;}
    selected.push(member.id);if(member.roles.cache.has(targetId))alreadyTarget++;
  }
  const sensitive=[Flags.Administrator,Flags.ManageGuild,Flags.ManageRoles,Flags.BanMembers,Flags.KickMembers]
    .some(flag=>roles.target.permissions.has(flag,false));
  return{...roles,memberIds:selected,skippedBots,alreadyTarget,sensitive,includeBots};
}
function progress(job) {
  return{embeds:[new EmbedBuilder().setColor(job.state==='paused'?0xE6A34A:0xDFBD7C).setTitle(`Massrole · Job #${job.id}`)
    .setDescription(`${icons.utility} **${String(job.state).toUpperCase()}**\n\nRemove <@&${job.source_role_id}> → Give <@&${job.target_role_id}>\nThe new role is granted before the old role is removed.`)
    .addFields({name:'Members',value:String(job.total||0),inline:true},{name:'Completed',value:String(job.done||0),inline:true},
      {name:'Skipped',value:String(job.skipped||0),inline:true},{name:'Failed',value:String(job.failed||0),inline:true},
      {name:'Remaining',value:String(job.remaining||0),inline:true},
      {name:'Controls',value:'`massrole status` · `massrole cancel` · `massrole retry`'},
      ...(job.errors?.length?[{name:'Failed Members · First 5',value:job.errors.map(item=>`<@${item.user_id}> · ${item.last_error || 'Role update failed'}`).join('\n').slice(0,1000)}]:[]),
      ...(job.last_error?[{name:'Needs Attention',value:String(job.last_error).slice(0,800)}]:[]))
    .setFooter({text:'Raymond · Role Swap · Current server only'}).setTimestamp()],components:[],allowedMentions:{parse:[],repliedUser:false}};
}
function createWorker(options={}) {
  const data=options.store||store,check=options.validate||validate,now=options.now||Date.now;
  const pace=options.pace||(()=>new Promise(resolve=>setTimeout(resolve,150)));
  const reports=new Map();let client,timer,cycle,stopped=false,lastPrune=0;
  async function report(guild,job,force=false) {
    const key=String(job.id);
    if(!force&&now()-(reports.get(key)||0)<10000)return;
    reports.delete(key);reports.set(key,now());while(reports.size>2048)reports.delete(reports.keys().next().value);
    try {
      const status=await data.get(guild.id,job.id);
      const channel=guild.channels.cache.get(job.channel_id)||await guild.channels.fetch(job.channel_id);
      const message=await channel.messages.fetch(job.message_id);
      await message.edit(progress(status));
    }catch(failure){logger.warn('Massrole progress unavailable',{guildId:guild.id,jobId:job.id,code:failure.code||failure.name});}
  }
  async function member(job,guild,item) {
    let target;
    try {target=await guild.members.fetch({user:item.user_id,force:true});}
    catch(failure){if(Number(failure.code)===10007){await data.item(job,item.user_id,{state:'skipped',last_error:'Member left server'});return;}throw failure;}
    if(target.id===guild.members.me.id || target.user.bot&&!job.include_bots){await data.item(job,item.user_id,{state:'skipped',last_error:'Bot excluded'});return;}
    if(!target.roles.cache.has(job.source_role_id)) {
      await data.item(job,item.user_id,{state:item.started&&target.roles.cache.has(job.target_role_id)?'done':'skipped',last_error:null});return;
    }
    await data.item(job,item.user_id,{started:true});
    const reason=`Raymond Massrole #${job.id} requested by ${job.issuer_id}`;
    if(!target.roles.cache.has(job.target_role_id)) {
      await data.renew(job);
      await target.roles.add(job.target_role_id,reason);
      await data.item(job,item.user_id,{target_added:true});
    }
    // Fresh confirmation protects against failed/ambiguous adds and concurrent role edits.
    target=await guild.members.fetch({user:item.user_id,force:true});
    if(!target.roles.cache.has(job.target_role_id))throw Object.assign(new Error('Replacement role was not confirmed'),{code:'TARGET_NOT_CONFIRMED'});
    if(target.roles.cache.has(job.source_role_id)) {
      await data.renew(job);
      await target.roles.remove(job.source_role_id,reason);
    }
    await data.item(job,item.user_id,{state:'done',last_error:null});
  }
  async function batch(job) {
    const guild=client.guilds.cache.get(job.guild_id);
    if(!guild||!allowsGuild(job.guild_id)){await data.release(job,'paused','Server unavailable or not allowed');return;}
    try {
      if(await data.renew(job)==='cancelling'){await data.release(job,'cancelled');await report(guild,job,true);return;}
      await check(guild,job.issuer_id,job.source_role_id,job.target_role_id);
      for(const item of await data.items(job)) {
        if(stopped)break;
        if(await data.renew(job)==='cancelling')break;
        try {await member(job,guild,item);}
        catch(failure) {
          if(failure.code==='LEASE_LOST')throw failure;
          await data.item(job,item.user_id,{state:'failed',last_error:`Role update failed (${String(failure.code||failure.name).slice(0,60)})`});
          if([50001,50013,10011].includes(Number(failure.code)))throw error('Role access changed. Fix permissions/hierarchy, then use massrole retry.');
        }
        await report(guild,job);await pace();
      }
      const status=await data.get(guild.id,job.id);
      await data.release(job,status.remaining?'pending':'completed');
      await report(guild,job,true);
    }catch(failure) {
      if(failure.code!=='LEASE_LOST'){await data.release(job,'paused',failure.code==='ROLE_ACCESS'?failure.message:'Operation paused after an unexpected failure. Use massrole retry.');await report(guild,job,true);}
      logger.warn('Massrole batch stopped',{guildId:job.guild_id,jobId:job.id,code:failure.code||failure.name});
    }
  }
  function tick() {
    if(stopped||cycle||!client)return cycle||Promise.resolve();
    cycle=(async()=>{
      for(let i=0;i<3&&!stopped;i++){const job=await data.claim();if(!job)break;await batch(job);}
      if(now()-lastPrune>3600000){await data.prune();lastPrune=now();}
    })().catch(failure=>logger.warn('Massrole worker failed',{code:failure.code||failure.name})).finally(()=>{cycle=null;});return cycle;
  }
  function start(bot){client=bot;stopped=false;if(timer)return;timer=setInterval(tick,2000);timer.unref?.();return tick();}
  async function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;if(cycle)await cycle;}
  return{start,stop,tick};
}
module.exports={validate,preview,progress,createWorker,...createWorker()};
