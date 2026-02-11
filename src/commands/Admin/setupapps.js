const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType } = require('discord.js');
const { setGuildConfig, getGuildConfig } = require('../../database/guildConfig');
const { createEmbed } = require('../../utils/embed');

module.exports = {
  name: 'setupapps',
  description: 'Configure and manage the Smart Staff Application System',
  usage: '!setupapps [action] [args]',
  examples: '!setupapps\n!setupapps panel',
  
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need Administrator permissions to use this command.');
    }

    // Interactive Wizard Mode
    if (!args || args.length === 0) {
       await startSetupWizard(message);
       return;
    }

    const action = args[0].toLowerCase();

    try {
      if (action === 'panel') {
        // Updated Panel with 3 Category Buttons
        const embed = await createEmbed(message.guild.id, {
          title: '<:teamsupport:1471054884760588396> Join Our Team',
          description: 'We are looking for passionate individuals to help us grow! Select a role below to view requirements and apply.',
          color: 0x5865F2,
          thumbnail: message.guild.iconURL({ dynamic: true }),
          fields: [
             { name: '<:mod:1471053987494232127> Moderation Staff', value: 'Help keep the community safe and friendly.', inline: true },
             { name: '<:des:1471053909257621648> Graphic Designer', value: 'Create stunning visuals for our brand.', inline: true },
             { name: '<:fev:1471053837476302941> Software Developer', value: 'Build and maintain our bots and websites.', inline: true }
          ],
          image: 'https://cdn.discordapp.com/attachments/1378500623967981600/1378530914182627481/pu.jpg?ex=683cf075&is=683b9ef5&hm=ddde0abba25b5431ff9d65670ee0317457bc66db8713313e58fe3dfe25d12336&'
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('view_app_moderator')
            .setLabel('Moderator')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🛡️'),
          new ButtonBuilder()
            .setCustomId('view_app_designer')
            .setLabel('Designer')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎨'),
          new ButtonBuilder()
            .setCustomId('view_app_developer')
            .setLabel('Developer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💻')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        if (message.deletable) message.delete().catch(() => {});

      } else if (action === 'channel') {
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        if (!channel) return message.reply('❌ Please mention a valid channel.');
        await updateConfig(message.guild.id, 'staff_review_channel', channel.id);
        message.reply(`✅ Review channel set to ${channel}.`);

      } else if (action === 'role') {
        if (args.length < 3) return message.reply('Usage: `!setupapps role <moderator|designer|developer> @Role`');
        const type = args[1].toLowerCase();
        if (!['moderator', 'designer', 'developer'].includes(type)) return message.reply('❌ Invalid role type.');
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]);
        if (!role) return message.reply('❌ Please mention a valid role.');
        await updateConfig(message.guild.id, `role_${type}`, role.id);
        message.reply(`✅ **${type}** role mapped to **${role.name}**.`);

      } else {
        message.reply('❌ Unknown action. Usage: `!setupapps [panel]` or just `!setupapps` for wizard.');
      }
    } catch (error) {
      console.error('Error in setupapps command:', error);
      message.reply('❌ An error occurred.');
    }
  }
};

async function updateConfig(guildId, key, value) {
    const config = await getGuildConfig(guildId);
    const newSettings = { ...config.settings, [key]: value };
    await setGuildConfig(guildId, { settings: newSettings });
}

async function startSetupWizard(message) {
    const questions = [
        { 
            key: 'staff_review_channel', 
            title: '<:teamsupport:1471054884760588396> Staff Review Channel',
            description: 'Please mention the **channel** where completed applications should be sent for review.\n\n*Example: #staff-apps*', 
            type: 'channel' 
        },
        { 
            key: 'role_moderator', 
            title: '<:mod:1471053987494232127> Moderator Role',
            description: 'Please mention the **Role** that should be granted to accepted **Moderators**.\n\n*Example: @Moderator*', 
            type: 'role' 
        },
        { 
            key: 'role_designer', 
            title: '<:des:1471053909257621648> Graphic Designer Role',
            description: 'Please mention the **Role** that should be granted to accepted **Designers**.\n\n*Example: @Designer*', 
            type: 'role' 
        },
        { 
            key: 'role_developer', 
            title: '<:fev:1471053837476302941> Developer Role',
            description: 'Please mention the **Role** that should be granted to accepted **Developers**.\n\n*Example: @Developer*', 
            type: 'role' 
        }
    ];

    const responses = {};
    const wizardEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🧙‍♂️ Staff App Setup Wizard')
        .setDescription('Welcome! I will guide you through setting up the application system.\n\nType `cancel` at any time to exit.')
        .setFooter({ text: 'Step 0/4' });

    let msg = await message.reply({ embeds: [wizardEmbed] });

    for (const q of questions) {
        const stepIndex = questions.indexOf(q) + 1;
        
        wizardEmbed
            .setTitle(`Step ${stepIndex}/${questions.length}: ${q.title}`)
            .setDescription(q.description)
            .setFooter({ text: `Type 'cancel' to exit • Step ${stepIndex}/${questions.length}` });
        
        await msg.edit({ content: '', embeds: [wizardEmbed] });
        
        try {
            const collected = await message.channel.awaitMessages({
                filter: m => m.author.id === message.author.id,
                max: 1,
                time: 60000,
                errors: ['time']
            });
            
            const reply = collected.first();
            if (reply.content.toLowerCase() === 'cancel') {
                wizardEmbed.setTitle('❌ Setup Cancelled').setDescription('Operation aborted by user.').setColor(0xED4245);
                return msg.edit({ embeds: [wizardEmbed] });
            }
            
            // Validate input
            let value;
            if (q.type === 'channel') {
                const channel = reply.mentions.channels.first() || message.guild.channels.cache.get(reply.content);
                if (!channel || !channel.isTextBased()) {
                    const errorEmbed = new EmbedBuilder().setColor(0xED4245).setDescription('❌ **Invalid Channel.** Please mention a valid text channel.');
                    const errorMsg = await message.channel.send({ embeds: [errorEmbed] });
                    setTimeout(() => errorMsg.delete().catch(() => {}), 3000);
                    
                    // Repeat this step? 
                    // Complex to repeat in for-loop structure without recursion or while loop. 
                    // For simplicity in this quick fix, we'll abort or just ask again? 
                    // Let's just abort for now to keep code simple as requested, or maybe basic retry logic?
                    // "make functions perfect" -> basic retry is better.
                    // But rewriting to while loop is a bigger change.
                    // User asked for "better messages". I will stick to "better messages" but if they fail, I'll cancel to avoid infinite loops in this structure.
                    // OR I can use a quick recursive call or just fail.
                    // Improving message:
                    wizardEmbed.setColor(0xED4245).setDescription(`❌ **Invalid Channel.**\n${q.description}`);
                    await msg.edit({ embeds: [wizardEmbed] });
                    
                    // Retry once?
                    const retry = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id, max: 1, time: 30000 }).catch(() => null);
                    if (!retry) return msg.edit({ content: '❌ Timeout.' });
                    const retryChannel = retry.first().mentions.channels.first();
                    if (!retryChannel) return msg.edit({ content: '❌ Invalid channel again. Setup cancelled.' });
                    value = retryChannel.id;
                    if (retry.first().deletable) retry.first().delete().catch(() => {});
                } else {
                    value = channel.id;
                }
            } else if (q.type === 'role') {
                const role = reply.mentions.roles.first() || message.guild.roles.cache.get(reply.content);
                if (!role) {
                    wizardEmbed.setColor(0xED4245).setDescription(`❌ **Invalid Role.**\n${q.description}`);
                    await msg.edit({ embeds: [wizardEmbed] });
                     
                    const retry = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id, max: 1, time: 30000 }).catch(() => null);
                     if (!retry) return msg.edit({ content: '❌ Timeout.' });
                     const retryRole = retry.first().mentions.roles.first();
                     if (!retryRole) return msg.edit({ content: '❌ Invalid role again. Setup cancelled.' });
                     value = retryRole.id;
                     if (retry.first().deletable) retry.first().delete().catch(() => {});
                } else {
                    value = role.id;
                }
            }
            
            responses[q.key] = value;
            if (reply.deletable) reply.delete().catch(() => {});
            
            // Reset color for next step
            wizardEmbed.setColor(0x5865F2);

        } catch (e) {
            return msg.edit({ content: '❌ **Setup Timed Out.**' });
        }
    }

    // Save all settings
    const config = await getGuildConfig(message.guild.id);
    const newSettings = { ...config.settings, ...responses };
    await setGuildConfig(message.guild.id, { settings: newSettings });

    wizardEmbed
        .setTitle('✅ Configuration Saved!')
        .setDescription('**Excellent!** All settings have been updated.\n\nWould you like to post the **Application Panel** to this channel now?\n\nType `yes` to post it, or `no` to finish.')
        .setFooter({ text: 'Setup Complete' })
        .setColor(0x57F287);

    await msg.edit({ embeds: [wizardEmbed] });
    
    try {
        const collected = await message.channel.awaitMessages({
             filter: m => m.author.id === message.author.id,
             max: 1,
             time: 30000
        });
        
        if (collected.first().content.toLowerCase().startsWith('y')) {
            await module.exports.execute(collected.first(), ['panel'], message.client);
            // Maybe delete the wizard success message to clean up? Or leave it?
            // Leave it.
        } else {
            await message.channel.send('Okay! You can post it later using `!setupapps panel`.');
        }
    } catch (e) {
        await message.channel.send('Okay! You can post it later using `!setupapps panel`.');
    }
}
