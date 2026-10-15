const { getStatsChannels, updateLastUpdate } = require('../database/statsChannels');
const logger = require('../utils/logger');

/**
 * Stats Updater Service
 * Updates member and voice count channels with rate limiting
 */
class StatsUpdater {
    constructor() {
        // Rate limiting: minimum 5 minutes between updates per guild
        this.UPDATE_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
        this.lastUpdates = new Map(); // guildId -> { member: timestamp, voice: timestamp }
    }

    /**
     * Check if update is allowed (rate limiting)
     */
    canUpdate(guildId, type) {
        const lastUpdate = this.lastUpdates.get(guildId)?.[type];
        if (!lastUpdate) return true;

        const timeSinceUpdate = Date.now() - lastUpdate;
        return timeSinceUpdate >= this.UPDATE_COOLDOWN;
    }

    /**
     * Mark update as completed
     */
    markUpdated(guildId, type) {
        if (!this.lastUpdates.has(guildId)) {
            this.lastUpdates.set(guildId, {});
        }
        this.lastUpdates.get(guildId)[type] = Date.now();
    }


    /**
     * Update member count channel
     */
    async updateMemberCount(guild) {
        try {
            const config = await getStatsChannels(guild.id);
            if (!config || !config.member_count_channel_id) return;

            // Rate limiting check
            if (!this.canUpdate(guild.id, 'member')) {
                logger.debug(`Skipping member count update for ${guild.name} (rate limited)`);
                return;
            }

            const channel = guild.channels.cache.get(config.member_count_channel_id);
            if (!channel) {
                logger.warn(`Member count channel not found for guild ${guild.name}`);
                return;
            }

            const memberCount = guild.memberCount;

            // Get base name (remove any existing count)
            let baseName = config.member_count_format || channel.name;
            // Remove any existing count pattern like ": 123" or " - 123" at the end
            baseName = baseName.replace(/[:\-]\s*\d{1,}$/, '').trim();

            // Append new count
            const newName = (baseName.includes('{count}')
                ? baseName.replaceAll('{count}', memberCount.toLocaleString())
                : `${baseName}: ${memberCount.toLocaleString()}`).slice(0, 100);

            // Only update if name changed
            if (channel.name !== newName) {
                await channel.setName(newName);
                await updateLastUpdate(guild.id, 'member');
                this.markUpdated(guild.id, 'member');
                logger.info(`Updated member count for ${guild.name}: ${memberCount}`);
            }
        } catch (error) {
            // Discord API rate limit error
            if (error.code === 50013) {
                logger.error(`Missing permissions to update member count channel in ${guild.name}`);
            } else {
                logger.error(`Error updating member count for ${guild.name}:`, error);
            }
        }
    }


    /**
     * Update voice count channel
     */
    async updateVoiceCount(guild) {
        try {
            const config = await getStatsChannels(guild.id);
            if (!config || !config.voice_count_channel_id) return;

            // Rate limiting check
            if (!this.canUpdate(guild.id, 'voice')) {
                logger.debug(`Skipping voice count update for ${guild.name} (rate limited)`);
                return;
            }

            const channel = guild.channels.cache.get(config.voice_count_channel_id);
            if (!channel) {
                logger.warn(`Voice count channel not found for guild ${guild.name}`);
                return;
            }

            // Count members in voice channels
            let voiceCount = 0;
            guild.channels.cache.forEach(ch => {
                if (ch.isVoiceBased() && ch.members) {
                    voiceCount += ch.members.size;
                }
            });

            // Get base name (remove any existing count)
            let baseName = config.voice_count_format || channel.name;
            // Remove any existing count pattern like ": 123" or " - 123" at the end
            baseName = baseName.replace(/[:\-]\s*\d{1,}$/, '').trim();

            // Append new count
            const newName = (baseName.includes('{count}')
                ? baseName.replaceAll('{count}', voiceCount.toLocaleString())
                : `${baseName}: ${voiceCount.toLocaleString()}`).slice(0, 100);

            // Only update if name changed
            if (channel.name !== newName) {
                await channel.setName(newName);
                await updateLastUpdate(guild.id, 'voice');
                this.markUpdated(guild.id, 'voice');
                logger.info(`Updated voice count for ${guild.name}: ${voiceCount}`);
            }
        } catch (error) {
            // Discord API rate limit error
            if (error.code === 50013) {
                logger.error(`Missing permissions to update voice count channel in ${guild.name}`);
            } else {
                logger.error(`Error updating voice count for ${guild.name}:`, error);
            }
        }
    }

    /**
     * Update all stats for a guild
     */
    async updateAll(guild) {
        await this.updateMemberCount(guild);
        await this.updateVoiceCount(guild);
    }

    /**
     * Force update (bypass rate limiting) - use sparingly
     */
    async forceUpdate(guild, type = 'all') {
        if (type === 'all' || type === 'member') {
            this.lastUpdates.get(guild.id)?.member && delete this.lastUpdates.get(guild.id).member;
            await this.updateMemberCount(guild);
        }
        if (type === 'all' || type === 'voice') {
            this.lastUpdates.get(guild.id)?.voice && delete this.lastUpdates.get(guild.id).voice;
            await this.updateVoiceCount(guild);
        }
    }
}

// Export singleton instance
module.exports = new StatsUpdater();
