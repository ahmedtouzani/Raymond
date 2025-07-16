const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { deleteWarning, deleteAllWarnings, getWarningByIdGuildUser } = require('../../database/warns');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
    name: 'delwarn',
    description: 'Delete a specific warning by ID or all warnings for a user.',
    usage: '=delwarn @user [warningID|all]',
    cooldown: 5,
    permissions: [PermissionsBitField.Flags.KickMembers],
    category: 'Moderation',

    async execute(message, args, client) {
        const ownerId = process.env.OWNER_ID;
        const isOwner = message.author.id === ownerId;

        if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'You need the **Kick Members** permission to use this command.',
                color: 0x23272A,
            });
        }

        if (!args[0]) {
            return sendEmbed(message, {
                title: '❓ User Not Specified',
                description: 'Please mention a user to delete warnings for.',
                color: 0x23272A,
            });
        }

        let member = message.mentions.members.first();

        if (!member) {
            try {
                member = await message.guild.members.fetch(args[0]);
            } catch {
                return sendEmbed(message, {
                    title: '❓ User Not Found',
                    description: 'Could not find the user in this server. Please mention them or provide a valid user ID.',
                    color: 0x23272A,
                });
            }
        }

        if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
            return sendEmbed(message, {
                title: 'Action Denied',
                description: 'You cannot perform this action on the bot itself.',
                color: 0x23272A,
            });
        }

        const action = args[1]?.toLowerCase();

        if (!action) {
            return sendEmbed(message, {
                title: '❓ Warning ID or "all" Required',
                description: 'Specify the warning ID to delete a single warning, or "all" to delete all warnings for this user.',
                color: 0x23272A,
            });
        }

        try {
            if (action === 'all') {
                await deleteAllWarnings(message.guild.id, member.id);
                return sendEmbed(message, {
                    title: '✅ All Warnings Deleted',
                    description: `All warnings for **${member.user.tag}** have been deleted.`,
                    color: 0x23272A,
                });
            }

            const warningId = parseInt(action, 10);
            if (isNaN(warningId)) {
                return sendEmbed(message, {
                    title: '❌ Invalid Warning ID',
                    description: 'Please provide a valid warning ID number or "all".',
                    color: 0x23272A,
                });
            }

            // Use your helper to check if the warning exists and belongs to the user/guild
            const warning = await getWarningByIdGuildUser(warningId, message.guild.id, member.id);
            if (!warning) {
                return sendEmbed(message, {
                    title: '❌ Warning Not Found',
                    description: `No warning with ID **${warningId}** found for **${member.user.tag}** in this server.`,
                    color: 0x23272A,
                });
            }

            await deleteWarning(warningId);

            return sendEmbed(message, {
                title: '<:Done:1305644486453493801> Warning Deleted',
                description: `Warning ID **${warningId}** for **${member.user.tag}** has been deleted.`,
                color: 0x23272A,
            });
        } catch (error) {
            return sendEmbed(message, {
                title: '❌ Error',
                description: `Failed to delete warning.\n\`\`\`${error.message}\`\`\``,
                color: 0x23272A,
            });
        }
    },
};
