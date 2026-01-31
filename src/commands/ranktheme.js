const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../services/database');

module.exports = {
    name: 'ranktheme',
    aliases: ['theme', 'cardtheme'],
    description: 'Customize your rank card theme.',
    usage: 'ranktheme [dark|light|neon|gradient]',
    prefixless: true,
    async execute(message, args) {
        const themes = {
            dark: {
                name: 'Dark Mode',
                emoji: '🌙',
                description: 'Classic dark theme with blue accents',
                preview: 'Perfect for night owls'
            },
            light: {
                name: 'Light Mode',
                emoji: '☀️',
                description: 'Clean light theme with subtle colors',
                preview: 'Easy on the eyes'
            },
            neon: {
                name: 'Neon',
                emoji: '⚡',
                description: 'Cyberpunk-inspired neon colors',
                preview: 'Stand out from the crowd'
            },
            gradient: {
                name: 'Gradient',
                emoji: '🌈',
                description: 'Beautiful gradient background',
                preview: 'Colorful and vibrant'
            }
        };

        // If theme specified in args
        if (args[0]) {
            const selectedTheme = args[0].toLowerCase();
            if (!themes[selectedTheme]) {
                return message.reply(`❌ Invalid theme. Available themes: **${Object.keys(themes).join(', ')}**`);
            }

            try {
                await db.query(
                    `INSERT INTO user_preferences (guild_id, user_id, rank_card_theme)
           VALUES ($1, $2, $3)
           ON CONFLICT (guild_id, user_id)
           DO UPDATE SET rank_card_theme = $3`,
                    [message.guild.id, message.author.id, selectedTheme]
                );

                const theme = themes[selectedTheme];
                return message.reply(`${theme.emoji} **Theme Updated!**\nYour rank card theme is now set to **${theme.name}**.\nUse \`level\` to see your new card!`);
            } catch (error) {
                console.error('Error saving theme preference:', error);
                return message.reply('❌ Failed to save theme preference. Please try again.');
            }
        }

        // Show theme selector
        try {
            const { rows } = await db.query(
                'SELECT rank_card_theme FROM user_preferences WHERE guild_id = $1 AND user_id = $2',
                [message.guild.id, message.author.id]
            );
            const currentTheme = rows[0]?.rank_card_theme || 'dark';

            const embed = new EmbedBuilder()
                .setTitle('🎨 Rank Card Themes')
                .setDescription('Choose a theme for your rank card!\nYour current theme is highlighted below.')
                .setColor(0x5865F2);

            for (const [key, theme] of Object.entries(themes)) {
                const isCurrent = key === currentTheme ? ' ✅' : '';
                embed.addFields({
                    name: `${theme.emoji} ${theme.name}${isCurrent}`,
                    value: `${theme.description}\n*${theme.preview}*`,
                    inline: true
                });
            }

            embed.setFooter({ text: `Use: ${message.guild.prefix || '!'}ranktheme <theme>` });

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching theme preference:', error);
            return message.reply('❌ Failed to load themes. Please try again.');
        }
    }
};
