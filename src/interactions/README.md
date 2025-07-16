# Slash Command Migration Plan (2025-06-01)

## Objective
Migrate traditional text/admin commands to Discord slash commands for a modern, discoverable, and user-friendly experience.

---

## Migration Steps

1. **Design Slash Command Structure**
   - Place all slash command files under `src/interactions/Command/`.
   - Use subfolders for categories if needed (e.g., Admin, Moderation, Utility).

2. **Implement Slash Command Handlers**
   - Create a handler (e.g., `slashCommandHandler.js`) to register and execute slash commands.
   - Use Discord.js v14+ `client.application.commands.set()` for registration.
   - Support per-guild and global registration.

3. **Refactor Existing Commands**
   - For each text/admin command (e.g., `setembedcolor`, `setembedfooter`, `setembedicon`):
     - Create a corresponding slash command file in `src/interactions/Command/`.
     - Use Discord.js `SlashCommandBuilder` for definitions.
     - Ensure permission checks and embed usage remain consistent.

4. **Embed System Integration**
   - All slash command responses should use the centralized `sendEmbed` utility and embed helpers.
   - Maintain per-guild customization for all embeds.

5. **Testing & Rollout**
   - Test each slash command in a test guild before global rollout.
   - Update documentation and help commands to reference slash commands.
   - Gradually deprecate old text commands after slash commands are live.

---

## Example Slash Command File
```js
// src/interactions/Command/setembedcolor.js
const { SlashCommandBuilder } = require('discord.js');
const { sendEmbed } = require('../../handlers/functions/sendEmbed');
const { setGuildEmbedSetting } = require('../../database/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setembedcolor')
    .setDescription('Set the embed color for this server (admin only).')
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Hex color (e.g. #5865F2)')
        .setRequired(true)),
  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return sendEmbed(interaction, { title: 'Permission Denied', description: 'Only administrators can change the embed color.' });
    }
    const hex = interaction.options.getString('color').replace(/^#/, '');
    if (!/^([A-Fa-f0-9]{6})$/.test(hex)) {
      return sendEmbed(interaction, { title: 'Invalid Color', description: 'Please provide a valid hex color (e.g. #5865F2).' });
    }
    await setGuildEmbedSetting(interaction.guild.id, 'color', parseInt(hex, 16));
    return sendEmbed(interaction, { title: 'Embed Color Updated', description: `Embed color set to **#${hex.toUpperCase()}**.` });
  },
};
```

---

## Notes
- Use the `ContectMenu` folder for context menu interactions if needed.
- Maintain centralized logging and changelog updates for all slash command usage.
- Update `PROJECT_SUMMARY.md` as you migrate each command.

---

_Last updated: 2025-06-01 02:20 BST_
