const path = require('path');
const { getRoleMenu } = require(path.join(process.cwd(), 'src/database/roleMenus'));
const logger = require(path.join(process.cwd(), 'src/utils/logger'));
const { EmbedBuilder } = require('discord.js');

async function handleRoleMenuInteraction(interaction) {
    const customId = interaction.customId;

    // Parse ID: rm_btn_<menuId>_<roleId> OR rm_sel_<menuId>
    const parts = customId.split('_');
    const type = parts[1]; // 'btn' or 'sel'
    const menuId = parts[2];

    if (!menuId) return interaction.reply({ content: '❌ Invalid menu interaction.', ephemeral: true });

    // Defer immediately to prevent "Unknown interaction" timeout
    await interaction.deferReply({ ephemeral: true });

    // Fetch Menu Logic
    const menu = await getRoleMenu(menuId);
    if (!menu) return interaction.editReply({ content: '❌ This menu no longer exists.' });

    const member = interaction.member;
    const guild = interaction.guild;

    if (type === 'btn') {
        const roleId = parts[3];
        await handleButton(interaction, menu, roleId, member, guild);
    } else if (type === 'sel') {
        const selectedRoleIds = interaction.values;
        await handleSelect(interaction, menu, selectedRoleIds, member, guild);
    }
}

async function handleButton(interaction, menu, roleId, member, guild) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return interaction.editReply({ content: '❌ This role has been deleted from the server.' });

    const hasRole = member.roles.cache.has(roleId);

    try {
        if (menu.mode === 'SINGLE') {
            // Remove all other roles from this menu first
            const allOptionIds = menu.options.map(o => o.role_id);
            const toRemove = allOptionIds.filter(id => id !== roleId && member.roles.cache.has(id));

            if (toRemove.length > 0) {
                await member.roles.remove(toRemove);
            }

            // Always add/keep the clicked one (Radio behavior: clicking selected doesn't untoggle usually, but let's toggle if it's the *only* one? No, Radio implies selection.)
            // Actually, if they already have it, maybe do nothing or re-apply? 
            // Let's toggle OFF if they click the SAME one? Standard Single Choice usually strictly switches.
            // But if I want to unselect, I can't. Let's make it strict switch.

            if (!hasRole) {
                await member.roles.add(roleId);
                return interaction.editReply({ content: `✅ **${role.name}** selected.` });
            } else {
                return interaction.editReply({ content: `✅ You already have **${role.name}**.` });
            }

        } else {
            // TOGGLE MODE
            if (hasRole) {
                await member.roles.remove(roleId);
                return interaction.editReply({ content: `❌ Removed **${role.name}**.` });
            } else {
                await member.roles.add(roleId);
                return interaction.editReply({ content: `✅ Added **${role.name}**.` });
            }
        }
    } catch (error) {
        logger.error(`Failed to change role for ${member.user.tag}:`, error);
        return interaction.editReply({ content: '❌ I failed to give/take that role. Check my permissions!', ephemeral: true });
    }
}

async function handleSelect(interaction, menu, selectedRoleIds, member, guild) {
    // Current approach for Multiselect Dropdown: 
    // The interaction.values contains the NEW state of selected items (if standard discord logic matches)
    // BUT, we set Min/Max values.
    // If Toggle Mode: standard Select Menu.

    // HOWEVER: Discord Select Menus in "persistent" messages don't remember user state.
    // They are stateless. So `interaction.values` is just what they clicked NOW.

    // Strategy:
    // 1. Get all roles associated with this menu.
    // 2. Identify which ones the user selected in this specific interaction.
    // 3. For SINGLE mode: logic is easy (Max 1).
    // 4. For TOGGLE mode (Max 25): we treat the selection as "The exact list of roles I want from this specific menu".
    //    So we ADD all in `selectedRoleIds` and REMOVE any valid menu options NOT in `selectedRoleIds`.

    const allMenuRoleIds = menu.options.map(o => o.role_id);
    const toAdd = selectedRoleIds;
    // For Select Menu, we remove UNSELECTED options that belong to this menu.
    const toRemove = allMenuRoleIds.filter(id => !selectedRoleIds.includes(id) && member.roles.cache.has(id));

    try {
        if (toRemove.length > 0) await member.roles.remove(toRemove);
        if (toAdd.length > 0) await member.roles.add(toAdd);

        const addedNames = toAdd.map(id => guild.roles.cache.get(id)?.name).filter(Boolean).join(', ');

        // If empty selection
        if (toAdd.length === 0) {
            return interaction.editReply({ content: `✅ cleared roles from this menu.` });
        }

        return interaction.editReply({
            content: `✅ Updated roles!\nCurrent: **${addedNames}**`
        });

    } catch (error) {
        logger.error(`Failed to batch update roles for ${member.user.tag}:`, error);
        return interaction.editReply({ content: '❌ Failed to update roles. Check permissions.' });
    }
}

module.exports = { handleRoleMenuInteraction };
