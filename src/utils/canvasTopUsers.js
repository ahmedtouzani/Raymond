const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

/**
 * Generate a Canvas-based top users display (podium style)
 * @param {Object} options - Display options
 * @param {Array} options.users - Top 3 users with rank, username, level, xp, avatar
 * @param {Object} options.guild - Guild object
 * @param {string} options.type - 'text', 'voice', or 'combined'
 * @param {string} options.theme - Theme name ('dark', 'light', 'neon', 'gradient')
 * @returns {Buffer} PNG image buffer
 */
async function generateTopUsers(options) {
    const {
        users = [],
        guild,
        type = 'text',
        theme = 'dark'
    } = options;

    // Register bundled font
    try {
        const bundledFontPath = path.join(__dirname, '../../fonts/Arial.ttf');
        if (fs.existsSync(bundledFontPath)) {
            GlobalFonts.registerFromPath(bundledFontPath, 'Arial');
        }
    } catch (err) {
        console.error('[TopUsers] Font registration error:', err.message);
    }

    // Canvas dimensions
    const width = 1200;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Theme colors
    const themes = {
        dark: {
            bg: '#1a1d23',
            bgGradient: '#23272a',
            border: '#40444b',
            text: '#ffffff',
            textSecondary: '#b9bbbe',
            accent: '#5865f2',
            gold: '#ffd700',
            silver: '#c0c0c0',
            bronze: '#cd7f32'
        },
        light: {
            bg: '#ffffff',
            bgGradient: '#f6f6f7',
            border: '#dcddde',
            text: '#2c2f33',
            textSecondary: '#747f8d',
            accent: '#5865f2',
            gold: '#ffd700',
            silver: '#c0c0c0',
            bronze: '#cd7f32'
        },
        neon: {
            bg: '#0a0e27',
            bgGradient: '#1a1f3a',
            border: '#ff00ff',
            text: '#00ffff',
            textSecondary: '#ff00ff',
            accent: '#00ffff',
            gold: '#ffff00',
            silver: '#00ffff',
            bronze: '#ff6600'
        },
        gradient: {
            bg: '#667eea',
            bgGradient: '#764ba2',
            border: '#ffffff',
            text: '#ffffff',
            textSecondary: '#f0f0f0',
            accent: '#ffffff',
            gold: '#ffe066',
            silver: '#e0e0e0',
            bronze: '#ff9966'
        }
    };

    const colors = themes[theme] || themes.dark;

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, colors.bg);
    bgGradient.addColorStop(1, colors.bgGradient);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    // === HEADER ===
    await drawHeader(ctx, guild, type, colors, width);

    // === PODIUM (Top 3) ===
    if (users.length > 0) {
        await drawPodium(ctx, users, colors, theme, width, height);
    } else {
        // No users message
        ctx.fillStyle = colors.textSecondary;
        ctx.font = '32px Arial';
        const noDataText = 'No ranking data available yet';
        const textWidth = ctx.measureText(noDataText).width;
        ctx.fillText(noDataText, (width - textWidth) / 2, height / 2);
    }

    return canvas.toBuffer('image/png');
}

/**
 * Draw header section
 */
async function drawHeader(ctx, guild, type, colors, width) {
    const padding = 40;
    const headerHeight = 120;

    // Server icon
    try {
        const iconURL = guild.iconURL({ extension: 'png', size: 128 });
        if (iconURL) {
            const icon = await loadImage(iconURL);
            const iconSize = 70;
            const iconX = padding;
            const iconY = padding;

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
        console.error('[TopUsers] Error loading server icon:', err.message);
    }

    // Title
    const titleX = padding + 90;
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 48px Arial';
    const typeText = type === 'text' ? 'TEXT' : type === 'voice' ? 'VOICE' : 'COMBINED';
    ctx.fillText(`TOP ${typeText} USERS`, titleX, 60);

    // Subtitle
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '24px Arial';
    ctx.fillText(guild.name, titleX, 95);
}

/**
 * Draw podium with top 3 users
 */
async function drawPodium(ctx, users, colors, theme, width, height) {
    const podiumY = 200;
    const podiumWidth = 300;
    const podiumSpacing = 50;

    // Podium heights (2nd, 1st, 3rd)
    const heights = {
        1: 350, // 1st place - tallest
        2: 280, // 2nd place
        3: 220  // 3rd place
    };

    // Podium colors
    const podiumColors = {
        1: colors.gold,
        2: colors.silver,
        3: colors.bronze
    };

    // Order: 2nd, 1st, 3rd (visual podium layout)
    const positions = [
        { rank: 2, x: 50 },
        { rank: 1, x: 50 + podiumWidth + podiumSpacing },
        { rank: 3, x: 50 + (podiumWidth + podiumSpacing) * 2 }
    ];

    for (const pos of positions) {
        const user = users.find(u => u.rank === pos.rank);
        if (!user) continue;

        const podiumHeight = heights[pos.rank];
        const podiumX = pos.x;
        const podiumBottom = height - 100;
        const podiumTop = podiumBottom - podiumHeight;

        // Draw podium base
        const gradient = ctx.createLinearGradient(podiumX, podiumTop, podiumX, podiumBottom);
        gradient.addColorStop(0, podiumColors[pos.rank]);
        gradient.addColorStop(1, adjustBrightness(podiumColors[pos.rank], -30));
        ctx.fillStyle = gradient;
        roundRect(ctx, podiumX, podiumTop, podiumWidth, podiumHeight, 15);
        ctx.fill();

        // Podium border
        ctx.strokeStyle = adjustBrightness(podiumColors[pos.rank], 20);
        ctx.lineWidth = 3;
        roundRect(ctx, podiumX, podiumTop, podiumWidth, podiumHeight, 15);
        ctx.stroke();

        // Rank number on podium
        ctx.fillStyle = theme === 'light' ? colors.bg : '#ffffff';
        ctx.font = 'bold 72px Arial';
        const rankText = `${pos.rank}`;
        const rankWidth = ctx.measureText(rankText).width;
        ctx.fillText(rankText, podiumX + (podiumWidth - rankWidth) / 2, podiumBottom - 40);

        // User avatar (above podium)
        const avatarSize = pos.rank === 1 ? 140 : 110;
        const avatarX = podiumX + (podiumWidth - avatarSize) / 2;
        const avatarY = podiumTop - avatarSize - 20;

        try {
            const avatar = await loadImage(user.avatarURL);

            // Avatar glow
            ctx.save();
            ctx.shadowColor = podiumColors[pos.rank];
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
            ctx.fillStyle = podiumColors[pos.rank];
            ctx.fill();
            ctx.restore();

            // Avatar circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        } catch (err) {
            // Fallback: colored circle
            ctx.fillStyle = podiumColors[pos.rank];
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Crown for 1st place
        if (pos.rank === 1) {
            ctx.fillStyle = colors.gold;
            ctx.font = '48px Arial';
            const crown = '👑';
            const crownWidth = ctx.measureText(crown).width;
            ctx.fillText(crown, avatarX + (avatarSize - crownWidth) / 2, avatarY - 10);
        }

        // Username
        ctx.fillStyle = colors.text;
        ctx.font = pos.rank === 1 ? 'bold 28px Arial' : 'bold 24px Arial';
        const username = truncateText(ctx, user.username, podiumWidth - 20);
        const usernameWidth = ctx.measureText(username).width;
        ctx.fillText(username, podiumX + (podiumWidth - usernameWidth) / 2, avatarY - (pos.rank === 1 ? 60 : 40));

        // Level
        ctx.fillStyle = colors.textSecondary;
        ctx.font = pos.rank === 1 ? '22px Arial' : '18px Arial';
        const levelText = `Level ${user.level}`;
        const levelWidth = ctx.measureText(levelText).width;
        ctx.fillText(levelText, podiumX + (podiumWidth - levelWidth) / 2, podiumTop - 20);

        // XP
        ctx.font = pos.rank === 1 ? '20px Arial' : '16px Arial';
        const xpText = `${formatNumber(user.totalXP)} XP`;
        const xpWidth = ctx.measureText(xpText).width;
        ctx.fillText(xpText, podiumX + (podiumWidth - xpWidth) / 2, podiumTop - (pos.rank === 1 ? 45 : 40));
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

/**
 * Helper: Truncate text to fit width
 */
function truncateText(ctx, text, maxWidth) {
    const width = ctx.measureText(text).width;
    if (width <= maxWidth) return text;

    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

/**
 * Helper: Adjust color brightness
 */
function adjustBrightness(color, amount) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

module.exports = {
    generateTopUsers
};
