const { PermissionsBitField: { Flags } } = require('discord.js');
const { isBotOwner } = require('../handlers/commandAuthorization');

function canVerify(member, userId, settings = {}, ownerId = process.env.OWNER_ID) {
  return isBotOwner(userId, ownerId)
    || Boolean(member?.permissions?.has(Flags.Administrator))
    || Boolean(settings.verificatorRoleId && member?.roles?.cache?.has(settings.verificatorRoleId));
}
module.exports = { canVerify };
