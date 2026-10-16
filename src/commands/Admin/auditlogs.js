const { asEmbed } = require('../../utils/responses');
const { PermissionsBitField: { Flags } } = require('discord.js');
const { isBotOwner } = require('../../handlers/commandAuthorization');
const logs = require('../../services/auditLogs');
const queue = require('../../database/auditLogQueue');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const icons = require('../../config/setupEmojis');
const { routes: detailedRoutes } = require('../../services/auditRoutes');
const categories = ['moderation','messages','members','server','voice'];
const timestamp = value => value ? `<t:${Math.floor(new Date(value).getTime()/1000)}:R>` : 'None yet';
module.exports = {
  name:'auditlogs',aliases:['logs'],prefixless:true,guildOnly:true,category:'Admin',cooldown:5,
  description:'Inspect audit health, test each staff logs destination or retry failed deliveries.',usage:'logs [status|test [all|category|route]|retry]',
  async execute(message,args=[]) {
    if (!isBotOwner(message.author.id) && !message.member.permissions.has(Flags.Administrator) && !message.member.permissions.has(Flags.ManageGuild)) return message.reply(asEmbed('You need Administrator or Manage Server to inspect audit logs.'));
    const config=await logs.settings(message.guild.id);
    if(args[0]?.toLowerCase()==='retry') {
      if(!config.enabled)return message.reply(asEmbed('Enable Audit Logs in setup before retrying deliveries.'));
      const count=await queue.retry(message.guild.id);
      return sendEmbed(message,{title:'Retry Audit Logs',description:`${icons.utility} Requeued **${count}** failed events (up to 100 per request). Use logs status to follow delivery.`});
    }
    if(args[0]?.toLowerCase()==='test') {
      const selected=args[1]?.toLowerCase() || 'all';
      const detail=detailedRoutes.find(route=>route.key.toLowerCase()===selected);
      if(selected!=='all'&&!categories.includes(selected)&&!detail)return message.reply(asEmbed('Use logs test all, a category, or a detailed route such as roleCreated or voiceJoined.'));
      const routes=new Map();
      const entries=selected==='all'?[...detailedRoutes.filter(route=>config.routes?.[route.key]),...categories.map(category=>({key:null,label:category,category}))]
        :detail?[detail]:[{key:null,label:selected,category:selected}];
      for(const entry of entries) {
        const id=logs.destination(config,entry.category,entry.key);
        if(id) { const route=routes.get(id)||[];route.push(entry);routes.set(id,route); }
      }
      let accepted=0;
      if(config.enabled)for(const [id,names] of routes) {
        if(await logs.publish(message.guild,names[0].category,`test:${message.id}:${id}`,{title:'Audit Logs Test',route:names[0].key,description:`Requested by <@${message.author.id}>.`,fields:[
          {name:'Routes Tested',value:names.map(entry=>entry.label).join(' · ').slice(0,1000)},{name:'Configured Destination',value:`<#${id}>`},
          {name:'Test',value:'Delivery to this staff channel succeeded. A broken category channel may use the general channel as fallback.'}]}))accepted++;
      }
      return sendEmbed(message,{title:'Audit Logs Test',description:accepted?`${icons.success} Queued **${accepted}** destination test(s). Check the logs channels, then use logs status to inspect delivery.`:`${icons.warning} Enable Audit Logs and select a staff channel in setup first.`});
    }
    const [states,health]=await Promise.all([queue.status(message.guild.id),queue.health(message.guild.id)]);
    const canAudit=message.guild.members.me?.permissions.has(Flags.ViewAuditLog);
    const alerts=[];
    if(config.enabled&&!canAudit)alerts.push('Missing View Audit Log: confirmed actors and server audit actions are unavailable.');
    if(health.failed)alerts.push(`${health.failed} failed event(s). Check channel permissions, then use logs retry.`);
    if(health.oldest_waiting && Date.now()-new Date(health.oldest_waiting).getTime()>300000)alerts.push('Delivery backlog is older than 5 minutes.');
    return sendEmbed(message,{title:'Audit Logs · Health & Routing',description:`${icons.system} Configure **Audit Logs** in setup. Use logs test all to check every destination.`,fields:[
      {name:'Status',value:config.enabled?'Enabled':'Disabled',inline:true},{name:'General Channel',value:config.defaultChannelId?`<#${config.defaultChannelId}>`:'Not set',inline:true},
      {name:'Message Text',value:config.captureMessageContent?'Included when available':'Not captured',inline:true},
      {name:'Category Routing',value:categories.map(name=>`**${name[0].toUpperCase()+name.slice(1)}** → ${logs.destination(config,name)?`<#${logs.destination(config,name)}>${config[`${name}ChannelId`]?'':' · General'}`:'Not configured'}`).join('\n')},
      {name:'Detailed Routes',value:detailedRoutes.filter(route=>config.routes?.[route.key]).length?detailedRoutes.filter(route=>config.routes?.[route.key]).map(route=>`${route.label} → <#${config.routes[route.key]}>`).join('\n').slice(0,1024):'Using category fallbacks. Create detailed channels or map routes in setup.'},
      {name:'Voice State Changes',value:config.captureVoiceStates?'Mute / deafen / stream / camera changes included':'Connection changes only',inline:true},
      {name:'Ignored Channels / Categories',value:config.ignoredChannels?.length?config.ignoredChannels.slice(0,15).map(id=>`<#${id}>`).join(' '):'None'},
      {name:'Delivery Queue',value:states.length?states.map(row=>`${row.status}: **${row.count}**`).join('\n'):'No events recorded yet.'},
      {name:'Last Delivery',value:timestamp(health.last_delivered),inline:true},{name:'Oldest Waiting Event',value:timestamp(health.oldest_waiting),inline:true},
      {name:'Health',value:alerts.length?`${icons.warning} ${alerts.join('\n')}`:config.enabled?'No delivery warnings detected. Run logs test all to verify channel access.':'Logging is disabled.'},
      {name:'Coverage',value:'Discord audit actions (roles, channels, bans, kicks, permissions and more), message edits/deletions, joins/leaves and voice connections. Discord may not expose the actor or old message content.'},
    ]},{allowedMentions:{parse:[]}});
  },
};
