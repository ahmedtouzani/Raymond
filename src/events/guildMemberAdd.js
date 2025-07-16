const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../database/guildConfig');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            const { guild, user } = member;
            
            // 1. Assign auto role if set
            try {
                const guildConfig = await getGuildConfig(guild.id);
                if (guildConfig?.auto_role_id) {
                    const role = guild.roles.cache.get(guildConfig.auto_role_id);
                    if (role) {
                        await member.roles.add(role);
                        logger.info(`Assigned auto role ${role.name} to ${user.tag}`);
                    }
                }
            } catch (error) {
                logger.error(`Error assigning auto role to ${user.tag}:`, error);
            }

            // 2. Send welcome message to log channel if set
            try {
                const guildConfig = await getGuildConfig(guild.id);
                if (!guildConfig?.welcome_channel_id) return;
                
                const channel = guild.channels.cache.get(guildConfig.welcome_channel_id);
                if (!channel) return;

                const accountAge = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
                
                const welcomeEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setAuthor({ 
                        name: `${user.tag} has joined`, 
                        iconURL: user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setDescription(`Welcome ${user} to **${guild.name}**!`)
                    .addFields(
                        { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Account Age', value: `${accountAge} days`, inline: true },
                        { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                    )
                    .setFooter({ text: `User ID: ${user.id}` })
                    .setTimestamp();

                await channel.send({ embeds: [welcomeEmbed] });
                
            } catch (error) {
                logger.error('Error sending welcome message:', error);
            }
            
        } catch (error) {
            logger.error('Error in guildMemberAdd event:', error);
        }
    },
};
