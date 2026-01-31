const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

/**
 * Generate a professional rank card using Canvas
 * @param {Object} userData - User level data
 * @param {Object} member - Discord member object
 * @param {string} type - 'text' or 'voice'
 * @param {number} rank - User's rank position
 * @param {string} theme - Card theme ('dark', 'light', 'neon', 'gradient')
 * @returns {Buffer} PNG image buffer
 */
async function generateRankCard(userData, member, type = 'text', rank = 0, theme = 'dark') {
    try {
        // Register system fonts (Windows)
        try {
            GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arial.ttf', 'Arial');
            GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arialbd.ttf', 'Arial Bold');
        } catch (fontError) {
            console.log('[RankCard] Could not register fonts, using defaults');
        }



        // Canvas dimensions
        const width = 900;
        const height = 300;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Get user data based on type
        const level = type === 'text' ? userData.text_level : userData.voice_level;
        const xp = type === 'text' ? userData.text_xp : userData.voice_xp;
        const nextLevelXp = type === 'text' ? userData.text_next_level_xp : userData.voice_next_level_xp;
        const progress = nextLevelXp > 0 ? (xp / nextLevelXp) : 0;


        // Theme colors
        const themes = {
            dark: {
                bg: '#1a1d23',
                bgGradient: '#23272a',
                text: '#ffffff',
                textSecondary: '#b9bbbe',
                progressBg: '#2c2f33',
                progressFill: ['#5865f2', '#7289da'],
                accent: '#5865f2',
                border: '#40444b'
            },
            light: {
                bg: '#ffffff',
                bgGradient: '#f6f6f7',
                text: '#2c2f33',
                textSecondary: '#747f8d',
                progressBg: '#e3e5e8',
                progressFill: ['#5865f2', '#7289da'],
                accent: '#5865f2',
                border: '#dcddde'
            },
            neon: {
                bg: '#0a0e27',
                bgGradient: '#1a1f3a',
                text: '#00ffff',
                textSecondary: '#ff00ff',
                progressBg: '#1a1f3a',
                progressFill: ['#00ffff', '#ff00ff'],
                accent: '#00ffff',
                border: '#ff00ff'
            },
            gradient: {
                bg: '#667eea',
                bgGradient: '#764ba2',
                text: '#ffffff',
                textSecondary: '#f0f0f0',
                progressBg: 'rgba(255,255,255,0.2)',
                progressFill: ['#f093fb', '#f5576c'],
                accent: '#ffffff',
                border: '#ffffff'
            }
        };

        const colors = themes[theme] || themes.dark;

        // Background gradient
        const bgGradient = ctx.createLinearGradient(0, 0, width, height);
        bgGradient.addColorStop(0, colors.bg);
        bgGradient.addColorStop(1, colors.bgGradient);
        ctx.fillStyle = bgGradient;
        roundRect(ctx, 0, 0, width, height, 20);
        ctx.fill();

        // Border
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 3;
        roundRect(ctx, 0, 0, width, height, 20);
        ctx.stroke();

        // Avatar
        const avatarSize = 150;
        const avatarX = 40;
        const avatarY = height / 2 - avatarSize / 2;

        try {
            const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await loadImage(avatarURL);

            // Avatar border
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = colors.accent;
            ctx.fill();

            // Avatar circle
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        } catch (error) {
            // Fallback: draw colored circle if avatar fails
            ctx.fillStyle = colors.accent;
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Username
        const textStartX = avatarX + avatarSize + 30;
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 36px Arial';
        ctx.fillText(member.user.username, textStartX, 70);

        // Discriminator (if not 0)
        if (member.user.discriminator !== '0') {
            ctx.fillStyle = colors.textSecondary;
            ctx.font = '24px Arial';
            const usernameWidth = ctx.measureText(member.user.username).width;
            ctx.fillText(`#${member.user.discriminator}`, textStartX + usernameWidth + 10, 70);
        }

        // Rank badge (only show if rank is valid and > 0)
        if (rank && rank > 0) {
            const rankText = `#${rank}`;
            ctx.font = 'bold 32px Arial';
            const rankWidth = ctx.measureText(rankText).width;
            const rankX = width - rankWidth - 50;
            const rankY = 70;

            // Rank background
            ctx.fillStyle = colors.accent;
            ctx.beginPath();
            roundRect(ctx, rankX - 15, rankY - 35, rankWidth + 30, 45, 10);
            ctx.fill();

            // Rank text - use contrasting color based on theme
            // For light themes, use dark text. For dark themes, use white text.
            if (theme === 'light') {
                ctx.fillStyle = colors.bg; // Dark text on light background
            } else {
                ctx.fillStyle = '#ffffff'; // White text on dark/colored backgrounds
            }
            ctx.fillText(rankText, rankX, rankY);
        } else {
            // Rank not available
        }

        // Level
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 48px Arial';
        ctx.fillText(`Level ${level}`, textStartX, 130);

        // Type indicator (emojis don't render in Canvas, use text)
        ctx.fillStyle = colors.textSecondary;
        ctx.font = '20px Arial';
        const typeText = type === 'text' ? 'Text XP' : 'Voice XP';
        ctx.fillText(typeText, textStartX, 160);

        // Progress bar background
        const barX = textStartX;
        const barY = 190;
        const barWidth = width - textStartX - 50;
        const barHeight = 35;

        ctx.fillStyle = colors.progressBg;
        roundRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2);
        ctx.fill();

        // Progress bar fill (gradient)
        if (progress > 0) {
            const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth * progress, barY);
            progressGradient.addColorStop(0, colors.progressFill[0]);
            progressGradient.addColorStop(1, colors.progressFill[1]);
            ctx.fillStyle = progressGradient;
            roundRect(ctx, barX, barY, barWidth * progress, barHeight, barHeight / 2);
            ctx.fill();
        }

        // XP text
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 20px Arial';
        const xpText = `${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP`;
        const xpTextWidth = ctx.measureText(xpText).width;
        ctx.fillText(xpText, barX + (barWidth - xpTextWidth) / 2, barY + 23);

        // Progress percentage
        ctx.fillStyle = colors.textSecondary;
        ctx.font = '18px Arial';
        const percentText = `${Math.round(progress * 100)}%`;
        ctx.fillText(percentText, barX + barWidth + 10, barY + 23);

        // Stats footer
        const otherType = type === 'text' ? 'voice' : 'text';
        const otherLevel = type === 'text' ? userData.voice_level : userData.text_level;
        const totalXp = userData.text_xp + userData.voice_xp;

        ctx.fillStyle = colors.textSecondary;
        ctx.font = '18px Arial';
        const statsText = `${otherType.charAt(0).toUpperCase() + otherType.slice(1)} Level: ${otherLevel}  •  Total XP: ${formatNumber(totalXp)}`;
        ctx.fillText(statsText, textStartX, height - 30);

        return canvas.toBuffer('image/png');
    } catch (error) {
        console.error('[RankCard] Error generating rank card:', error);
        throw error;
    }
}

/**
 * Helper: Draw rounded rectangle
 */
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Helper: Format numbers with commas
 */
function formatNumber(num) {
    return num.toLocaleString();
}

module.exports = {
    generateRankCard
};
