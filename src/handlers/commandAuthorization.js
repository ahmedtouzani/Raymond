const { PermissionsBitField } = require('discord.js');
const { allowsGuild } = require('../config/development');

function isBotOwner(userId, ownerId = process.env.OWNER_ID) {
  const configuredOwner = typeof ownerId === 'string' ? ownerId.trim() : '';
  return Boolean(configuredOwner && userId === configuredOwner);
}

function permissionBits(permissions) {
  if (permissions == null) return 0n;
  const values = Array.isArray(permissions) ? permissions : [permissions];
  return values.reduce((bits, value) => {
    if (typeof value === 'string' && !/^\d+$/.test(value)) {
      const normalized = value.replace(/_/g, '').toLowerCase();
      const name = Object.keys(PermissionsBitField.Flags)
        .find(flag => flag.toLowerCase() === normalized);
      if (!name) throw new Error('Unknown command permission');
      value = PermissionsBitField.Flags[name];
    } else if (typeof value === 'string') {
      value = BigInt(value);
    }
    return bits | PermissionsBitField.resolve(value);
  }, 0n);
}

function hasPermissions(permissions, required) {
  if (!permissions) return false;
  return typeof permissions.has === 'function'
    ? permissions.has(required)
    : new PermissionsBitField(permissions).has(required);
}

function createCommandAuthorizer({ now = Date.now, getOwnerId = () => process.env.OWNER_ID } = {}) {
  const cooldowns = new Map();
  return function authorize(command, context) {
    const userId = context.author?.id || context.user?.id;
    const deny = message => ({ allowed: false, message });
    if (!allowsGuild(context.guild?.id || context.guildId)) return deny('This development bot is restricted to its test server.');
    if (!userId) return deny('Unable to verify the command user.');
    const owner = isBotOwner(userId, getOwnerId());
    if (command.ownerOnly && !owner) return deny('Only the bot owner can use this command.');

    try {
      const slashPermissions = command.data?.toJSON().default_member_permissions;
      const userPermissions = permissionBits(command.permissions ?? slashPermissions);
      const botPermissions = permissionBits(command.botPermissions);
      if ((command.guildOnly || userPermissions || botPermissions) && !context.guild) {
        return deny('This command can only be used in a server.');
      }
      if (userPermissions && !owner) {
        const memberPermissions = typeof context.channel?.permissionsFor === 'function'
          ? context.channel.permissionsFor(context.member || context.user)
          : context.memberPermissions || context.member?.permissions;
        if (!hasPermissions(memberPermissions, userPermissions)) {
          return deny('You do not have permission to use this command.');
        }
      }
      if (botPermissions) {
        const botMember = context.guild?.members?.me;
        const effective = botMember && (typeof context.channel?.permissionsFor === 'function'
          ? context.channel.permissionsFor(botMember) : botMember.permissions);
        if (!hasPermissions(effective, botPermissions)) {
          return deny('I do not have the permissions needed for this command.');
        }
      }
    } catch {
      return deny('Unable to verify command permissions.');
    }

    const duration = Number(command.cooldown || 0) * 1000;
    if (!Number.isFinite(duration) || duration < 0) return deny('Invalid command cooldown configuration.');
    if (duration > 0) {
      const time = now();
      const key = `${context.guild?.id || 'dm'}:${userId}:${command.name || command.data?.name}`;
      const expiry = cooldowns.get(key) || 0;
      if (expiry > time) return deny(`Please wait ${Math.ceil((expiry - time) / 1000)} seconds before using this command again.`);
      if (cooldowns.size >= 1000) {
        for (const [entry, deadline] of cooldowns) if (deadline <= time) cooldowns.delete(entry);
      }
      cooldowns.set(key, time + duration);
    }
    return { allowed: true };
  };
}

module.exports = { isBotOwner, createCommandAuthorizer, authorizeCommand: createCommandAuthorizer() };
