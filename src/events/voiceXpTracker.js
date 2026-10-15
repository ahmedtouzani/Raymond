const { asEmbed } = require('../utils/responses');
const { ChannelType } = require('discord.js');
const { addXp } = require('../database/levelSystem');
const { handleLevelUpRoles } = require('../utils/levelRoleManager');

// Voice XP system config
const VOICE_XP_INTERVAL = 60 * 1000; // 1 minute
function VOICE_XP_AMOUNT() {
  return 15; // XP per interval (customize as needed)
}

// Ensure global.voiceXpTracking is initialized
if (!global.voiceXpTracking) global.voiceXpTracking = {};

module.exports = {
  disabled: true,
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    // Only track if user joins/moves channels
    if (
      newState.channelId &&
      newState.channelId !== oldState.channelId &&
      newState.member &&
      !newState.member.user.bot &&
      newState.channel &&
      newState.channel.type === ChannelType.GuildVoice
    ) {
      const key = `${newState.guild.id}-${newState.member.id}`;
      if (!global.voiceXpTracking[key]) {
        // console.log('[voiceXpTracker] Starting XP interval for user', newState.member.user.tag, 'in channel', newState.channel.name);
        global.voiceXpTracking[key] = setInterval(async () => {
          try {
            // === VOICE XP COOLDOWN ===
            if (!global.voiceXpCooldown) global.voiceXpCooldown = {};
            const cooldownKey = `${newState.guild.id}-${newState.member.id}`;
            const now = Date.now();
            const COOLDOWN = 45 * 1000; // 45 seconds
            if (
              !global.voiceXpCooldown[cooldownKey] ||
              now - global.voiceXpCooldown[cooldownKey] > COOLDOWN
            ) {
              global.voiceXpCooldown[cooldownKey] = now;
              // Add XP (random between 10-20)
              const xpToAdd = Math.floor(10 + Math.random() * 11);
              addXp(newState.guild.id, newState.member.id, xpToAdd, 'voice')
                .then(async ({ level, leveledUp }) => {
                  if (leveledUp) {
                    await handleLevelUpRoles(newState.client, newState.guild.id, newState.member.id, 'voice', level);
                    // Send congratulatory message via DM
                    try {
                      const dmChannel = await newState.member.createDM();
                      await dmChannel.send(asEmbed({
                        content: `${newState.member}, congrats! You reached voice level **${level}**!`
                      }));
                    } catch (error) {
                      // Handle DM failure silently
                    }
                  }
                })
                .catch((err) => {
                  // console.error('[voiceXpTracker] Error in addXp:', err);
                });
            }

          // Check if still in voice and eligible
          const member = await newState.guild.members.fetch(newState.member.id).catch(() => null);
          if (
            !member ||
            !member.voice.channelId ||
            member.voice.channel.type !== ChannelType.GuildVoice
          ) {
            clearInterval(global.voiceXpTracking[key]);
            delete global.voiceXpTracking[key];
            return;
          }
        } catch (err) {
          // console.error('[voiceXpTracker] Interval error:', err);
        }
        }, VOICE_XP_INTERVAL);
      }
    }
    // Stop tracking if user leaves
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      if (oldState.member && oldState.guild) {
        const key = `${oldState.guild.id}-${oldState.member.id}`;
        if (global.voiceXpTracking[key]) {
          clearInterval(global.voiceXpTracking[key]);
          delete global.voiceXpTracking[key];
        }
      }
      
    }
  },
};
