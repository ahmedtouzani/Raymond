const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  name: 'move',
  aliases: ['aji', 'jib', 'm'],
  description: 'Moves members to a voice channel via Mentions, IDs, or Names.',
  usage: '!move <@user/ID> [Optional: #channel/ID]',
  category: 'moderation',
  permissions: [PermissionFlagsBits.MoveMembers],
  prefixless: true,

  async execute(message, args) {
    const isOwner = message.author.id === message.guild.ownerId;

    // 1. Permission Check (Owner Bypass)
    if (!isOwner && !message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return this.replyWithError(message, 'Permission Denied', 'You need the **Move Members** permission to use this command.');
    }

    if (!args.length) return this.replyWithHelp(message);

    // 2. Resolve Target Channel
    let targetChannel = null;
    const lastArg = args[args.length - 1];

    // Check if the last argument is a channel mention or ID
    if (message.mentions.channels.first()) {
      targetChannel = message.mentions.channels.first();
      // Only pop if the last arg was actually the channel mention
      if (lastArg.includes(targetChannel.id)) args.pop();
    } else {
      // Try to resolve channel by ID
      const potentialChan = message.guild.channels.cache.get(lastArg.replace(/[<#>]/g, ''));
      if (potentialChan && (potentialChan.type === ChannelType.GuildVoice || potentialChan.type === ChannelType.GuildStageVoice)) {
        targetChannel = potentialChan;
        args.pop();
      }
    }

    // Fallback: If no channel specified, use the executor's current voice channel
    if (!targetChannel) {
      targetChannel = message.member.voice.channel;
    }

    if (!targetChannel) {
      return this.replyWithError(message, 'Invalid Destination', 'Please join a voice channel or specify a target channel ID/mention.');
    }

    // 3. Resolve Members (Mentions, IDs, or Usernames)
    const membersToMove = new Set();

    // Process mentions first
    message.mentions.members.forEach(m => membersToMove.add(m));

    // Process remaining args (IDs or Names)
    for (const arg of args) {
      const cleanId = arg.replace(/[<@!>]/g, '');
      let member = message.guild.members.cache.get(cleanId);

      if (!member) {
        member = message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === arg.toLowerCase() ||
          m.displayName.toLowerCase().includes(arg.toLowerCase())
        );
      }
      if (member) membersToMove.add(member);
    }

    if (membersToMove.size === 0) {
      return this.replyWithError(message, 'Member Not Found', 'Could not find any valid members to move based on your input.');
    }

    // 4. Processing Moves & Security Checks
    const moved = [];
    const failed = [];

    for (const member of membersToMove) {
      const sourceChannel = member.voice.channel;

      if (!sourceChannel) {
        failed.push(`${member.displayName} (Not in voice)`);
        continue;
      }

      if (sourceChannel.id === targetChannel.id) {
        failed.push(`${member.displayName} (Already in target)`);
        continue;
      }

      // --- Security Check: Prevent moving from hidden/locked rooms ---
      if (!isOwner) {
        const sourcePerms = sourceChannel.permissionsFor(message.member);
        // Ensure user can see the room they are pulling from
        if (!sourcePerms || !sourcePerms.has(PermissionFlagsBits.ViewChannel)) {
          failed.push(`${member.displayName} (Hidden/Private Room)`);
          continue;
        }
      }

      try {
        await member.voice.setChannel(targetChannel);
        moved.push(member.displayName);
      } catch (err) {
        failed.push(`${member.displayName} (API Error)`);
      }
    }

    // 5. Build Final Report
    const embed = new EmbedBuilder()
      .setTitle('Voice Move Results')
      .setDescription(`Target Channel: **${targetChannel.name}**`)
      .setColor(moved.length > 0 ? 0x2ECC71 : 0xE74C3C)
      .setTimestamp();

    if (moved.length > 0) {
      embed.addFields({ name: '<a:online:1463992619104207019> Success', value: moved.join(', ') });
    }
    if (failed.length > 0) {
      embed.addFields({ name: '<a:offline:1467158828909859059> Failed', value: failed.join('\n') });
    }

    return message.reply({ embeds: [embed] });
  },

  // Helper Methods
  async replyWithError(message, title, description) {
    const embed = new EmbedBuilder()
      .setTitle(` ${title}`)
      .setDescription(description)
      .setColor(0xFF0000);
    return message.reply({ embeds: [embed] });
  },

  async replyWithHelp(message) {
    const { createUsageEmbed } = require('../../utils/embed');
    const embed = await createUsageEmbed(message.guild.id, {
      command: 'move',
      description: 'Moves members to a voice channel via Mentions, IDs, or Names.',
      usage: '`!move <@user/ID> [Optional: #channel/ID]`',
      examples: '`!move @user` (pull to you)\n`!move @user #General` (move to room)\n`!move 123456789012345678` (move by ID)'
    });
    return message.reply({ embeds: [embed] });
  }
};