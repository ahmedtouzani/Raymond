const logger = require('../utils/logger');
const db = require('./database');

/**
 * Advanced Invite Tracking Service
 * Tracks invites with smart bypass detection
 */
class InviteTracker {
    constructor() {
        // In-memory cache: Map<guildId, Map<inviteCode, inviteData>>
        this.inviteCache = new Map();
    }

    /**
     * Cache all invites for a guild
     */
    async cacheGuildInvites(guild) {
        try {
            const invites = await guild.invites.fetch();
            const inviteMap = new Map();

            for (const [code, invite] of invites) {
                inviteMap.set(code, {
                    code: invite.code,
                    uses: invite.uses || 0,
                    maxUses: invite.maxUses || 0,
                    inviterId: invite.inviter?.id || null,
                    expiresAt: invite.expiresAt,
                    createdAt: invite.createdAt
                });

                // Store in database
                await this.saveInviteToDb(guild.id, invite);
            }

            this.inviteCache.set(guild.id, inviteMap);
            logger.info(`Cached ${invites.size} invites for guild ${guild.name}`);
            return inviteMap;
        } catch (error) {
            logger.error(`Failed to cache invites for guild ${guild.id}:`, error);
            return new Map();
        }
    }

    /**
     * Save invite to database
     */
    async saveInviteToDb(guildId, invite) {
        try {
            await db.query(`
        INSERT INTO invite_tracking (guild_id, invite_code, inviter_id, uses, max_uses, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (guild_id, invite_code) 
        DO UPDATE SET uses = EXCLUDED.uses, inviter_id = EXCLUDED.inviter_id
      `, [
                guildId,
                invite.code,
                invite.inviter?.id || null,
                invite.uses || 0,
                invite.maxUses || 0,
                invite.expiresAt
            ]);
        } catch (error) {
            logger.error('Failed to save invite to database:', error);
        }
    }

    /**
     * Find which invite was used (smart detection)
     */
    async findUsedInvite(guild, member) {
        try {
            const cachedInvites = this.inviteCache.get(guild.id);
            if (!cachedInvites) {
                logger.warn(`No cached invites for guild ${guild.id}, recaching...`);
                await this.cacheGuildInvites(guild);
                return { method: 'unknown', inviter: null, code: null };
            }

            // Fetch current invites
            const currentInvites = await guild.invites.fetch();

            const increased = [...currentInvites.values()].filter(invite => {
                const cached = cachedInvites.get(invite.code);
                return cached && invite.uses > cached.uses;
            });
            if (increased.length > 1 || increased.some(invite => invite.uses - cachedInvites.get(invite.code).uses > 1)) {
                await this.cacheGuildInvites(guild);
                const result = { method: 'unknown', inviter: null, code: null };
                await this.saveMemberInvite(guild.id, member.id, result);
                return result;
            }

            // Compare uses to find which invite was used
            for (const [code, currentInvite] of currentInvites) {
                const cachedInvite = cachedInvites.get(code);

                if (cachedInvite && currentInvite.uses > cachedInvite.uses) {
                    // This invite was used!
                    const result = {
                        method: 'invite',
                        inviter: currentInvite.inviter,
                        inviterId: currentInvite.inviter?.id,
                        code: currentInvite.code,
                        uses: currentInvite.uses
                    };

                    // Update cache
                    cachedInvites.set(code, {
                        code: currentInvite.code,
                        uses: currentInvite.uses,
                        maxUses: currentInvite.maxUses,
                        inviterId: currentInvite.inviter?.id,
                        expiresAt: currentInvite.expiresAt,
                        createdAt: currentInvite.createdAt
                    });

                    // Save to database
                    await this.saveInviteToDb(guild.id, currentInvite);
                    await this.saveMemberInvite(guild.id, member.id, result);

                    return result;
                }
            }

            // Check for vanity URL
            if (guild.vanityURLCode) {
                const vanityInvite = currentInvites.find(inv => inv.code === guild.vanityURLCode);
                if (vanityInvite) {
                    const cachedVanity = cachedInvites.get(guild.vanityURLCode);
                    if (!cachedVanity || vanityInvite.uses > cachedVanity.uses) {
                        const result = {
                            method: 'vanity',
                            inviter: null,
                            inviterId: null,
                            code: guild.vanityURLCode,
                            uses: vanityInvite.uses
                        };
                        await this.saveMemberInvite(guild.id, member.id, result);
                        return result;
                    }
                }
            }

            // Check if a new invite was created (bypass detection)
            const newUsedInvites = [...currentInvites.values()].filter(invite => !cachedInvites.has(invite.code) && invite.uses === 1);
            for (const [code, currentInvite] of currentInvites) {
                if (!cachedInvites.has(code) && currentInvite.uses === 1 && newUsedInvites.length === 1) {
                    // New invite detected - likely created just for this user
                    const result = {
                        method: 'new_invite',
                        inviter: currentInvite.inviter,
                        inviterId: currentInvite.inviter?.id,
                        code: currentInvite.code,
                        uses: currentInvite.uses,
                        suspicious: true // Flag as potentially suspicious
                    };

                    cachedInvites.set(code, {
                        code: currentInvite.code,
                        uses: currentInvite.uses,
                        maxUses: currentInvite.maxUses,
                        inviterId: currentInvite.inviter?.id,
                        expiresAt: currentInvite.expiresAt,
                        createdAt: currentInvite.createdAt
                    });

                    await this.saveInviteToDb(guild.id, currentInvite);
                    await this.saveMemberInvite(guild.id, member.id, result);

                    return result;
                }
            }

            // No invite found - could be OAuth2, widget, discovery, etc.
            const result = {
                method: 'unknown',
                inviter: null,
                inviterId: null,
                code: null,
                possibleMethods: ['oauth2', 'widget', 'discovery', 'deleted_invite']
            };
            await this.saveMemberInvite(guild.id, member.id, result);

            return result;

        } catch (error) {
            logger.error('Error finding used invite:', error);
            return { method: 'error', inviter: null, code: null, error: error.message };
        }
    }

    /**
     * Save member invite data to database
     */
    async saveMemberInvite(guildId, memberId, inviteData) {
        try {
            await db.query(`
        INSERT INTO member_invites (guild_id, member_id, inviter_id, invite_code, join_method)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (guild_id, member_id) DO UPDATE 
        SET inviter_id = EXCLUDED.inviter_id, 
            invite_code = EXCLUDED.invite_code,
            join_method = EXCLUDED.join_method,
            joined_at = CURRENT_TIMESTAMP
      `, [
                guildId,
                memberId,
                inviteData.inviterId || null,
                inviteData.code || null,
                inviteData.method || 'unknown'
            ]);
        } catch (error) {
            logger.error('Failed to save member invite:', error);
        }
    }

    /**
     * Get who invited a member
     */
    async getInviter(guildId, memberId) {
        try {
            const result = await db.query(
                'SELECT inviter_id, invite_code, join_method FROM member_invites WHERE guild_id = $1 AND member_id = $2',
                [guildId, memberId]
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to get inviter:', error);
            return null;
        }
    }

    /**
     * Get invite statistics for a user
     */
    async getInviteStats(guildId, userId) {
        try {
            const result = await db.query(
                'SELECT COUNT(*) as total_invites FROM member_invites WHERE guild_id = $1 AND inviter_id = $2',
                [guildId, userId]
            );
            return parseInt(result.rows[0]?.total_invites || 0);
        } catch (error) {
            logger.error('Failed to get invite stats:', error);
            return 0;
        }
    }

    /**
     * Handle invite create event
     */
    async onInviteCreate(invite) {
        try {
            const guildInvites = this.inviteCache.get(invite.guild.id);
            if (guildInvites) {
                guildInvites.set(invite.code, {
                    code: invite.code,
                    uses: invite.uses || 0,
                    maxUses: invite.maxUses || 0,
                    inviterId: invite.inviter?.id || null,
                    expiresAt: invite.expiresAt,
                    createdAt: invite.createdAt
                });
            }
            await this.saveInviteToDb(invite.guild.id, invite);
            logger.info(`Invite created: ${invite.code} by ${invite.inviter?.tag || 'Unknown'}`);
        } catch (error) {
            logger.error('Error handling invite create:', error);
        }
    }

    /**
     * Handle invite delete event
     */
    async onInviteDelete(invite) {
        try {
            const guildInvites = this.inviteCache.get(invite.guild.id);
            if (guildInvites) {
                guildInvites.delete(invite.code);
            }
            logger.info(`Invite deleted: ${invite.code}`);
        } catch (error) {
            logger.error('Error handling invite delete:', error);
        }
    }
}

// Export singleton instance
module.exports = new InviteTracker();
