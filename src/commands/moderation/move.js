const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  name: 'move',
  aliases: ['aji', 'jib'],
  description: 'Move a member or everyone to a different voice channel.',
  usage: '/move [@member | all] [#channel | channel name]',
  examples: [
    '/move @user',
    '/move @user #General',
    '/move all'
  ],
  category: 'moderation',
  permissions: [PermissionFlagsBits.MoveMembers],
  prefixless: true,

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🚫 Permission Denied')
            .setDescription('You need the **Move Members** permission to use this command.')
            .setColor(0xFF0000)
        ]
      });
    }
    const replyWithError = (title, description) => {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(0xFF0000)
            .setFooter({ text: `Usage: ${this.usage}` })
        ]
      });
    };

    const replyWithInfo = (title, fields) => {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .addFields(fields)
            .setColor(0x3498DB)
            .setFooter({ text: `Aliases: ${this.aliases.join(', ')}` })
        ]
      });
    };

    // No args? Show help.
    if (!args.length) {
      return replyWithInfo('Move Command Help', [
        { name: 'Usage', value: this.usage },
        { name: 'Examples', value: this.examples.join('\n') }
      ]);
    }

    const executor = message.member;

    // /move all => move everyone from your channel to your second arg or default
    if (args[0].toLowerCase() === 'all') {
      const fromChannel = executor.voice?.channel;
      if (!fromChannel) {
        return replyWithError('Not in Voice Channel', 'You must be in a voice channel to move everyone.');
      }

      let targetChannel = fromChannel;
      if (args[1]) {
        const chanInput = args.slice(1).join(' ');
        const chanId = chanInput.match(/\d+/)?.[0];
        targetChannel = chanId
          ? message.guild.channels.cache.get(chanId)
          : message.guild.channels.cache.find(c =>
            c.name.toLowerCase() === chanInput.toLowerCase() &&
            c.type === ChannelType.GuildVoice
          );
        if (!targetChannel || targetChannel.type !== ChannelType.GuildVoice)
          return replyWithError('Invalid Channel', `Could not find voice channel "${chanInput}".`);
      }

      if (fromChannel.id === targetChannel.id && args[1])
        return replyWithError('Same Channel', 'Source and target channel are the same.');

      // Check if executor has access to the target channel
      const executorPerms = targetChannel.permissionsFor(executor);
      if (!executorPerms || !executorPerms.has(PermissionFlagsBits.ViewChannel) || !executorPerms.has(PermissionFlagsBits.Connect)) {
        return replyWithError('No Channel Access', `You don't have permission to access ${targetChannel}. You cannot move members to channels you can't access.`);
      }

      // Check if bot has permission
      const botPerms = targetChannel.permissionsFor(message.guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.MoveMembers)) {
        return replyWithError('Bot Missing Permissions', `I don't have permission to move members in ${targetChannel}.`);
      }

      let movedCount = 0;
      let failedCount = 0;
      for (const member of fromChannel.members.values()) {
        try {
          await member.voice.setChannel(targetChannel);
          movedCount++;
        } catch (error) {
          failedCount++;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ All Members Moved')
        .setDescription(`Moved **${movedCount}** member(s) from ${fromChannel} to ${targetChannel}`)
        .setColor(0x00AA55);

      if (failedCount > 0) {
        embed.addFields({
          name: '⚠️ Failed to Move',
          value: `${failedCount} member(s) could not be moved`,
          inline: false
        });
      }

      return message.reply({ embeds: [embed] });
    }

    // Otherwise: /move @user1 @user2 ... [#channel or channel name or nothing]
    // 1. Gather all mentioned members
    let membersToMove = message.mentions.members ? Array.from(message.mentions.members.values()) : [];

    // 2. Fuzzy match any extra arguments (names not starting with <@ or #)
    const possibleNames = args.filter(arg => !arg.match(/^<[@#]/));
    for (const name of possibleNames) {
      const found = message.guild.members.cache.find(m =>
        m.displayName.toLowerCase().includes(name.toLowerCase()) ||
        m.user.username.toLowerCase().includes(name.toLowerCase())
      );
      if (found && !membersToMove.includes(found)) {
        membersToMove.push(found);
      }
    }

    // If none found, fallback to previous logic (single member by ID)
    if (membersToMove.length === 0) {
      const memberInput = args[0];
      const memberId = memberInput.match(/\d+/)?.[0];
      const targetMember = message.guild.members.cache.get(memberId);
      if (targetMember) membersToMove.push(targetMember);
    }

    if (membersToMove.length === 0) {
      return replyWithError('Invalid Member', `Could not find any members to move from your input.`);
    }

    // 3. Determine the target channel (mention, ID, or name, only voice channels)
    let targetChannel = null;

    // Find a channel argument (mention, id, or name)
    const channelArg = args.find(arg =>
      // Channel mention: <#123...>
      /^<#\d+>$/.test(arg) ||
      // Channel ID: all digits, valid channel
      (/^\d{17,19}$/.test(arg) && message.guild.channels.cache.has(arg)) ||
      // Channel name: matches a voice channel
      message.guild.channels.cache.some(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === arg.toLowerCase())
    );

    if (channelArg) {
      if (/^<#\d+>$/.test(channelArg)) {
        // Channel mention
        const chanId = channelArg.match(/\d+/)[0];
        targetChannel = message.guild.channels.cache.get(chanId);
      } else if (/^\d{17,19}$/.test(channelArg)) {
        // Channel ID
        targetChannel = message.guild.channels.cache.get(channelArg);
      } else {
        // Channel name (case-insensitive, must be a voice channel)
        targetChannel = message.guild.channels.cache.find(c =>
          c.type === ChannelType.GuildVoice && c.name.toLowerCase() === channelArg.toLowerCase()
        );
      }
    }

    // Default: executor's current voice channel
    if (!targetChannel) {
      targetChannel = executor.voice?.channel;
    }
    if (!targetChannel || targetChannel.type !== ChannelType.GuildVoice) {
      return replyWithError('No Target Channel', 'Please specify a valid voice channel (by mention, ID, or name) or join one.');
    }

    // Check if executor has access to the target channel
    const executorPermissions = targetChannel.permissionsFor(executor);
    if (!executorPermissions || !executorPermissions.has(PermissionFlagsBits.ViewChannel) || !executorPermissions.has(PermissionFlagsBits.Connect)) {
      return replyWithError('No Channel Access', `You don't have permission to access ${targetChannel}. You cannot move members to channels you can't access.`);
    }

    // Check if bot has permission to move members
    const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
    if (!botPermissions || !botPermissions.has(PermissionFlagsBits.MoveMembers)) {
      return replyWithError('Bot Missing Permissions', `I don't have permission to move members in ${targetChannel}.`);
    }

    // 4. Move each member
    let moved = [];
    let failed = [];
    for (const member of membersToMove) {
      if (!member.voice?.channel) {
        failed.push(`${member.displayName} (not in voice)`);
        continue;
      }
      if (member.voice.channel.id === targetChannel.id) {
        failed.push(`${member.displayName} (already there)`);
        continue;
      }

      // Check if executor has access to the member's current channel (source channel)
      const sourceChannel = member.voice.channel;
      const sourcePermissions = sourceChannel.permissionsFor(executor);
      if (!sourcePermissions || !sourcePermissions.has(PermissionFlagsBits.ViewChannel)) {
        failed.push(`${member.displayName} (no access to their channel)`);
        continue;
      }

      try {
        await member.voice.setChannel(targetChannel);
        moved.push(member.displayName);
      } catch (error) {
        failed.push(`${member.displayName} (${error.message})`);
      }
    }

    if (moved.length === 0) {
      const failureReason = failed.length > 0 ? `\n\n**Failed:**\n${failed.join('\n')}` : '';
      return replyWithError('No Moves', `No users were moved (maybe they are already in the target channel or not in a voice channel).${failureReason}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Members Moved')
      .setDescription(`Moved **${moved.length}** member(s) to ${targetChannel}:\n${moved.join(', ')}`)
      .setColor(0x00AA55);

    if (failed.length > 0) {
      embed.addFields({
        name: '⚠️ Failed to Move',
        value: failed.slice(0, 10).join('\n') + (failed.length > 10 ? `\n...and ${failed.length - 10} more` : ''),
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });
  }
};
