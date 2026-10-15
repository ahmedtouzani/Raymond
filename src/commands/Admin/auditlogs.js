const { asEmbed } = require('../../utils/responses');
const { PermissionsBitField: { Flags } } = require('discord.js');
const { isBotOwner } = require('../../handlers/commandAuthorization');
const logs = require('../../services/auditLogs');
const queue = require('../../database/auditLogQueue');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const icons = require('../../config/setupEmojis');
module.exports = {
  name:'auditlogs',aliases:['logs'],prefixless:true,guildOnly:true,category:'Admin',cooldown:5,
  description:'Inspect audit delivery, test staff logs channels or retry failed deliveries.',usage:'logs [status|test|retry]',
  async execute(message,args=[]) {
    if (!isBotOwner(message.author.id) && !message.member.permissions.has(Flags.Administrator) && !message.member.permissions.has(Flags.ManageGuild)) return message.reply(asEmbed('You need Administrator or Manage Server to inspect audit logs.'));
    const config=await logs.settings(message.guild.id);
    if(args[0]?.toLowerCase()==='retry') {
      if(!config.enabled)return message.reply(asEmbed('Enable Audit Logs in setup before retrying deliveries.'));
      const count=await queue.retry(message.guild.id);
      return sendEmbed(message,{title:'Retry Audit Logs',description:`${icons.utility} Requeued **${count}** failed events (up to 100 per request). Use logs status to follow delivery.`});
    }
    if(args[0]?.toLowerCase()==='test') {
      const category=['moderation','messages','members','server','voice'].find(name=>logs.destination(config,name));
      const accepted=config.enabled&&category&&await logs.publish(message.guild,category,`test:${message.id}`,{title:'Audit Logs Test',description:`Requested by <@${message.author.id}>. This confirms the audit pipeline is configured.`,fields:[{name:'Test',value:'If you can see this message, delivery to this staff channel succeeded.'}]});
      return sendEmbed(message,{title:'Audit Logs Test',description:accepted?`${icons.success} Test queued. Check the configured logs channel. Use logs status to inspect delivery.`:`${icons.warning} Enable Audit Logs and select a staff channel in setup first.`});
    }
    const states=await queue.status(message.guild.id);
    return sendEmbed(message,{title:'Audit Logs',description:`${icons.system} Configure **Audit Logs** in setup. Use logs test after saving.`,fields:[
      {name:'Status',value:config.enabled?'Enabled':'Disabled',inline:true},{name:'General Channel',value:config.defaultChannelId?`<#${config.defaultChannelId}>`:'Not set',inline:true},
      {name:'Message Text',value:config.captureMessageContent?'Included when available':'Not captured',inline:true},
      {name:'Delivery Queue',value:states.length?states.map(row=>`${row.status}: **${row.count}**`).join('\n'):'No events recorded yet.'},
      {name:'Coverage',value:'Discord audit actions (roles, channels, bans, kicks, permissions and more), message edits/deletions, joins/leaves and voice connections. Discord may not expose the actor or old message content.'},
    ]},{allowedMentions:{parse:[]}});
  },
};
