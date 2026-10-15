const { getLevelRoles, getRoleForLevel } = require('../database/levelRoles');
const { getGuildSettingsWithDefaults } = require('../database/levelSettings');

/**
 * Assigns/removes level reward roles for a user after a level up.
 * @param {Client} client - The Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} ladder - 'text' or 'voice'
 * @param {number} newLevel - The new level the user reached
 */
async function handleLevelUpRoles(client, guildId, userId, ladder, newLevel) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  // Get all level roles for this ladder
  const allRoles = await getLevelRoles(guildId, ladder);
  if (!allRoles.length) return;

  // Find the role for the new level
  const rewardRoleId = await getRoleForLevel(guildId, ladder, newLevel);
  const rewardRole = rewardRoleId ? guild.roles.cache.get(rewardRoleId) : null;

  // Remove all other level roles in this ladder
  const otherRoleIds = allRoles
    .filter(r => r.level !== newLevel)
    .map(r => r.role_id)
    .filter(roleId => member.roles.cache.has(roleId));

  const settings = await getGuildSettingsWithDefaults(guildId);
  if (settings.role_rewards_remove_previous && otherRoleIds.length > 0) {
    await member.roles.remove(otherRoleIds).catch(() => {});
  }
  // Add the new role if not already present
  if (rewardRole && !member.roles.cache.has(rewardRole.id)) {
    await member.roles.add(rewardRole).catch(() => {});
  }
}

module.exports = { handleLevelUpRoles };
