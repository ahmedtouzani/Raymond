const {
  getGuildConfig,
  setGuildConfig,
  setGuildPrefix,
} = require("../database/guildConfig");
const { AttachmentBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const logger = require("../utils/logger"); // Unified logger
const { getAutoReactionsForGuild } = require("../database/autoReactSettings");
const { authorizeCommand } = require('../handlers/commandAuthorization');
const { isDevelopment, allowsGuild } = require('../config/development');

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot || !message.guild || !allowsGuild(message.guild.id)) return;
    const development = isDevelopment();
    const config = await getGuildConfig(message.guild.id);
    const prefix = config.prefix || process.env.GLOBAL_PREFIX || '!';
    if (development && !message.content.startsWith(prefix)) {
      const name = message.content.trim().split(/\s+/)[0].toLowerCase();
      const knownShortcut = [...client.commands.values()].some(command => command.prefixless && (
        command.name.toLowerCase() === name || command.aliases?.some(alias => alias.toLowerCase() === name)
      ));
      if (!knownShortcut) return;
    }

    // === LEVEL SYSTEM: TEXT XP ===
    const { addXp } = require("../database/levelSystem");
    const { getGuildSettingsWithDefaults } = require("../database/levelSettings");
    const { handleLevelUpRoles } = require("../utils/levelRoleManager");
    const levelSettings = await getGuildSettingsWithDefaults(message.guild.id).catch(() => null);
    const COOLDOWN = ((levelSettings?.xp_cooldown ?? 60) * 1000);
    if (!global.textXpCooldown) global.textXpCooldown = {};
    const cooldownKey = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();
    if (
      !development && (
        !global.textXpCooldown[cooldownKey] ||
        now - global.textXpCooldown[cooldownKey] > COOLDOWN)
    ) {
      global.textXpCooldown[cooldownKey] = now;
      if (!levelSettings?.excluded_channels?.includes(message.channel.id)) {
        const minXp = levelSettings?.text_xp_min ?? 15;
        const maxXp = levelSettings?.text_xp_max ?? 25;
        const multiplier = levelSettings?.xp_multiplier ?? 1;
        const rawXp = Math.floor(minXp + Math.random() * (maxXp - minXp + 1));
        const xpToAdd = Math.max(0, Math.round(rawXp * multiplier));

        addXp(message.guild.id, message.author.id, xpToAdd, "text")
          .then(async ({ level, leveledUp }) => {
            if (!leveledUp) return;

            await handleLevelUpRoles(
              message.client,
              message.guild.id,
              message.author.id,
              "text",
              level
            );

            if (!levelSettings?.levelup_enabled) return;

            const channelId = levelSettings?.levelup_channel_id;
            const targetChannel = channelId
              ? message.guild.channels.cache.get(channelId) || null
              : message.channel;
            if (!targetChannel || !targetChannel.isTextBased()) return;

            const template = levelSettings?.levelup_message || 'Congratulations {user}! You reached level {level}!';
            const content = template
              .replaceAll('{user}', `<@${message.author.id}>`)
              .replaceAll('{level}', String(level));

            try {
              if (levelSettings?.levelup_include_card) {
                const { getUserLevel } = require("../database/levelSystem");
                const { generateRankCard } = require("../utils/canvasRankCard");
                const userData = await getUserLevel(message.guild.id, message.author.id);
                const buffer = await generateRankCard(userData, message.member, 'text', 0, levelSettings?.theme_preset || 'dark');
                const attachment = new AttachmentBuilder(buffer, { name: 'level-up.png' });
                await targetChannel.send({ content, files: [attachment] });
              } else {
                await targetChannel.send({ content });
              }
            } catch (err) {
            }
          })
          .catch(() => { });
      }
    }
    // === END LEVEL SYSTEM ===

    // --- Auto-Reaction Logic ---
    try {
      const autoReactions = development ? [] : await getAutoReactionsForGuild(message.guild.id);
      if (autoReactions.length > 0) {
        const reactionsToApply = new Set();

        for (const reaction of autoReactions) {
          // Check for user-specific reactions
          if (
            reaction.target_type === "user" &&
            reaction.target_id === message.author.id
          ) {
            reactionsToApply.add(reaction.emoji);
          }
          // Check for channel-wide reactions
          if (
            reaction.target_type === "channel" &&
            reaction.target_id === message.channel.id
          ) {
            reactionsToApply.add(reaction.emoji);
          }
        }

        // Apply all unique reactions
        if (reactionsToApply.size > 0) {
          // Use Promise.all for non-blocking reactions
          await Promise.all(
            [...reactionsToApply].map((emoji) =>
              message.react(emoji).catch((err) => {
                logger.warn(
                  `Failed to apply auto-reaction '${emoji}' in guild ${message.guild.id}: ${err.message}`
                );
              })
            )
          );
        }
      }
    } catch (error) {
      logger.error(
        `Failed to process auto-reactions for guild ${message.guild.id}:`,
        error
      );
    }
    // --- End Auto-Reaction Logic ---

    // Enhanced spam detection (per-guild tracking)
    if (!development && config.settings.spamDetectionEnabled !== false) {
      const now = Date.now();
      const trackerKey = `${message.guild.id}-${message.author.id}`;

      if (!global.spamTracker) global.spamTracker = {};
      if (!global.spamTracker[trackerKey]) global.spamTracker[trackerKey] = [];

      // Filter old timestamps (4-second window)
      global.spamTracker[trackerKey] = global.spamTracker[trackerKey].filter(
        (ts) => now - ts < 4000
      );

      global.spamTracker[trackerKey].push(now);

      // Mute if 5+ messages in 4 seconds
      if (global.spamTracker[trackerKey].length >= 5) {
        try {
          let mutedRole = message.guild.roles.cache.find(
            (r) => r.name.toLowerCase() === "muted"
          );

          // Create role if missing
          if (!mutedRole && !config.settings.mutedRoleId) {
            mutedRole = await message.guild.roles.create({
              name: "Muted",
              color: "#555555",
              permissions: [],
              reason: "Automod mute role creation",
            });

            // Apply permissions to all channels
            for (const channel of message.guild.channels.cache.values()) {
              if (channel.isTextBased && channel.permissionOverwrites) {
                await channel.permissionOverwrites
                  .edit(mutedRole, {
                    SendMessages: false,
                    AddReactions: false,
                    Speak: false,
                  })
                  .catch(logger.error);
              }
            }

            // Update config
            config.settings.mutedRoleId = mutedRole.id;
            await setGuildConfig(message.guild.id, config);
          }
          // Use existing role from config
          else if (config.settings.mutedRoleId) {
            mutedRole = message.guild.roles.cache.get(
              config.settings.mutedRoleId
            );
          }

          // Apply mute
          if (mutedRole && !message.member.roles.cache.has(mutedRole.id)) {
            await message.member.roles.add(mutedRole, "Automod: Spam Detected");
            await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("🤐 User Muted")
                  .setDescription(
                    `${message.author} muted for sending 5+ messages in 4 seconds`
                  )
                  .setColor(0xff9900),
              ],
            });
            global.spamTracker[trackerKey] = []; // Reset tracker
          }
        } catch (error) {
          logger.error("Spam mute failed:", error);
        }
      }
    }

    // Optimized invite detection
    const inviteRegex = /discord(?:app)?\.(?:com\/invite|gg)\/[a-z0-9]+/gi;
    const hasInvites = inviteRegex.test(message.content);

    if (!development && hasInvites && config.settings.autobanBlacklist?.length) {
      try {
        const blacklist = config.settings.autobanBlacklist;
        const inviteCodes = [...message.content.matchAll(inviteRegex)].map(
          (m) => m[0].split("/").pop()
        );

        let blacklistedServers = [];

        // Parallel invite checking
        await Promise.all(
          inviteCodes.map(async (code) => {
            try {
              const invite = await client.fetchInvite(code);
              if (
                invite.guild &&
                blacklist.some((b) => b.guildId === invite.guild.id)
              ) {
                blacklistedServers.push(invite.guild.name);
              }
            } catch {
              /* Ignore invalid invites */
            }
          })
        );

        // Process blacklisted invites
        if (blacklistedServers.length > 0) {
          if (message.deletable) await message.delete();

          const reason = `Posted invites to blacklisted servers: ${blacklistedServers.join(
            ", "
          )}`;

          // Ban user
          if (
            message.guild.members.me.permissions.has(
              PermissionsBitField.Flags.BanMembers
            )
          ) {
            await message.member.ban({ reason, days: 0 });

            // Send log
            const logEmbed = new EmbedBuilder()
              .setTitle("🚨 User Banned")
              .setDescription(
                `**User:** ${message.author.tag} (${message.author.id})
**Reason:** ${reason}
**Message:** ${message.content.slice(0, 1000)}`
              )
              .setColor(0xff0000)
              .setTimestamp();

            if (config.settings.autobanLogChannel) {
              const logChannel = message.guild.channels.cache.get(
                config.settings.autobanLogChannel
              );
              if (logChannel) await logChannel.send({ embeds: [logEmbed] });
            }

            // Send public notification
            if (
              message.channel
                .permissionsFor(message.guild.members.me)
                .has(PermissionsBitField.Flags.SendMessages)
            ) {
              await message.channel.send({
                embeds: [
                  new EmbedBuilder()
                    .setDescription(
                      `🚨 ${message.author} was banned for posting blacklisted invites`
                    )
                    .setColor(0xff0000),
                ],
              });
            }
          }
          return; // Skip command processing
        }
      } catch (error) {
        logger.error("Autoban failed:", error);
      }
    }

    const isPrefixCommand = message.content.startsWith(prefix);
    // Unified command handling
    const args = message.content.trim().split(/\s+/);
    let commandName = "";
    let argsArr = [];

    // Handle prefix commands
    if (isPrefixCommand) {
      commandName = args[0].slice(prefix.length).toLowerCase();
      argsArr = args.slice(1);
    }
    // Handle prefixless commands
    else {
      const prefixlessCommands = [...client.commands.values()].filter(
        (c) => c.prefixless
      );
      const baseCommand = args[0].toLowerCase();

      const matchedCmd = prefixlessCommands.find(
        (cmd) =>
          cmd.name.toLowerCase() === baseCommand ||
          (cmd.aliases && cmd.aliases.includes(baseCommand))
      );

      if (matchedCmd) {
        commandName = matchedCmd.name;
        argsArr = args.slice(1);
      } else {
        return; // No valid command
      }
    }

    // Special command: setprefix
    if (commandName === "setprefix") {
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(" Only administrators can change the prefix")
              .setColor(0x23272a),
          ],
        });
      }

      const newPrefix = argsArr[0];
      if (!newPrefix || newPrefix.length > 5) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(" Prefix must be 1-5 characters")
              .setColor(0x23272a),
          ],
        });
      }

      await setGuildPrefix(message.guild.id, newPrefix);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `<:Done:1305644486453493801>Prefix updated to \`${newPrefix}\``
            )
            .setColor(0x23272a),
        ],
      });
    }

    // Special command: prefix reset
    if (commandName === "prefix" && argsArr[0] === "reset") {
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(" Only administrators can reset the prefix")
              .setColor(0x23272a),
          ],
        });
      }

      const defaultPrefix = process.env.GLOBAL_PREFIX || "!";
      await setGuildPrefix(message.guild.id, defaultPrefix);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `<:Done:1305644486453493801>Prefix reset to \`${defaultPrefix}\``
            )
            .setColor(0x23272a),
        ],
      });
    }

    // Regular command execution
    const command =
      client.commands.get(commandName) ||
      [...client.commands.values()].find(
        (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
      );

    console.log(`[MessageCreate] CommandName: '${commandName}', Found: ${!!command}`);

    if (command) {
      try {
        const authorization = authorizeCommand(command, message);
        if (!authorization.allowed) {
          return message.reply({ content: authorization.message, allowedMentions: { parse: [] } });
        }
        console.log(`[MessageCreate] Executing command: ${command.name}`);
        await command.execute(message, argsArr, client);
      } catch (error) {
        logger.error(`Command ${commandName} failed:`, error);
        message
          .reply(" An error occurred executing that command")
          .catch(() => { });
      }
    }
  },
};
