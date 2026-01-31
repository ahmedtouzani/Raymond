const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

/**
 * Generate a Canvas-based leaderboard image
 * @param {Object} options - Leaderboard options
 * @param {Array} options.users - Array of user data with rank, username, level, xp, avatar
 * @param {Object} options.guild - Guild object
 * @param {string} options.type - 'text' or 'voice'
 * @param {number} options.page - Current page number
 * @param {number} options.totalPages - Total number of pages
 * @param {string} options.theme - Theme name ('dark', 'light', 'neon', 'gradient')
 * @returns {Buffer} PNG image buffer
 */
async function generateLeaderboard(options) {
    const {
        users = [],
        guild,
        type = 'text',
        page = 1,
        totalPages = 1,
        theme = 'dark'
    } = options;

    // Register bundled font
    try {
        const bundledFontPath = path.join(__dirname, '../../fonts/Arial.ttf');
        if (fs.existsSync(bundledFontPath)) {
            GlobalFonts.registerFromPath(bundledFontPath, 'Arial');
        }
    } catch (err) {
        console.error('[Leaderboard] Font registration error:', err.message);
    }

    // Canvas dimensions
    const width = 1200;
    const headerHeight = 150;
    const rowHeight = 100;
    const footerHeight = 80;
    const usersToShow = Math.min(users.length, 10);
    const height = headerHeight + (usersToShow * rowHeight) + footerHeight;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Theme colors
    const themes = {
        dark: {
            bg: '#1a1d23',
            bgAlt: '#23272a',
            border: '#40444b',
            text: '#ffffff',
            textSecondary: '#b9bbbe',
            accent: '#5865f2',
            progressBg: '#2c2f33',
            progressFill: ['#5865f2', '#7289da']
        },
        light: {
            bg: '#ffffff',
            bgAlt: '#f6f6f7',
            border: '#dcddde',
            text: '#2c2f33',
            textSecondary: '#747f8d',
            accent: '#5865f2',
            progressBg: '#e3e5e8',
            progressFill: ['#5865f2', '#7289da']
        },
        neon: {
            bg: '#0a0e27',
            bgAlt: '#1a1f3a',
            border: '#ff00ff',
            text: '#00ffff',
            textSecondary: '#ff00ff',
            accent: '#00ffff',
            progressBg: '#1a1f3a',
            progressFill: ['#00ffff', '#ff00ff']
        },
        gradient: {
            bg: '#667eea',
            bgAlt: '#764ba2',
            border: '#ffffff',
            text: '#ffffff',
            textSecondary: '#f0f0f0',
            accent: '#ffffff',
            progressBg: 'rgba(255,255,255,0.2)',
            progressFill: ['#f093fb', '#f5576c']
        }
    };

    const colors = themes[theme] || themes.dark;

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, colors.bg);
    bgGradient.addColorStop(1, colors.bgAlt);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    // === HEADER SECTION ===
    await drawHeader(ctx, guild, type, users.length, colors, width, headerHeight);

    // === USER ROWS ===
    for (let i = 0; i < usersToShow; i++) {
        const user = users[i];
        const y = headerHeight + (i * rowHeight);
        await drawUserRow(ctx, user, y, rowHeight, width, colors, theme, i);
    }

    // === FOOTER SECTION ===
    drawFooter(ctx, page, totalPages, height - footerHeight, footerHeight, width, colors);

    return canvas.toBuffer('image/png');
}

/**
 * Draw header section
 */
async function drawHeader(ctx, guild, type, totalUsers, colors, width, height) {
    const padding = 30;

    // Server icon
    try {
        const iconURL = guild.iconURL({ extension: 'png', size: 128 });
        if (iconURL) {
            const icon = await loadImage(iconURL);
            const iconSize = 80;
            const iconX = padding;
            const iconY = (height - iconSize) / 2;

            // Icon border
            ctx.save();
            ctx.beginPath();
            ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2 + 3, 0, Math.PI * 2);
            ctx.fillStyle = colors.accent;
            ctx.fill();

            // Icon circle
            ctx.beginPath();
            ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
            ctx.restore();
        }
    } catch (err) {
        console.error('[Leaderboard] Error loading server icon:', err.message);
    }

    // Title
    const titleX = padding + 100;
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 42px Arial';
    const typeText = type === 'text' ? 'TEXT' : 'VOICE';
    ctx.fillText(`${typeText} LEADERBOARD`, titleX, 55);

    // Server name
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '24px Arial';
    ctx.fillText(guild.name, titleX, 90);

    // Stats
    ctx.font = '20px Arial';
    ctx.fillText(`${totalUsers} Users`, titleX, 120);
}

/**
 * Draw user row
 */
async function drawUserRow(ctx, user, y, rowHeight, width, colors, theme, index) {
    const padding = 30;
    const isEven = index % 2 === 0;

    // Alternating background
    if (isEven) {
        ctx.fillStyle = colors.bgAlt;
        ctx.fillRect(0, y, width, rowHeight);
    }

    // Rank with medal for top 3
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 32px Arial';
    const rankText = user.rank <= 3 ? getMedal(user.rank) : `#${user.rank}`;
    ctx.fillText(rankText, padding, y + 45);

    // Avatar
    try {
        const avatarSize = 60;
        const avatarX = padding + 80;
        const avatarY = y + (rowHeight - avatarSize) / 2;

        const avatar = await loadImage(user.avatarURL);

        // Avatar border
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
        ctx.fillStyle = colors.accent;
        ctx.fill();

        // Avatar circle
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
    } catch (err) {
        // Fallback: colored circle
        const avatarSize = 60;
        const avatarX = padding + 80;
        const avatarY = y + (rowHeight - avatarSize) / 2;
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Username
    const usernameX = padding + 160;
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(user.username, usernameX, y + 35);

    // Level badge
    const levelText = `Lvl ${user.level}`;
    ctx.font = 'bold 20px Arial';
    const levelWidth = ctx.measureText(levelText).width;
    const levelX = usernameX;
    const levelY = y + 65;

    ctx.fillStyle = colors.accent;
    roundRect(ctx, levelX - 8, levelY - 18, levelWidth + 16, 26, 6);
    ctx.fill();

    ctx.fillStyle = theme === 'light' ? colors.bg : '#ffffff';
    ctx.fillText(levelText, levelX, levelY);

    // XP and progress bar
    const barX = usernameX + levelWidth + 40;
    const barY = y + 50;
    const barWidth = width - barX - padding - 150;
    const barHeight = 30;

    // Progress bar background
    ctx.fillStyle = colors.progressBg;
    roundRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();

    // Progress bar fill
    const progress = user.nextLevelXP > 0 ? (user.currentXP / user.nextLevelXP) : 0;
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
    ctx.font = 'bold 18px Arial';
    const xpText = `${formatNumber(user.currentXP)} / ${formatNumber(user.nextLevelXP)} XP`;
    const xpWidth = ctx.measureText(xpText).width;
    ctx.fillText(xpText, barX + (barWidth - xpWidth) / 2, barY + 20);

    // Total XP (right side)
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '16px Arial';
    const totalXPText = `${formatNumber(user.totalXP)} Total`;
    ctx.fillText(totalXPText, width - padding - ctx.measureText(totalXPText).width, y + 65);
}

/**
 * Draw footer section
 */
function drawFooter(ctx, page, totalPages, y, height, width, colors) {
    // Separator line
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(width - 30, y);
    ctx.stroke();

    // Page indicator
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 24px Arial';
    const pageText = `Page ${page} / ${totalPages}`;
    const pageWidth = ctx.measureText(pageText).width;
    ctx.fillText(pageText, (width - pageWidth) / 2, y + 45);

    // Timestamp
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '18px Arial';
    const now = new Date();
    const timeText = `Updated: ${now.toLocaleTimeString()}`;
    const timeWidth = ctx.measureText(timeText).width;
    ctx.fillText(timeText, width - 30 - timeWidth, y + 45);
}

/**
 * Helper: Get medal emoji for top 3
 */
function getMedal(rank) {
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    return medals[rank] || `#${rank}`;
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
    generateLeaderboard
};
