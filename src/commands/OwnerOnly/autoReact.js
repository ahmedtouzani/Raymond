const { EmbedBuilder } = require('discord.js');
const { addAutoReaction, removeAutoReaction, getAutoReactionsForGuild } = require('../../database/autoReactSettings');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');

module.exports = {
    name: 'autoreact',
    aliases: ['ar'],
    description: 'Manages auto-reactions for users or channels.',
    usage: '=autoreact <add|remove|list> <user|channel> <@user|#channel> <emoji>',
    category: 'OwnerOnly',
    
    async execute(message, args, client) {
        if (message.author.id !== process.env.OWNER_ID) {
            return sendEmbed(message, {
                title: '🚫 Permission Denied',
                description: 'This command is for the bot owner only.',
                color: 0x23272A,
            });
        }

        const subcommand = args[0]?.toLowerCase();
        const type = args[1]?.toLowerCase();
        const emoji = args[args.length - 1];
        const targetMention = message.mentions.users.first() || message.mentions.channels.first();

        switch (subcommand) {
            case 'add':
                await handleAdd(message, type, targetMention, emoji);
                break;
            case 'remove':
                await handleRemove(message, type, targetMention, emoji);
                break;
            case 'list':
                await handleList(message);
                break;
            default:
                return sendEmbed(message, {
                    title: '❓ Invalid Usage',
                    description: 'Please use `add`, `remove`, or `list`.',
                    usage: this.usage,
                    color: 0x23272A,
                });
        }
    },
};

async function handleAdd(message, type, targetMention, emoji) {
    if (!type || !targetMention || !emoji) {
        return sendEmbed(message, { title: 'Invalid `add` usage', description: 'Usage: `=autoreact add <user|channel> <@user|#channel> <emoji>`' });
    }

    if (type !== 'user' && type !== 'channel') {
        return sendEmbed(message, { title: 'Invalid Type', description: 'Type must be `user` or `channel`.' });
    }

    const added = await addAutoReaction(message.guild.id, targetMention.id, type, emoji);
    if (added) {
        return sendEmbed(message, { title: '✅ Success', description: `Now auto-reacting to ${targetMention} with ${emoji}.` });
    } else {
        return sendEmbed(message, { title: 'Already Exists', description: `I am already set to react to ${targetMention} with ${emoji}.` });
    }
}

async function handleRemove(message, type, targetMention, emoji) {
    if (!type || !targetMention || !emoji) {
        return sendEmbed(message, { title: 'Invalid `remove` usage', description: 'Usage: `=autoreact remove <user|channel> <@user|#channel> <emoji>`' });
    }
    
    if (type !== 'user' && type !== 'channel') {
        return sendEmbed(message, { title: 'Invalid Type', description: 'Type must be `user` or `channel`.' });
    }

    const removed = await removeAutoReaction(message.guild.id, targetMention.id, emoji);
    if (removed) {
        return sendEmbed(message, { title: '✅ Success', description: `Stopped auto-reacting to ${targetMention} with ${emoji}.` });
    } else {
        return sendEmbed(message, { title: 'Not Found', description: `I was not configured to react to ${targetMention} with ${emoji}.` });
    }
}

async function handleList(message) {
    const reactions = await getAutoReactionsForGuild(message.guild.id);
    if (reactions.length === 0) {
        return sendEmbed(message, { title: 'Auto-Reactions', description: 'No auto-reactions are configured for this server.' });
    }

    const embed = new EmbedBuilder()
        .setTitle('Configured Auto-Reactions')
        .setColor(0x23272A)
        .setTimestamp();

    const userReactions = reactions.filter(r => r.target_type === 'user');
    const channelReactions = reactions.filter(r => r.target_type === 'channel');

    if (userReactions.length > 0) {
        embed.addFields({ name: 'User Reactions', value: userReactions.map(r => `<@${r.target_id}>: ${r.emoji}`).join('\n'), inline: true });
    }

    if (channelReactions.length > 0) {
        embed.addFields({ name: 'Channel Reactions', value: channelReactions.map(r => `<#${r.target_id}>: ${r.emoji}`).join('\n'), inline: true });
    }

    message.channel.send({ embeds: [embed] });
}