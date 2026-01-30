const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../database/guildConfig');
const { getAutoRoleSettings } = require('../database/autoRole');
const inviteTracker = require('../services/inviteTracker');
const statsUpdater = require('../services/statsUpdater');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            const { guild, user } = member;

            // Track invite used (smart detection with bypass tracking)
            const inviteData = await inviteTracker.findUsedInvite(guild, member);

            // 1. Assign auto role if set
            let autoRole = null;
            try {
                const autoRoleSettings = await getAutoRoleSettings(guild.id);
                if (autoRoleSettings?.role_id) {
                    const role = guild.roles.cache.get(autoRoleSettings.role_id);
                    if (role) {
                        await member.roles.add(role);
                        autoRole = role;
                        logger.info(`Assigned auto role ${role.name} to ${user.tag}`);
                    }
                }
            } catch (error) {
                logger.error(`Error assigning auto role to ${user.tag}:`, error);
            }

            // 2. Send comprehensive join log
            try {
                const autoRoleSettings = await getAutoRoleSettings(guild.id);
                if (!autoRoleSettings?.member_join_log_channel_id) return;

                const logChannel = guild.channels.cache.get(autoRoleSettings.member_join_log_channel_id);
                if (!logChannel) return;

                const accountAge = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
                const isNewAccount = accountAge < 7;
                const isSuspicious = inviteData.suspicious || isNewAccount;

                // Build invite information
                let inviteInfo = '';
                let inviterField = { name: '👤 Invited By', value: 'Unknown', inline: true };

                if (inviteData.method === 'invite' || inviteData.method === 'new_invite') {
                    if (inviteData.inviter) {
                        inviterField.value = `${inviteData.inviter} (${inviteData.inviter.tag})`;
                        inviteInfo = `**Code:** \`${inviteData.code}\`\n**Uses:** ${inviteData.uses}`;

                        // Get total invites by this user
                        const totalInvites = await inviteTracker.getInviteStats(guild.id, inviteData.inviterId);
                        inviteInfo += `\n**Total Invites:** ${totalInvites}`;
                    } else {
                        inviterField.value = `Unknown (Code: \`${inviteData.code}\`)`;
                    }

                    if (inviteData.method === 'new_invite') {
                        inviteInfo += '\n⚠️ **New invite detected** (created recently)';
                    }
                } else if (inviteData.method === 'vanity') {
                    inviterField.value = '✨ Vanity URL';
                    inviteInfo = `**Code:** \`${guild.vanityURLCode}\``;
                } else if (inviteData.method === 'unknown') {
                    inviterField.value = '❓ Unknown';
                    inviteInfo = 'Possible methods: OAuth2, Widget, Discovery, or deleted invite';
                } else if (inviteData.method === 'error') {
                    inviterField.value = '⚠️ Error tracking';
                    inviteInfo = `Error: ${inviteData.error}`;
                }

                // Create comprehensive join log embed
                const joinEmbed = new EmbedBuilder()
                    .setColor(isSuspicious ? '#ED4245' : '#57F287') // Red if suspicious, green otherwise
                    .setAuthor({
                        name: `${user.tag} joined the server`,
                        iconURL: user.displayAvatarURL({ dynamic: true })
                    })
                    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setDescription(`${user} has joined **${guild.name}**!`)
                    .addFields(
                        { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: '⏰ Account Age', value: `${accountAge} days${isNewAccount ? ' ⚠️' : ''}`, inline: true },
                        { name: '👥 Member Count', value: `${guild.memberCount}`, inline: true }
                    );

                // Add inviter information
                if (inviteInfo) {
                    joinEmbed.addFields(
                        inviterField,
                        { name: '🔗 Invite Details', value: inviteInfo, inline: true },
                        { name: '\u200B', value: '\u200B', inline: true } // Spacer
                    );
                } else {
                    joinEmbed.addFields(inviterField);
                }

                // Add auto-role information
                if (autoRole) {
                    joinEmbed.addFields({
                        name: '🎭 Auto Role Assigned',
                        value: `${autoRole}`,
                        inline: true
                    });
                }

                // Add warning for suspicious joins
                if (isSuspicious) {
                    const warnings = [];
                    if (isNewAccount) warnings.push('⚠️ New account (< 7 days)');
                    if (inviteData.suspicious) warnings.push('⚠️ Suspicious invite pattern');

                    joinEmbed.addFields({
                        name: '⚠️ Security Alerts',
                        value: warnings.join('\n'),
                        inline: false
                    });
                }

                joinEmbed
                    .setFooter({ text: `User ID: ${user.id}` })
                    .setTimestamp();

                await logChannel.send({ embeds: [joinEmbed] });

            } catch (error) {
                logger.error('Error sending join log:', error);
            }

            // Update member count stats
            await statsUpdater.updateMemberCount(guild);

        } catch (error) {
            logger.error('Error in guildMemberAdd event:', error);
        }
    },
};
