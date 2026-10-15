const { PermissionsBitField: { Flags } } = require('discord.js');
const { isBotOwner } = require('../handlers/commandAuthorization');
const { createCase } = require('../database/moderationRecords');
const logger = require('../utils/logger');
const auditLogs = require('./auditLogs');
function elevated(member, userId) {
  return isBotOwner(userId) || Boolean(member?.permissions?.has(Flags.Administrator) || member?.permissions?.has(Flags.ManageGuild));
}
function canReadRecords(member, userId) {
  return elevated(member, userId) || ['ModerateMembers', 'BanMembers', 'KickMembers', 'ManageRoles'].some(permission => member?.permissions?.has(Flags[permission]));
}
async function recordAction(message, targetId, action, reason = 'No reason provided', metadata = {}) {
  try {
    const record = await createCase({ guildId: message.guild.id, targetId, moderatorId: message.author.id, action,
      reason: String(reason || 'No reason provided').slice(0, 1000), messageId: message.id || null, metadata });
    if (record?.case_number) await auditLogs.publish(message.guild,'moderation',`case:${record.case_number}`,{
      title:`Case #${record.case_number} · ${action}`,description:'Moderation action completed through Raymond.',fields:[
        {name:'Moderator',value:`<@${message.author.id}>`},{name:'Member',value:`<@${targetId}>`},{name:'Reason',value:record.reason},
      ]});
    return record;
  } catch (error) {
    // The Discord action has already succeeded. A logging failure must not repeat that action.
    logger.error('Failed to record a completed moderation action:', { action, guildId: message.guild.id, targetId, code: error.code || error.name });
    return null;
  }
}
module.exports = { elevated, canReadRecords, recordAction };
