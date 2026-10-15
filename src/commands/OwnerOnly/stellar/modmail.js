const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasStellarOrHigher } = require('../../../premium/premium');
const { createErrorEmbed, createSystemEmbed, createEmbed } = require('../../../utils/embed');
require('dotenv').config();

// Helper function to send the Ticket Panel Message
async function sendTicketPanel(channel, guildId) {
    const ticketPanelEmbed = await createEmbed(guildId, {
        title: "❔ Need help or have feedback?",
        description:
            "➡️ Open a secure, private ticket instantly. Whether you’re encountering an issue, want to share your ideas, or simply need guidance, our Modmail Ticket system connects you directly with our dedicated support team—fast, efficient, and completely confidential.",
        color: 0x131416, // Dark theme
        footer: { text: "Premium Modmail Dashboard" },
        // Optionally add an image banner here if desired:
        image: "https://cdn.discordapp.com/attachments/1379142551784657088/1379170396472873162/pu.jpg?ex=683f4406&is=683df286&hm=f228fe545bfaf4762363f2b4fb50126cc153799f223e9456f6b798116a17c341&" // Example banner URL
    });

    // Create a button to open a ticket
    const createTicketButton = new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("Create Ticket")
        .setStyle(ButtonStyle.Primary);

    const actionRow = new ActionRowBuilder().addComponents(createTicketButton);

    await channel.send({ embeds: [ticketPanelEmbed], components: [actionRow] });
}

module.exports = {
    name: 'modmail',
    aliases: ['mm'],
    prefixless: true,
    description: 'Stellar + Modmail configuration and broadcast commands.',
    async execute(message, args) {
        try {
            const ownerId = process.env.OWNER_ID;

            // Premium gating: Only allow Stellar Matrix (or higher) servers
            if (!(await hasStellarOrHigher(message.guild.id))) {
                const embed = await createErrorEmbed(message.guild.id, {
                    title: 'Premium Feature Locked',
                    description:
                        'Modmail is only available to servers with the **Stellar Matrix** plan or higher.'
                });
                return message.reply({ embeds: [embed] });
            }

            // Permission Check: Allow bot owner to bypass admin check
            if (message.author.id !== ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                const embed = await createErrorEmbed(message.guild.id, {
                    title: 'Permission Denied',
                    description: 'Only administrators can use modmail configuration commands.'
                });
                return message.reply({ embeds: [embed] });
            }

            // Subcommand parsing
            const subcommand = (args[0] || '').toLowerCase();

            switch (subcommand) {
                case 'setroles': {
                    let modRoleIDs = [];
                    // Use role mentions if given...
                    if (message.mentions.roles && message.mentions.roles.size > 0) {
                        modRoleIDs = Array.from(message.mentions.roles.keys());
                    }
                    // Otherwise parse raw IDs from arguments (after subcommand)
                    else if (args.length > 1) {
                        for (let i = 1; i < args.length; i++) {
                            let roleId = args[i].replace(/[^0-9]/g, '');
                            if (message.guild.roles.cache.has(roleId)) {
                                modRoleIDs.push(roleId);
                            }
                        }
                    }
                    if (modRoleIDs.length === 0) {
                        const { createUsageEmbed } = require('../../../utils/embed');
                        const embed = await createUsageEmbed(message.guild.id, {
                            command: 'modmail setroles',
                            description: '<a:warningbug:1467300628907954300> **Invalid Usage**\nPlease mention or supply one or more valid role IDs to set as mod roles.',
                            usage: '`!modmail setroles <@role/ID>`',
                            examples: '`!modmail setroles @Moderator`'
                        });
                        return message.reply({ embeds: [embed] });
                    }

                    const { getGuildConfig, setGuildConfig } = require('../../../database/guildConfig');
                    let guildConfig = await getGuildConfig(message.guild.id);
                    if (!guildConfig)
                        guildConfig = { guild_id: message.guild.id, settings: {} };
                    if (!guildConfig.settings)
                        guildConfig.settings = {};
                    guildConfig.settings.modRoleIDs = modRoleIDs;
                    await setGuildConfig(message.guild.id, guildConfig);

                    const embed = await createSystemEmbed(message.guild.id, {
                        title: 'Premium Modmail | Roles Updated',
                        description: `Modmail notifications will now mention: ${modRoleIDs.map(id => `<@&${id}>`).join(' ')}`
                    });
                    return message.reply({ embeds: [embed] });
                }

                case 'setcategory': {
                    // Try to get a category from mentions first.
                    let category = message.mentions.channels.filter(c => c.type === 4 /* GUILD_CATEGORY */).first();
                    // Otherwise parse the provided ID
                    if (!category && args[1]) {
                        const categoryId = args[1].replace(/[^0-9]/g, '');
                        const fetched = message.guild.channels.cache.get(categoryId);
                        if (fetched && fetched.type === 4) category = fetched;
                    }
                    if (!category) {
                        const { createUsageEmbed } = require('../../../utils/embed');
                        const embed = await createUsageEmbed(message.guild.id, {
                            command: 'modmail setcategory',
                            description: '<a:warningbug:1467300628907954300> **Invalid Category**\nPlease mention a category or supply a valid category ID.',
                            usage: '`!modmail setcategory <categoryID>`',
                            examples: '`!modmail setcategory 123456789012345678`'
                        });
                        return message.reply({ embeds: [embed] });
                    }
                    const { getGuildConfig, setGuildConfig } = require('../../../database/guildConfig');
                    let guildConfig = await getGuildConfig(message.guild.id);
                    if (!guildConfig) guildConfig = { guild_id: message.guild.id, settings: {} };
                    if (!guildConfig.settings) guildConfig.settings = {};
                    guildConfig.settings.ticketCategoryId = category.id;
                    await setGuildConfig(message.guild.id, guildConfig);
                    const embed = await createSystemEmbed(message.guild.id, {
                        title: 'Premium Modmail | Ticket Category Updated',
                        description: `All new ticket channels will be created under the category: ${category}`
                    });
                    return message.reply({ embeds: [embed] });
                }

                case 'setchannel': {
                    // Try to get a channel from mentions first.
                    let channel = message.mentions.channels.first();
                    // Otherwise parse the provided ID
                    if (!channel && args[1]) {
                        const channelId = args[1].replace(/[^0-9]/g, '');
                        channel = message.guild.channels.cache.get(channelId);
                    }
                    if (!channel) {
                        const { createUsageEmbed } = require('../../../utils/embed');
                        const embed = await createUsageEmbed(message.guild.id, {
                            command: 'modmail setchannel',
                            description: '<a:warningbug:1467300628907954300> **Invalid Channel**\nPlease mention a channel or supply a valid channel ID.',
                            usage: '`!modmail setchannel <#channel>`',
                            examples: '`!modmail setchannel #mod-logs`'
                        });
                        return message.reply({ embeds: [embed] });
                    }

                    const { getGuildConfig, setGuildConfig } = require('../../../database/guildConfig');
                    let guildConfig = await getGuildConfig(message.guild.id);
                    if (!guildConfig)
                        guildConfig = { guild_id: message.guild.id, settings: {} };
                    if (!guildConfig.settings)
                        guildConfig.settings = {};

                    // Save the modmail notification channel's ID
                    guildConfig.settings.modNotificationChannelID = channel.id;
                    await setGuildConfig(message.guild.id, guildConfig);

                    // Send the Ticket Panel Message in that channel
                    await sendTicketPanel(channel, message.guild.id);

                    const embed = await createSystemEmbed(message.guild.id, {
                        title: 'Premium Modmail | Channel Updated',
                        description: `Modmail notifications will now be sent in ${channel}. A ticket panel has been created.`
                    });
                    return message.reply({ embeds: [embed] });
                }

                case 'config': {
                    // View current modmail configuration
                    const { getGuildConfig } = require('../../../database/guildConfig');
                    const config = await getGuildConfig(message.guild.id);
                    if (!config || !config.settings) {
                        const embed = await createErrorEmbed(message.guild.id, {
                            title: 'Configuration Not Set',
                            description: 'No modmail configuration found for this server.'
                        });
                        return message.reply({ embeds: [embed] });
                    }
                    const modRoleIDs = config.settings.modRoleIDs || [];
                    const modChannelID = config.settings.modNotificationChannelID;
                    const modRoles = modRoleIDs.length > 0
                        ? modRoleIDs.map(id => `<@&${id}>`).join(', ')
                        : 'Not set';
                    const modChannel = modChannelID ? `<#${modChannelID}>` : 'Not set';

                    const embed = await createSystemEmbed(message.guild.id, {
                        title: 'Premium Modmail | Current Configuration',
                        description: `**Moderator Roles:** ${modRoles}\n**Notification Channel:** ${modChannel}`
                    });
                    return message.reply({ embeds: [embed] });
                }

                case 'broadcast': {
                    // Broadcast a message (Admin-only) to all moderators in this server
                    if (args.length < 2) {
                        const { createUsageEmbed } = require('../../../utils/embed');
                        const embed = await createUsageEmbed(message.guild.id, {
                            command: 'modmail broadcast',
                            description: '<a:warningbug:1467300628907954300> **Missing Message**\nPlease provide a message to broadcast to all mods.',
                            usage: '`!modmail broadcast <message>`',
                            examples: '`!modmail broadcast Important Meeting!`'
                        });
                        return message.reply({ embeds: [embed] });
                    }
                    const broadcastMessage = args.slice(1).join(' ');
                    const { getGuildConfig } = require('../../../database/guildConfig');
                    const guildConfig = await getGuildConfig(message.guild.id);
                    if (!guildConfig || !guildConfig.settings || !guildConfig.settings.modRoleIDs) {
                        const embed = await createErrorEmbed(message.guild.id, {
                            title: 'Configuration Error',
                            description: 'Mod roles have not been set up for this server.'
                        });
                        return message.reply({ embeds: [embed] });
                    }
                    const modRoleIDs = guildConfig.settings.modRoleIDs;
                    const uniqueMods = new Set();
                    modRoleIDs.forEach(roleID => {
                        const modRole = message.guild.roles.cache.get(roleID);
                        if (modRole) {
                            modRole.members.forEach(member => uniqueMods.add(member));
                        }
                    });
                    const { EmbedBuilder } = require('discord.js');
                    uniqueMods.forEach(async member => {
                        try {
                            const broadcastEmbed = new EmbedBuilder()
                                .setColor(0x131416)
                                .setTitle('<<:13135namegaphone:1379103314121195545> Admin Broadcast')
                                .setDescription(broadcastMessage)
                                .setFooter({ text: `From: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                                .setTimestamp();
                            await member.send({ embeds: [broadcastEmbed] });
                        } catch (err) {
                            console.error(`Failed to send DM to ${member.user.tag}:`, err);
                        }
                    });
                    const embed = await createSystemEmbed(message.guild.id, {
                        title: 'Premium Modmail | Broadcast Sent',
                        description: 'Your broadcast message has been sent to all moderators.'
                    });
                    return message.reply({ embeds: [embed] });
                }

                case 'reset': {
                    // Allow admins or bot owner to clear all modmail config
                    const { getGuildConfig, setGuildConfig } = require('../../../database/guildConfig');
                    let guildConfig = await getGuildConfig(message.guild.id);
                    if (!guildConfig) guildConfig = { guild_id: message.guild.id, settings: {} };
                    guildConfig.settings.modRoleIDs = [];
                    guildConfig.settings.ticketCategoryId = undefined;
                    guildConfig.settings.modNotificationChannelID = undefined;
                    await setGuildConfig(message.guild.id, guildConfig);
                    const embed = await createSystemEmbed(message.guild.id, {
                        title: 'Premium Modmail | Configuration Reset',
                        description: 'All modmail configuration has been cleared for this server.'
                    });
                    return message.reply({ embeds: [embed] });
                }

                default: {
                    // Dark-themed premium help embed
                    const premiumHelpEmbed = await createEmbed(message.guild.id, {
                        title: '🛠️ **Premium Modmail Dashboard**',
                        description:
                            "Welcome to your exclusive modmail management panel. Use the buttons below to adjust moderator notifications and send urgent broadcasts.",
                        fields: [
                            {
                                name: '👥 Set Mod Roles',
                                value: '`modmail setroles <@Role ...>` or `modmail setroles <roleId ...>`\nConfigure which roles are notified when a ticket is opened.',
                                inline: true
                            },
                            {
                                name: '📢 Set Notification Channel',
                                value: '`modmail setchannel <#Channel>` or `modmail setchannel <channelId>`\nChoose the channel where ticket notifications are sent. A ticket panel will be posted in that channel.',
                                inline: true
                            },
                            {
                                name: '📂 Set Ticket Category',
                                value: '`modmail setcategory <#Category>` or `modmail setcategory <categoryId>`\nExample: `modmail setcategory #Tickets` or `modmail setcategory 123456789012345678`\nSet the category where ticket channels will be created.',
                                inline: false
                            },
                            {
                                name: '⚙️ View Configuration',
                                value: '`modmail config`\nDisplay the current modmail settings.',
                                inline: false
                            },
                            {
                                name: '📡 Broadcast Message',
                                value: '`modmail broadcast <message>`\nSend an urgent message to all moderators.',
                                inline: false
                            },
                            {
                                name: '🗑️ Reset Modmail Config',
                                value: '`modmail reset`\nClear all modmail configuration for this server.',
                                inline: false
                            }
                        ],
                        color: 0x131416, // Enforce dark theme,
                        footer: { text: 'Premium Modmail Dashboard' }
                    });
                    return message.reply({ embeds: [premiumHelpEmbed] });
                }
            }
        } catch (error) {
            console.error('Error in modmail command:', error);
            const embed = await createErrorEmbed(message.guild.id, {
                title: 'An error occurred',
                description: `\`\`\`${error.message}\`\`\``
            });
            return message.reply({ embeds: [embed] });
        }
    }
};