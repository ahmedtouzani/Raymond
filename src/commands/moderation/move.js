const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  name: 'move',
  aliases: ['aji', 'jib'],
  description: 'Move a member to a different voice channel.',
  usage: '!move @member #channel',
  examples: [
    '!move @user #General',
    '!move @user1 @user2 #Staff-VC'
  ],
  category: 'moderation',
  permissions: [PermissionFlagsBits.MoveMembers],
  prefixless: true,

  async execute(message, args) {
    // Permission check
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

    // No args? Show help
    if (!args.length) {
      return replyWithInfo('Move Command Help', [
        { name: 'Usage', value: this.usage },
        { name: 'Examples', value: this.examples.join('\n') }
      ]);
    }

    // Require at least 2 arguments (user + channel)
    if (args.length < 2) {
      return replyWithError('Missing Arguments', 'You must specify both a user and a target channel.\n\n**Example:** `!move @user #channel`');
    }

    const executor = message.member;

    // Parse target channel (last argument)
    let targetChannel = null;
    const channelArg = args[args.length - 1];

    if (/^<#\d+>$/.test(channelArg)) {
      // Channel mention
      const chanId = channelArg.match(/\d+/)[0];
      targetChannel = message.guild.channels.cache.get(chanId);
    } else if (/^\d{17,19}$/.test(channelArg)) {
      // Channel ID
      targetChannel = message.guild.channels.cache.get(channelArg);
    } else {
      // Channel name (case-insensitive)
      targetChannel = message.guild.channels.cache.find(c =>
        c.type === ChannelType.GuildVoice && c.name.toLowerCase() === channelArg.toLowerCase()
      );
    }

    if (!targetChannel || targetChannel.type !== ChannelType.GuildVoice) {
      return replyWithError('Invalid Channel', `Could not find voice channel "${channelArg}".\n\nPlease mention a valid voice channel or provide its name/ID.`);
    }

    // Check if executor has access to the target channel
    const executorTargetPerms = targetChannel.permissionsFor(executor);
    if (!executorTargetPerms || !executorTargetPerms.has(PermissionFlagsBits.ViewChannel) || !executorTargetPerms.has(PermissionFlagsBits.Connect)) {
      return replyWithError('No Channel Access', `You don't have permission to access ${targetChannel}.\n\nYou cannot move members to channels you can't view or connect to.`);
    }

    // Check if bot has permission
    const botPerms = targetChannel.permissionsFor(message.guild.members.me);
    if (!botPerms || !botPerms.has(PermissionFlagsBits.MoveMembers)) {
      return replyWithError('Bot Missing Permissions', `I don't have permission to move members in ${targetChannel}.`);
    }

    // Gather members to move
    let membersToMove = [];

    // Get mentioned members
    if (message.mentions.members && message.mentions.members.size > 0) {
      membersToMove = Array.from(message.mentions.members.values());
    }

    // Fuzzy match by name (exclude the last arg which is the channel)
    const nameArgs = args.slice(0, -1).filter(arg => !arg.match(/^<[@#]/));
    for (const name of nameArgs) {
      const found = message.guild.members.cache.find(m =>
        m.displayName.toLowerCase().includes(name.toLowerCase()) ||
        m.user.username.toLowerCase().includes(name.toLowerCase())
      );
      if (found && !membersToMove.includes(found)) {
        membersToMove.push(found);
      }
    }

    // Fallback: try to parse first arg as member ID
    if (membersToMove.length === 0) {
      const memberId = args[0].match(/\d+/)?.[0];
      if (memberId) {
        const targetMember = message.guild.members.cache.get(memberId);
        if (targetMember) membersToMove.push(targetMember);
      }
    }

    if (membersToMove.length === 0) {
      return replyWithError('Invalid Member', `Could not find any members to move.\n\nPlease mention a user or provide their name/ID.`);
    }

    // Move each member
    let moved = [];
    let failed = [];

    for (const member of membersToMove) {
      // Check if member is in voice
      if (!member.voice?.channel) {
        failed.push(`${member.displayName} (not in voice)`);
        continue;
      }

      // Check if already in target
      if (member.voice.channel.id === targetChannel.id) {
        failed.push(`${member.displayName} (already there)`);
        continue;
      }

      // Check if executor has access to member's current channel (source)
      const sourceChannel = member.voice.channel;
      const sourcePerms = sourceChannel.permissionsFor(executor);
      if (!sourcePerms || !sourcePerms.has(PermissionFlagsBits.ViewChannel)) {
        failed.push(`${member.displayName} (no access to their channel)`);
        continue;
      }

      // Attempt to move
      try {
        await member.voice.setChannel(targetChannel);
        moved.push(member.displayName);
      } catch (error) {
        failed.push(`${member.displayName} (${error.message})`);
      }
    }

    if (moved.length === 0) {
      const failureReason = failed.length > 0 ? `\n\n**Failed:**\n${failed.join('\n')}` : '';
      return replyWithError('No Moves', `No users were moved.${failureReason}`);
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
