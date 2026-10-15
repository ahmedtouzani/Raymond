const { PermissionsBitField } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { protectBotTarget } = require('../../handlers/functions/botProtection');

module.exports = {
  name: 'role',
  description: 'Add or remove a role from a user.',
  usage: '=role add|remove @user @role',
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.ManageRoles],
  category: 'Moderation',

  async execute(message, args, client) {
    const ownerId = process.env.OWNER_ID;
    const isOwner = message.author.id === ownerId;

    // 1. Permission Check
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return sendEmbed(message, {
        title: 'Permission Denied',
        description: 'You need the `Manage Roles` permission to use this command.',
        color: 0x23272A,
      });
    }

    // 2. Argument Parsing & Validation
    const action = args[0]?.toLowerCase();
    if (!['add', 'remove'].includes(action)) {
      const { createUsageEmbed } = require('../../utils/embed');
      const embed = await createUsageEmbed(message.guild.id, {
        command: 'role',
        description: '<a:warningbug:1467300628907954300> **Invalid Action**\nPlease specify `add` or `remove` as the first argument.',
        usage: '`!role <add|remove> <@user> <@role>`',
        examples: '`!role add @User @Role`\n`!role remove @User @Role`'
      });
      return message.reply({ embeds: [embed] });
    }

    // Resolve Member
    const memberArg = args[1];
    let member;
    if (message.mentions.members.first()) {
      member = message.mentions.members.first();
    } else if (memberArg) {
      try {
        member = await message.guild.members.fetch(memberArg);
      } catch (e) {
        // Handled below
      }
    }

    if (!member) {
      return sendEmbed(message, {
        title: 'User Not Found',
        description: 'Please mention a user or provide a valid user ID.',
        color: 0x23272A,
      });
    }

    // Resolve Role
    const roleArg = args[2];
    let role;
    if (message.mentions.roles.first()) {
      role = message.mentions.roles.first();
    } else if (roleArg) {
      try {
        // Extract role ID from mention format <@&ID> if necessary
        const roleId = roleArg.match(/^<@&(\d+)>$/)?.[1] || roleArg;
        role = await message.guild.roles.fetch(roleId);
      } catch (e) {
        // Handled below
      }
    }

    if (!role) {
      return sendEmbed(message, {
        title: 'Role Not Found',
        description: 'Please mention a role or provide a valid role ID.',
        color: 0x23272A,
      });
    }

    // 3. Protection & Hierarchy Checks
    if (protectBotTarget(member.id, client.user.id, message.author.id, ownerId)) {
      return sendEmbed(message, {
        title: 'Action Denied',
        description: 'You cannot modify roles for the bot itself.',
        color: 0x23272A,
      });
    }

    if (!isOwner && role.position >= message.member.roles.highest.position) {
      return sendEmbed(message, {
        title: 'Hierarchy Error',
        description: 'You cannot manage a role that is equal to or higher than your own highest role.',
        color: 0x23272A,
      });
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return sendEmbed(message, {
        title: 'Bot Hierarchy Error',
        description: 'I cannot manage that role because it is equal to or higher than my highest role.',
        color: 0x23272A,
      });
    }

    // 4. Execute Action
    try {
      const hasRole = member.roles.cache.has(role.id);
      const reason = `Action by ${message.author.tag}`;

      if (action === 'add') {
        if (hasRole) {
          return sendEmbed(message, { title: 'Role Already Assigned', description: `${member.user.tag} already has the ${role.name} role.`, color: 0x23272A });
        }
        await member.roles.add(role, reason);
        return sendEmbed(message, { title: 'Role Added', description: `Successfully added the ${role.name} role to ${member.user.tag}.`, color: 0x23272A });
      } else { // action === 'remove'
        if (!hasRole) {
          return sendEmbed(message, { title: 'Role Not Assigned', description: `${member.user.tag} does not have the ${role.name} role.`, color: 0x23272A });
        }
        await member.roles.remove(role, reason);
        return sendEmbed(message, { title: 'Role Removed', description: `Successfully removed the ${role.name} role from ${member.user.tag}.`, color: 0x23272A });
      }
    } catch (error) {
      console.error('Role command error:', error);
      return sendEmbed(message, {
        title: 'An Error Occurred',
        description: `Failed to modify the role. Please check my permissions and try again.`,
        color: 0xFF0000, // Use a more distinct error color
      });
    }
  },
};
