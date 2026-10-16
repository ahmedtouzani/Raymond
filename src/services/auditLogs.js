const { EmbedBuilder, PermissionsBitField: { Flags }, ChannelType } = require('discord.js');
const { getGuildConfig } = require('../database/guildConfig');
const queue = require('../database/auditLogQueue');
const { allowsGuild } = require('../config/development');
const icons = require('../config/setupEmojis');
const logger = require('../utils/logger');
const { presentation, label } = require('./auditDetails');
let client, timer, running, lastPrune = 0;
async function settings(guildId) {
  return (await getGuildConfig(guildId)).settings?.auditLogs || {};
}
function destination(config, category, route) { return (route && Object.hasOwn(config.routes || {}, route) && config.routes[route]) || config[`${category}ChannelId`] || config.defaultChannelId || config.routes?.general || null; }
function logChannelIds(config) { return [...Object.values(config.routes || {}), ...['default','moderation','messages','members','server','voice'].map(name => config[`${name}ChannelId`])].filter(Boolean); }
function ignored(config, channel, category = 'messages') {
  return Boolean(channel && ([channel.id,channel.parentId].some(id => config.ignoredChannels?.includes(id)) || category === 'messages' && logChannelIds(config).includes(channel.id)));
}
async function publish(guild, category, key, payload, channel = null) {
  if (!guild?.id || !allowsGuild(guild.id)) return false;
  try {
    const config = await settings(guild.id);
    if (config.enabled !== true || !destination(config,category,payload.route) || ignored(config,channel,category)) return false;
    return Boolean(await queue.enqueue(guild.id,key,category,{ ...payload, ...(channel ? {sourceChannelId:channel.id,sourceParentId:channel.parentId} : {}), timestamp: payload.timestamp || new Date().toISOString() }));
  } catch (error) {
    logger.error('Failed to queue audit event:', { guildId:guild.id,category,code:error.code || error.name });
    return false;
  }
}
function buildEmbed(job) {
  const data = job.payload;
  const title = String(data.title || 'Server Activity').slice(0,256);
  const style = presentation(title, job.category);
  if (data.review) { style.color=0xE6A34A;style.status='Review'; }
  const timestamp = new Date(data.timestamp);
  const embed = new EmbedBuilder().setColor(style.color).setTitle(title)
    .setAuthor({ name: `RAYMOND · ${label(job.category || 'server').toUpperCase()}` })
    .setDescription(`${data.review ? icons.warning : icons.system} ${String(data.description || 'An activity was recorded.').slice(0,1500)}`)
    .setFooter({ text:`Audit Logs • ${style.status} • Event ${String(job.id).slice(0,30)}` }).setTimestamp(Number.isNaN(timestamp.getTime()) ? new Date() : timestamp);
  let budget=5400-embed.data.title.length-embed.data.description.length;
  const fields=[];
  for(const field of (data.fields || []).slice(0,12)) {
    if(budget<2)break;
    const name=String(field.name||'Details').slice(0,Math.min(256,budget-1));
    if(budget<name.length+1)break;
    const value=String(field.value || 'Unknown').slice(0,Math.min(1000,budget-name.length));
    fields.push({name,value,inline:Boolean(field.inline)});budget-=name.length+value.length;
  }
  if (fields.length) embed.addFields(fields);
  return embed;
}
async function deliveryChannel(guild,config,category,route) {
  const bot=guild.members.me || await guild.members.fetchMe();
  let error=Object.assign(new Error('No destination available'),{code:10003});
  for(const id of new Set([destination(config,category,route),config[`${category}ChannelId`],config.defaultChannelId,config.routes?.general].filter(Boolean))) {
    try {
      const channel=guild.channels.cache.get(id) || await guild.channels.fetch(id);
      if (![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel?.type))throw Object.assign(new Error('Invalid destination'),{code:10003});
      if (guild.roles.everyone && channel.permissionsFor(guild.roles.everyone)?.has(Flags.ViewChannel))throw Object.assign(new Error('Destination became public'),{code:50013});
      if(!channel.permissionsFor(bot)?.has([Flags.ViewChannel,Flags.SendMessages,Flags.EmbedLinks]))throw Object.assign(new Error('Missing destination permission'),{code:50013});
      return channel;
    } catch(failure) {error=failure;}
  }
  throw error;
}
async function processBatch() {
  if (running) return running;
  running = (async () => {
    for (let i=0;i<15;i++) {
      const job = await queue.claim(); if (!job) break;
      try {
        const guild = client.guilds.cache.get(job.guild_id);
        if (!guild || !allowsGuild(job.guild_id)) { await queue.finish(job,'discarded'); continue; }
        const config = await settings(job.guild_id), target = destination(config,job.category,job.payload.route);
        if (config.enabled !== true || !target) { await queue.finish(job,'discarded'); continue; }
        if (job.payload.voiceStateChange && config.captureVoiceStates !== true) { await queue.finish(job,'discarded'); continue; }
        if (job.payload.sourceChannelId && ignored(config,{id:job.payload.sourceChannelId,parentId:job.payload.sourceParentId},job.category)) { await queue.finish(job,'discarded');continue; }
        const channel = await deliveryChannel(guild,config,job.category,job.payload.route);
        const deliveredJob = job.payload.hasMessageContent && config.captureMessageContent !== true ? { ...job,payload:{...job.payload,fields:(job.payload.fields || []).map(field=>['Before','After','Content','Attachments','Attachments Before','Attachments After'].includes(field.name)?{...field,value:'Content capture is disabled.'}:field)} } : job;
        const message = await channel.send({ embeds:[buildEmbed(deliveredJob)],allowedMentions:{parse:[],repliedUser:false},nonce:String(job.id),enforceNonce:true });
        await queue.finish(job,'delivered',message.id);
      } catch (error) { await queue.fail(job,error); logger.warn('Audit delivery failed',{guildId:job.guild_id,code:error.code || error.name}); }
    }
    if (Date.now()-lastPrune>3600000) { await queue.prune();lastPrune=Date.now(); }
  })().catch(error => logger.error('Audit worker failed:',{code:error.code || error.name})).finally(()=>{running=null;});
  return running;
}
function start(bot) { client=bot;if(timer)return;timer=setInterval(processBatch,2000);timer.unref?.(); }
async function stop() { if(timer)clearInterval(timer);timer=null;if(running)await running; }
module.exports = { publish, settings, destination, ignored, buildEmbed, start, stop, processBatch };
