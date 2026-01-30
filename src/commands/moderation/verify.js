const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { getGuildConfig, setGuildConfig } = require('../../database/guildConfig');

module.exports = {
  name: 'verify',
  description: 'Verification system: set roles and verify users as boy/girl. Usage: !verify set <type> @role | !verify girl @user | !verify boy @user',
  usage: '!verify set <unverified|verified|boy|girl|verificator> @role | !verify girl @user | !verify boy @user',
  permissions: [PermissionsBitField.Flags.ManageRoles],
  category: 'Moderation',

  async execute(message, args) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return sendEmbed(message, {
        title: '🚫 Permission Denied',
        description: 'You need the **Manage Roles** permission to use this command.',
        color: 0x23272A,
      });
    }
    const sub = args[0]?.toLowerCase();
    const config = await getGuildConfig(message.guild.id) || { settings: {} };
    config.settings.verification = config.settings.verification || {};

    // Interactive Setup Wizard: !verify setup
    if (sub === 'setup') {
      const prompts = [
        { key: 'unverifiedRoleId', label: 'Unverified' },
        { key: 'verifiedRoleId', label: 'Verified' },
        { key: 'boyRoleId', label: 'Boy' },
        { key: 'girlRoleId', label: 'Girl' },
        { key: 'verificatorRoleId', label: 'Verificator' },
        { key: 'logChannelId', label: 'Log Channel' }
      ];
      const collected = {};
      const setupChannel = message.channel;
      const promptSend = async (content) => sendEmbed(message, { title: 'Verification Setup', description: content, color: 0x3399ff });
      for (const prompt of prompts) {
        await promptSend(`Please mention the **${prompt.label}** ${prompt.key.includes('Id') ? (prompt.key.includes('Role') ? 'role' : 'channel') : 'item'} or provide its ID:`);
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 3) {
          let responses;
          try {
            responses = await setupChannel.awaitMessages({ max: 1, time: 60000, errors: ['time'], filter: m => m.author.id === message.author.id });
          } catch {
            responses = null;
          }
          const response = responses?.first();
          if (!response) {
            await promptSend('⏰ Timed out. Setup cancelled.');
            return;
          }
          if (response.content.toLowerCase() === 'cancel') {
            await promptSend('❌ Setup cancelled. No changes were made.');
            return;
          }
          let item;
          if (prompt.key.includes('Role')) {
            item = response.mentions.roles.first() || message.guild.roles.cache.get(response.content.trim());
          } else if (prompt.key.includes('Channel')) {
            item = response.mentions.channels.first() || message.guild.channels.cache.get(response.content.trim());
          }
          
          if (item) {
            collected[prompt.key] = item.id;
            valid = true;
          } else {
            attempts++;
            await promptSend(`❓ Invalid ${prompt.key.includes('Role') ? 'role' : 'channel'}. Please mention a valid ${prompt.key.includes('Role') ? 'role' : 'channel'} or provide its ID.`);
          }
        }
        if (!valid) {
          await promptSend('❌ Too many invalid attempts. Setup cancelled.');
          return;
        }
      }
      // Summary and confirmation
      const summary = prompts.map(p => `**${p.label}:** ${p.key.includes('Id') ? (p.key.includes('Role') ? `<@&${collected[p.key]}>` : `<#${collected[p.key]}>`) : collected[p.key]}`).join('\n');
      await promptSend(`Here are the roles you selected:\n${summary}\nType **confirm** to save, or **cancel** to abort.`);
      let confirmResp;
      try {
        confirmResp = await setupChannel.awaitMessages({ max: 1, time: 60000, errors: ['time'], filter: m => m.author.id === message.author.id });
      } catch {
        confirmResp = null;
      }
      if (!confirmResp || !confirmResp.first()) {
        await promptSend('⏰ Timed out. Setup cancelled.');
        return;
      }
      if (confirmResp.first().content.toLowerCase() !== 'confirm') {
        await promptSend('❌ Setup cancelled. No changes were made.');
        return;
      }
      // Save to config
      config.settings.verification = collected;
      await setGuildConfig(message.guild.id, config);
      await promptSend('<:Done:1305644486453493801> Verification roles have been saved! The system is now ready to use.');
      return;
    }

    // Setup mode: !verify set <type> @role/@channel
    if (sub === 'set' && args[1]) {
      const type = args[1].toLowerCase();
      let item; // Can be role or channel
      const validTypes = ['unverified', 'verified', 'boy', 'girl', 'verificator', 'log'];

      if (!validTypes.includes(type)) {
        return sendEmbed(message, {
          title: '❓ Invalid Type',
          description: 'Type must be one of: unverified, verified, boy, girl, verificator, log.',
          color: 0x23272A,
        });
      }

      if (type === 'log') {
        item = message.mentions.channels.first() || message.guild.channels.cache.get(args[2]?.trim());
        if (!item) {
          return sendEmbed(message, {
            title: '❓ Invalid Channel',
            description: 'Please mention a valid log channel or provide its ID.',
            color: 0x23272A,
          });
        }
      } else {
        item = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]?.trim());
        if (!item) {
          return sendEmbed(message, {
            title: '❓ Invalid Role',
            description: `Please mention a valid ${type} role or provide its ID. `,
            color: 0x23272A,
          });
        }
      }
      
      config.settings.verification[`${type}RoleId`] = item.id; // This will be logChannelId for type 'log'
      await setGuildConfig(message.guild.id, config);
      return sendEmbed(message, {
        title: '<:Done:1305644486453493801> Verification Setting Updated',
        description: `Set **${type}** to ${item}.`,
        color: 0x23272A,
      });
    }

    // Verification: !verify girl @user or id | !verify boy @user or id
    if ((sub === 'girl' || sub === 'boy') && args[1]) {
      // Permission: only verificator or owner
      const vRoleId = config.settings.verification.verificatorRoleId;
      if (!isOwner && (!vRoleId || !message.member.roles.cache.has(vRoleId))) {
        return sendEmbed(message, {
          title: '🚫 Permission Denied',
          description: 'You need the **Verificator** role to verify users.',
          color: 0x23272A,
        });
      }
      // Get target member
      let member = message.mentions.members.first();
      if (!member && args[1]) {
        try {
          member = await message.guild.members.fetch(args[1]);
        } catch (e) {}
      }
      if (!member) {
        return sendEmbed(message, {
          title: '❓ User Not Found',
          description: 'Please mention a user or provide a valid user ID to verify.',
          color: 0x23272A,
        });
      }
      // Get role IDs
      const unverified = config.settings.verification.unverifiedRoleId;
      const verified = config.settings.verification.verifiedRoleId;
      const genderRole = config.settings.verification[`${sub}RoleId`];
      const logChannelId = config.settings.verification.logChannelId; // Get log channel ID

      if (!unverified || !verified || !genderRole) {
        return sendEmbed(message, {
          title: '⚠️ Roles Not Set',
          description: 'Please set up all verification roles with `!verify set <type> @role` or use `!verify setup`.',
          color: 0x23272A,
        });
      }
      try {
        await member.roles.remove(unverified);
        await member.roles.add([verified, genderRole]);
        
        const successEmbed = {
          title: 'Successfully Verified..',
          thumbnail: {
            url: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          },
          fields: [
            {
              name: 'Member Details:',
              value: `${member.toString()}`,
              inline: true,
            },
            {
              name: 'Verified By:',
              value: `${message.author.toString()}\n${message.author.id}`,
              inline: true,
            },
            {
              name: 'Server Join Time:',
              value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
              inline: true,
            },
            {
              name: '\u200B',
              value: '\u200B',
              inline: false,
            },
            {
              name: 'Verification Time:',
              value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
              inline: true,
            },
            {
              name: 'User Information:',
              value: 'Unspecified Info',
              inline: true,
            },
            {
              name: '\u200B',
              value: '\u200B',
              inline: false,
            },
            {
              name: 'Command Used in:',
              value: `#${message.channel.name} [Click here to Navigate](${message.url})`,
              inline: false,
            },
          ],
          footer: {
            text: `Verified By: ${message.author.tag} • <t:${Math.floor(message.createdTimestamp / 1000)}:f>`,
            iconURL: message.author.displayAvatarURL({ dynamic: true }),
          },
          timestamp: false, // Set to false as timestamp is in footer
          color: 0x00FF00, // Green color for success
        };

        // Send to current channel (original behavior)
        sendEmbed(message, successEmbed);

        // Send to log channel if configured
        if (logChannelId) {
          const logChannel = message.guild.channels.cache.get(logChannelId);
          if (logChannel) {
            logChannel.send({ embeds: [successEmbed] }).catch(err => console.error('Failed to send verification log to channel:', err));
          } else {
            console.warn(`Configured log channel ${logChannelId} not found.`);
          }
        }

      } catch (err) {
        sendEmbed(message, {
          title: '❌ Error',
          description: `Failed to verify user.\n\`\`\`${err.message}\`\`\``,
          color: 0x23272A,
        });
      }
      return;
    }

    // Info/help embed
    return sendEmbed(message, {
      title: '<:manager:1466826492334833665> Verification System Help',
      description: 'This command manages the server\'s user verification process. Set up roles for unverified, verified, and specific genders, and then use it to verify new members.\'',
      fields: [
        {
          name: '🛠️ Setup Wizard',
          value: 'Use `!verify setup` to run an interactive wizard to configure all verification roles step-by-step.',
          inline: false
        },
        {
          name: '⚙️ Set Individual Roles',
          value: 'Set specific verification roles:\n`!verify set <unverified|verified|boy|girl|verificator> @role`',
          inline: false
        },
        {
          name: '✅ Verify a User',
          value: 'Verify a user as a boy or girl (requires Verificator role):\n`!verify boy @user` or `!verify girl @user`',
          inline: false
        },
        // Display current settings if available
        { 
          name: 'Current Settings',
          value: [
            `**Unverified Role:** ${config.settings.verification.unverifiedRoleId ? `<@&${config.settings.verification.unverifiedRoleId}>` : 'Not Set'}`,
            `**Verified Role:** ${config.settings.verification.verifiedRoleId ? `<@&${config.settings.verification.verifiedRoleId}>` : 'Not Set'}`,
            `**Boy Role:** ${config.settings.verification.boyRoleId ? `<@&${config.settings.verification.boyRoleId}>` : 'Not Set'}`,
            `**Girl Role:** ${config.settings.verification.girlRoleId ? `<@&${config.settings.verification.girlRoleId}>` : 'Not Set'}`,
            `**Verificator Role:** ${config.settings.verification.verificatorRoleId ? `<@&${config.settings.verification.verificatorRoleId}>` : 'Not Set'}`,
            `**Log Channel:** ${config.settings.verification.logChannelId ? `<#${config.settings.verification.logChannelId}>` : 'Not Set'}`
          ].join('\n'),
          inline: false
        }
      ],
      footer: {
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      },
      timestamp: true,
      color: 0x5865F2,
    });
  },
};
