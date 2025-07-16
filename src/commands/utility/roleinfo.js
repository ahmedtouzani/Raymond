const { createEmbed } = require('../../utils/embed');
const { PermissionsBitField, escapeMarkdown } = require('discord.js');

// Helper: Format permissions
function formatPermissions(permissions) {
  return new PermissionsBitField(permissions).toArray()
    .map(perm => `• ${perm.replace(/([A-Z])/g, ' $1').trim()}`)
    .join('\n') || 'None';
}

// Helper: Format role color
function formatColor(color) {
  return color ? `#${color.toString(16).padStart(6, '0').toUpperCase()}` : 'Default';
}

// Helper: Format boolean with emoji
function formatBoolean(value, trueEmoji = '<:check:1308126149189304330>', falseEmoji = '<:cross:1308126150664912906>') {
  return value ? trueEmoji : falseEmoji;
}

// Helper: Get status emoji
function getStatusEmoji(status) {
  const statuses = {
    online: '<a:online:1306260975359496253>',
    idle: '🌙',
    dnd: '⛔',
    offline: '⚫',
    streaming: '🎮',
  };
  return statuses[status] || '⚫';
}

module.exports = {
  name: 'roleinfo',
  aliases: ['ri', 'role', 'rinfo'],
  description: 'Shows detailed information about a role.',
  usage: '!roleinfo [role]',
  category: 'Utility',
  cooldown: 3,
  prefixless: true,
  
  async execute(message, args) {
    // Find the role from mention, ID, or name
    let role;
    const roleArg = args[0];
    
    if (!roleArg) {
      return message.reply({
        embeds: [await createEmbed(message.guild.id, {
          description: '❌ Please specify a role to get information about.',
          color: 0xff3333
        })]
      });
    }
    
    // Try to find role by mention
    const mentionMatch = roleArg.match(/^<@&(\d+)>$/);
    if (mentionMatch) {
      role = message.guild.roles.cache.get(mentionMatch[1]);
    } 
    // Try to find role by ID
    else if (/^\d+$/.test(roleArg)) {
      role = message.guild.roles.cache.get(roleArg);
    } 
    // Try to find role by name
    else {
      const searchTerm = roleArg.toLowerCase();
      role = message.guild.roles.cache.find(
        r => r.name.toLowerCase().includes(searchTerm)
      );
    }
    
    if (!role) {
      return message.reply({
        embeds: [await createEmbed(message.guild.id, {
          description: '❌ Role not found. Please check the role name or ID and try again.',
          color: 0xff3333
        })]
      });
    }
    
    // Format role information
    const createdAt = Math.floor(role.createdTimestamp / 1000);
    const roleAge = Math.floor((Date.now() - role.createdTimestamp) / (1000 * 60 * 60 * 24));
    
    // Get role members (first 10 to avoid rate limits)
    const members = role.members.first(10).map(m => m.user.tag);
    const memberCount = role.members.size;
    
    // Create embed
    const embed = await createEmbed(message.guild.id, {
      author: { 
        name: `Role Info: ${role.name}`,
        iconURL: message.guild.iconURL({ dynamic: true })
      },
      thumbnail: role.iconURL({ dynamic: true, size: 4096 }),
      fields: [
        { 
          name: '<:36548namoonlight:1379103329044402257> > General',
          value: [
            `<:arrow:1309167079231848572>**Name:** ${escapeMarkdown(role.name)}`,
            `<:arrow:1309167079231848572> **ID:** \`${role.id}\``,
            `<:arrow:1309167079231848572> **Color:** ${formatColor(role.color)}`,
            `<:arrow:1309167079231848572> **Position:** ${role.position} (from bottom)`,
            `<:arrow:1309167079231848572> **Hoisted:** ${formatBoolean(role.hoist)}`,
            `<:arrow:1309167079231848572> **Mentionable:** ${formatBoolean(role.mentionable, 'Yes', 'No')}`
          ].join('\n'),
          inline: true
        },
        {
          name: '<:6911party:1379103249176592384> > Details',
          value: [
            `<:black_planet:1310547406697533492> **Created:** <t:${createdAt}:D> (${roleAge} days ago)`,
            `<:1288discordstaff:1379104389674827866> **Members:** ${memberCount} total`,
            `<:8569booster:1379103272488403115> **Mention:** \`<@&${role.id}>\``,
            `<:4298eventer:1379103215857045637> **Permissions:** ${role.permissions.bitfield === 0n ? 'None' : 'See below'}`
          ].join('\n'),
          inline: true
        },
        {
          name: `<:79914memberroleicom:1379108661367931071> > Sample Members [${memberCount}]`,
          value: members.length > 0 
            ? members.join('\n') + (memberCount > 10 ? `\n...and ${memberCount - 10} more` : '')
            : 'No members with this role',
          inline: false
        }
      ],
      color: role.color || 0x5865F2,
      footer: { 
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      },
      timestamp: true
    });
    
    // Add permissions field if there are any
    const permissions = formatPermissions(role.permissions.bitfield);
    if (permissions !== 'None') {
      const permissionLines = permissions.split('\n');
      const limitedPermissions = permissionLines
        .slice(0, 10) // Limit to 10 permissions
        .map(p => `<:arrow:1309167079231848572> ${p.replace('•', '')}`);
      
      let permissionText = limitedPermissions.join('\n');
      if (permissionLines.length > 10) {
        permissionText += '\n...and more';
      }
      
      embed.addFields({
        name: '<:4298eventer:1379103215857045637> > Key Permissions',
        value: permissionText,
        inline: false
      });
    }
    
    return message.reply({ embeds: [embed] });
  },
};