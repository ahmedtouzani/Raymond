const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    PermissionFlagsBits
} = require('discord.js');
const { getGuildSettingsWithDefaults, updateGuildSettings } = require('../../database/levelSettings');

module.exports = {
    name: 'levelsetup',
    description: 'Configure server-wide level system settings (Admin only)',
    usage: 'levelsetup',
    permissions: [PermissionFlagsBits.Administrator],
    async execute(message, args) {
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command.');
        }

        // Get current settings
        const settings = await getGuildSettingsWithDefaults(message.guild.id);

        // Create main menu embed
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Level System Setup')
            .setDescription('Configure your server\'s level system settings')
            .setColor(0x5865F2)
            .addFields(
                {
                    name: '🎨 Theme',
                    value: `Current: **${settings.theme_preset}**`,
                    inline: true
                },
                {
                    name: '⚡ XP Multiplier',
                    value: `**${settings.xp_multiplier}x**`,
                    inline: true
                },
                {
                    name: '📢 Level-Up Messages',
                    value: settings.levelup_enabled ? '✅ Enabled' : '❌ Disabled',
                    inline: true
                },
                {
                    name: '🎁 Role Rewards',
                    value: `${Object.keys(settings.role_rewards || {}).length} configured`,
                    inline: true
                },
                {
                    name: '💬 Text XP Range',
                    value: `${settings.text_xp_min}-${settings.text_xp_max} per message`,
                    inline: true
                },
                {
                    name: '🎤 Voice XP Rate',
                    value: `${settings.voice_xp_rate} per minute`,
                    inline: true
                }
            )
            .setFooter({ text: 'Select an option below to configure' })
            .setTimestamp();

        // Create menu buttons
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('levelsetup_theme')
                    .setLabel('🎨 Theme')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('levelsetup_xp')
                    .setLabel('⚡ XP Settings')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('levelsetup_levelup')
                    .setLabel('📢 Level-Up Messages')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('levelsetup_roles')
                    .setLabel('🎁 Role Rewards')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('levelsetup_preview')
                    .setLabel('👁️ Preview')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('levelsetup_reset')
                    .setLabel('🔄 Reset to Defaults')
                    .setStyle(ButtonStyle.Danger)
            );

        await message.reply({ embeds: [embed], components: [row1, row2] });
    }
};
