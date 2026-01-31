const { AttachmentBuilder } = require('discord.js');
const { getLeaderboard } = require('../database/levelSystem');
const { generateTopUsers } = require('../utils/canvasTopUsers');
const { getGuildTheme } = require('../database/levelSettings');

module.exports = {
    name: 'top',
    aliases: ['top3', 'podium'],
    description: 'Show the top 3 users in a podium display.',
    usage: 'top [text|voice|combined]',
    prefixless: true,
    async execute(message, args) {
        // Parse type argument
        let type = 'text';
        if (args.length > 0) {
            const lower = args[0].toLowerCase();
            if (['text', 'voice', 'combined'].includes(lower)) {
                type = lower;
            }
        }

        // Fetch leaderboard data
        let leaderboard = [];
        try {
            if (type === 'combined') {
                // Get both text and voice, combine by total XP
                const textLb = await getLeaderboard(message.guild.id, 'text', 100);
                const voiceLb = await getLeaderboard(message.guild.id, 'voice', 100);

                // Combine and sum XP
                const combined = {};
                for (const user of textLb) {
                    if (!combined[user.user_id]) {
                        combined[user.user_id] = { user_id: user.user_id, xp: 0, level: 0 };
                    }
                    combined[user.user_id].xp += user.xp;
                    combined[user.user_id].level = Math.max(combined[user.user_id].level, user.level);
                }
                for (const user of voiceLb) {
                    if (!combined[user.user_id]) {
                        combined[user.user_id] = { user_id: user.user_id, xp: 0, level: 0 };
                    }
                    combined[user.user_id].xp += user.xp;
                    combined[user.user_id].level = Math.max(combined[user.user_id].level, user.level);
                }

                leaderboard = Object.values(combined).sort((a, b) => b.xp - a.xp);
            } else {
                leaderboard = await getLeaderboard(message.guild.id, type, 100);
            }
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            return message.reply('❌ Failed to fetch leaderboard data.');
        }

        if (!leaderboard || leaderboard.length === 0) {
            return message.reply(`No ${type} XP data available yet.`);
        }

        // Get top 3 users
        const top3 = leaderboard.slice(0, 3);
        const users = [];

        for (let i = 0; i < top3.length; i++) {
            const user = top3[i];
            try {
                const member = await message.guild.members.fetch(user.user_id);

                users.push({
                    rank: i + 1,
                    username: member.user.username,
                    avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                    level: user.level,
                    totalXP: user.xp
                });
            } catch (error) {
                // Skip users who left the server
                continue;
            }
        }

        if (users.length === 0) {
            return message.reply('No active users found.');
        }

        // Get server theme
        const theme = await getGuildTheme(message.guild.id);

        // Generate Canvas top users display
        let imageBuffer;
        try {
            imageBuffer = await generateTopUsers({
                users,
                guild: message.guild,
                type,
                theme
            });
        } catch (error) {
            console.error('[Top] Error generating Canvas:', error);
            return message.reply('❌ Failed to generate top users display.');
        }

        const attachment = new AttachmentBuilder(imageBuffer, { name: 'top-users.png' });
        await message.reply({ files: [attachment] });
    }
};
