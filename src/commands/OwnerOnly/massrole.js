const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionsBitField:{Flags}}=require('discord.js');
const {isBotOwner}=require('../../handlers/commandAuthorization');
const {asEmbed}=require('../../utils/responses');
const service=require('../../services/massRoles');
const store=require('../../database/massRoles');
const icons=require('../../config/setupEmojis');
const logger=require('../../utils/logger');
const previews=new Set();
const roleId=value=>String(value||'').match(/^(?:<@&(\d{16,22})>|(\d{16,22}))$/)?.slice(1).find(Boolean);
const embed=(title,description,fields=[])=>({embeds:[new EmbedBuilder().setColor(0xDFBD7C).setTitle(title).setDescription(description)
  .addFields(fields).setFooter({text:'Raymond · Massrole'}).setTimestamp()],allowedMentions:{parse:[],repliedUser:false}});

module.exports={
  name:'massrole',aliases:['roleswap','mr'],description:'Replace one role with another for its current holders after a preview.',
  usage:'massrole @current @replacement [--include-bots] | massrole status|cancel|retry',
  category:'Owner',ownerOnly:true,hidden:true,guildOnly:true,prefixless:true,cooldown:0,
  permissions:[Flags.ManageRoles],
  async execute(message,args=[]) {
    if(!isBotOwner(message.author.id))return message.reply(asEmbed('Only the bot owner can use this command.'));
    const action=args[0]?.toLowerCase();
    if(!['status','cancel'].includes(action)&&!message.member.permissions.has(Flags.ManageRoles))return message.reply(asEmbed('You need Manage Roles in this server.'));
    if(['status','cancel','retry'].includes(action)) {
      if(args[1]&&(!/^[1-9]\d{0,18}$/.test(args[1])||BigInt(args[1])>9223372036854775807n))return message.reply(asEmbed('Use a valid numeric job ID, or omit it for the latest job in this server.'));
      const job=await store.get(message.guild.id,args[1]);
      if(!job)return message.reply(asEmbed('No massrole job was found in this server.'));
      try {
        if(action==='cancel') {
          if(!await store.cancel(message.guild.id,job.id))return message.reply(asEmbed('This job has already finished. Completed role changes are kept.'));
        } else if(action==='retry') {
          await service.validate(message.guild,message.author.id,job.source_role_id,job.target_role_id);
          if(!await store.retry(message.guild.id,job.id,message.author.id))return message.reply(asEmbed('There are no pending or failed members to retry. Running/cancelled jobs cannot be retried.'));
        }
        return message.reply(service.progress(await store.get(message.guild.id,job.id)));
      }catch(failure){return message.reply(asEmbed(String(failure.code)==='23505'?'Another role swap is active in this server.':failure.code==='ROLE_ACCESS'?failure.message:'Could not update this job. Check massrole status before retrying.'));}
    }
    const sourceId=roleId(args[0]),targetId=roleId(args[1]);
    if(!sourceId||!targetId||args.slice(2).some(arg=>arg!=='--include-bots'))return message.reply(embed('Massrole · Role Swap',
      `${icons.utility} Use \`massrole @current @replacement\`.\nExample: \`massrole @verified @unverified\`\n\nOnly current holders of the first role are selected. Bots are skipped unless you add \`--include-bots\`; this bot is always excluded.`));
    if(previews.has(message.guild.id))return message.reply(asEmbed('A role-swap preview is already open in this server. Confirm, cancel or let it expire first.'));
    if(await store.active(message.guild.id))return message.reply(asEmbed('A role swap is already active or paused. Use massrole status, retry or cancel.'));
    previews.add(message.guild.id);
    let panel,collector,phase='preview',created;
    try {
      panel=await message.reply(embed('Massrole · Scanning',`${icons.utility} Fetching members and checking the selected roles. No roles are changed during this scan.`));
      const plan=await service.preview(message.guild,message.author.id,sourceId,targetId,args.includes('--include-bots'));
      if(!plan.memberIds.length){previews.delete(message.guild.id);await panel.edit({...embed('Massrole · No Members','No eligible members currently hold the source role.'),components:[]});return;}
      const description=`${icons.warning} **${plan.memberIds.length} members selected in this server.**\n\nRemove <@&${sourceId}> → Give <@&${targetId}>\n\nThe new role is added and confirmed before the old role is removed. Other roles stay intact.\n${plan.sensitive?'\n**The replacement role grants sensitive moderation permissions.**\n':''}\nThis preview freezes the member list. New holders added later are excluded. Cancellation stops after the current member; completed changes are kept.`;
      const controls=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('massrole:confirm').setLabel('Confirm Role Swap').setStyle(ButtonStyle.Danger).setEmoji(icons.edit),
        new ButtonBuilder().setCustomId('massrole:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji(icons.cross));
      await panel.edit({...embed('Massrole · Confirm Replacement',description,[{name:'Already Have Replacement',value:String(plan.alreadyTarget),inline:true},
        {name:'Excluded Bots',value:String(plan.skippedBots),inline:true},{name:'Scope',value:message.guild.name||message.guild.id,inline:true}]),components:[controls]});
      collector=panel.createMessageComponentCollector({time:120000,filter:interaction=>interaction.customId.startsWith('massrole:')});
      collector.on('collect',interaction=>{
        if(interaction.user.id!==message.author.id){interaction.reply(asEmbed({content:'Only the owner who opened this preview can confirm it.',flags:64})).catch(()=>{});return;}
        if(phase!=='preview'){interaction.deferUpdate().catch(()=>{});return;}
        phase=interaction.customId==='massrole:confirm'?'confirming':'cancelled';
        (async()=>{
          await interaction.deferUpdate();collector.stop(phase);
          if(phase==='cancelled'){await panel.edit({...embed('Massrole · Cancelled','No roles were changed.'),components:[]});return;}
          await service.validate(message.guild,message.author.id,sourceId,targetId);
          created=await store.create({guildId:message.guild.id,issuerId:message.author.id,sourceId,targetId,includeBots:plan.includeBots,
            channelId:message.channel.id,messageId:panel.id,memberIds:plan.memberIds});
          phase='started';
          await panel.edit(service.progress(await store.get(message.guild.id,created.id)));
        })().catch(async failure=>{
          logger.warn('Massrole confirmation failed',{guildId:message.guild.id,code:failure.code||failure.name});
          const detail=created?`Job #${created.id} was created. Use massrole status to follow its progress.`
            :failure.code==='ROLE_ACCESS'?failure.message:String(failure.code)==='23505'?'Another role swap is active in this server.':'Could not start the role swap. Check permissions and try again.';
          await panel.edit({...embed('Massrole · Status',detail),components:[]}).catch(()=>{});
        });
      });
      collector.on('end',()=>{
        previews.delete(message.guild.id);
        if(phase==='preview')panel.edit({...embed('Massrole · Preview Expired','No roles were changed. Run massrole again for a fresh preview.'),components:[]}).catch(()=>{});
      });
    }catch(failure) {
      previews.delete(message.guild.id);
      const detail=failure.code==='ROLE_ACCESS'?failure.message:'Could not fetch members or prepare the preview. Check the Guild Members intent and permissions.';
      if(panel)await panel.edit({...embed('Massrole · Could Not Prepare',detail),components:[]}).catch(()=>{});
      else await message.reply(asEmbed(detail));
    }
  },
};
