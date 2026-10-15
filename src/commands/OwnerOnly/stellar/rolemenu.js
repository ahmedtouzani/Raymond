const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType
} = require('discord.js');
const path = require('path');
const { hasStellarOrHigher } = require(path.join(process.cwd(), 'src/premium/premium'));
const { createRoleMenu, addMenuOption } = require(path.join(process.cwd(), 'src/database/roleMenus'));
const logger = require(path.join(process.cwd(), 'src/utils/logger'));

module.exports = {
  name: 'rolemenu',
  description: 'Manage Self Role Menus (Stellar+)',
  category: 'Premium',
  // ownerOnly: true, // Also checked via permissions usually
  prefixless: true,

  async execute(message, args) {
    logger.info(`[RoleMenu] Command triggered by ${message.author.tag} in ${message.guild.id}`);

    // Permission Check: Admin or Owner
    if (!message.member.permissions.has('Administrator') && message.author.id !== process.env.OWNER_ID) {
      return message.reply(' You need **Administrator** permissions to use this.');
    }

    // 1. Premium Check
    const isPremium = await hasStellarOrHigher(message.guild.id);
    logger.info(`[RoleMenu] Premium Status for ${message.guild.id}: ${isPremium}`);

    if (!isPremium) {
      return message.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Premium Locked').setDescription('This feature requires the **Stellar Matrix** plan.').setColor(0xFFD700)] });
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'create') {
      return startWizard(message);
    }

    // Default Help
    // Default Help
    const { createUsageEmbed } = require('../../../utils/embed');
    const embed = await createUsageEmbed(message.guild.id, {
      command: 'rolemenu',
      description: 'Manage Self Role Menus',
      usage: '`!rolemenu create`',
      examples: '`!rolemenu create`'
    });
    return message.reply({ embeds: [embed] });
  }
};

/**
 * Interactive Wizard to create a menu
 */
async function startWizard(message) {
  const authorId = message.author.id;
  const channel = message.channel;

  // -- Helper for collecting one message --
  const ask = async (promptEmbed, validator = null) => {
    await channel.send({ embeds: [promptEmbed] });
    try {
      const collected = await channel.awaitMessages({
        filter: m => m.author.id === authorId,
        max: 1,
        time: 60000,
        errors: ['time']
      });
      const content = collected.first().content;
      if (content.toLowerCase() === 'cancel') throw new Error('cancelled');

      if (validator) {
        const valid = await validator(collected.first());
        if (!valid) return ask(new EmbedBuilder().setDescription('Invalid input. Try again or type `cancel`.').setColor(0xFF0000), validator);
      }
      return collected.first();
    } catch (e) {
      if (e.message === 'cancelled') {
        channel.send(' Wizard cancelled.');
        return null;
      }
      channel.send(' Timeout. Wizard cancelled.');
      return null;
    }
  };

  // -- DEFAULTS --
  const PARALLEL_DEFAULTS = {
    thumbnail: 'https://cdn.discordapp.com/banners/1038540608396066856/a_d7b13b74fae7e97e33c0c2f34063a772.gif?size=4096',
    author: 'Parallel Universe',
    authorIcon: 'https://images-ext-1.discordapp.net/external/8JK61rAB-ztUkKEvTV5DWxDGeCIDVQKzi0RMu1ap4to/https/cdn.discordapp.com/icons/1351735584548196362/87423c4a305986dba88cdd920141da54.webp?format=webp',
    footer: 'Powered by Parallel Team'
  };

  // STEP 0: Template Selection (Quick Setup)
  const templateEmbed = new EmbedBuilder()
    .setTitle('✨ Role Menu Setup')
    .setDescription('Choose a **Quick Template** or create a **Custom** menu.')
    .setColor(0x5865F2)
    .setThumbnail(PARALLEL_DEFAULTS.thumbnail)
    .setFooter({ text: PARALLEL_DEFAULTS.footer });

  const templateRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tpl_games').setLabel('Games').setStyle(ButtonStyle.Success).setEmoji('🎮'),
    new ButtonBuilder().setCustomId('tpl_profile').setLabel('Profile').setStyle(ButtonStyle.Primary).setEmoji('👤'),
    new ButtonBuilder().setCustomId('tpl_colors').setLabel('Colors').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
    new ButtonBuilder().setCustomId('tpl_custom').setLabel('Custom').setStyle(ButtonStyle.Secondary).setEmoji('✏️')
  );

  const tplMsg = await channel.send({ embeds: [templateEmbed], components: [templateRow] });
  let template = 'CUSTOM';
  try {
    const i = await tplMsg.awaitMessageComponent({ filter: i => i.user.id === authorId, time: 60000 });
    template = i.customId; // tpl_games, tpl_profile, tpl_colors, tpl_custom
    await i.deferUpdate();
  } catch { return channel.send(' Timeout.'); }

  // Variables to populate
  let title, description, type, mode, embed_color, thumbnail, image, footer, author_name, author_icon;

  // -- APPLY TEMPLATES --
  if (template !== 'tpl_custom') {
    // Default Visuals for ALL Templates
    thumbnail = PARALLEL_DEFAULTS.thumbnail;
    author_name = PARALLEL_DEFAULTS.author;
    author_icon = PARALLEL_DEFAULTS.authorIcon;
    footer = PARALLEL_DEFAULTS.footer;
    type = 'BUTTON'; // Default to buttons for templates
    embed_color = null; // Default Grey

    if (template === 'tpl_games') {
      title = '🎮 Game Roles';
      description = 'Select the games you play to unlock their channels!';
      mode = 'TOGGLE';
    } else if (template === 'tpl_profile') {
      title = '👤 Profile Roles';
      description = 'Customize your profile identity.';
      mode = 'SINGLE';
    } else if (template === 'tpl_colors') {
      title = '🎨 Color Roles';
      description = 'Choose your username color!';
      mode = 'SINGLE';
    }

  } else {
    // -- CUSTOM WIZARD (Original Flow) --

    // 1. Title
    const titleMsg = await ask(new EmbedBuilder().setTitle('Step 1/8: Embed Title').setDescription('What should be the **Title** of your menu?').setColor(0x5865F2));
    if (!titleMsg) return;
    title = titleMsg.content;

    // 2. Description
    const descMsg = await ask(new EmbedBuilder().setTitle('Step 2/8: Embed Description').setDescription('Send the description text (or type `skip` for none).').setColor(0x5865F2));
    if (!descMsg) return;
    description = descMsg.content.toLowerCase() === 'skip' ? null : descMsg.content;

    // 3. Visuals
    const visualEmbed = new EmbedBuilder().setTitle('Step 3/8: Customize Visuals?').setDescription('Do you want to customize the **Color**, **Images**, and **Footer**?').setColor(0x5865F2);
    const visualRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('w_vis_yes').setLabel('Yes, Customize!').setStyle(ButtonStyle.Success).setEmoji('🎨'),
      new ButtonBuilder().setCustomId('w_vis_no').setLabel('No, use defaults').setStyle(ButtonStyle.Secondary)
    );
    const visualMsg = await channel.send({ embeds: [visualEmbed], components: [visualRow] });

    let customizeVisuals = false;
    try {
      const i = await visualMsg.awaitMessageComponent({ filter: i => i.user.id === authorId, time: 60000 });
      customizeVisuals = (i.customId === 'w_vis_yes');
      await i.deferUpdate();
    } catch { return channel.send(' Timeout.'); }

    if (customizeVisuals) {

      // Ask Color
      const colorMsg = await ask(new EmbedBuilder().setDescription('🎨 **Embed Color?** (Hex e.g. `#FF0000`, name `RED`, or `skip`)').setColor(0x5865F2));
      if (!colorMsg) return;
      embed_color = colorMsg.content.toLowerCase() === 'skip' ? null : colorMsg.content;

      if (embed_color && embed_color.length > 20) { channel.send('<a:warningbug:1467300628907954300> Color code too long! Defaulting to Grey.'); embed_color = null; }

      // Ask Thumbnail
      const thumbMsg = await ask(new EmbedBuilder().setDescription('🖼️ **Thumbnail URL?** (Small image top right, or `skip`)').setColor(0x5865F2));
      if (!thumbMsg) return;
      thumbnail = thumbMsg.content.toLowerCase() === 'skip' ? null : thumbMsg.content;

      // Ask Image
      const imgMsg = await ask(new EmbedBuilder().setDescription('🌄 **Main Image URL?** (Big image at bottom, or `skip`)').setColor(0x5865F2));
      if (!imgMsg) return;
      image = imgMsg.content.toLowerCase() === 'skip' ? null : imgMsg.content;

      // Ask Footer
      const footerMsg = await ask(new EmbedBuilder().setDescription('📝 **Footer Text?** (or `skip`)').setColor(0x5865F2));
      if (!footerMsg) return;
      footer = footerMsg.content.toLowerCase() === 'skip' ? null : footerMsg.content;

      // Ask Author
      const authorMsg = await ask(new EmbedBuilder().setDescription('👤 **Author Name?** (Top text, like a fake username, or `skip`)').setColor(0x5865F2));
      if (!authorMsg) return;
      if (authorMsg.content.toLowerCase() !== 'skip') {
        author_name = authorMsg.content;
        const iconMsg = await ask(new EmbedBuilder().setDescription('👤 **Author Icon URL?** (Avatar for the name, or `skip`)').setColor(0x5865F2));
        if (iconMsg && iconMsg.content.toLowerCase() !== 'skip') {
          author_icon = iconMsg.content;
        }
      }
    } else {
      // USER SAID "NO" TO CUSTOMIZING -> USE PARALLEL DEFAULTS!
      thumbnail = PARALLEL_DEFAULTS.thumbnail;
      author_name = PARALLEL_DEFAULTS.author;
      author_icon = PARALLEL_DEFAULTS.authorIcon;
      footer = PARALLEL_DEFAULTS.footer;
    }

    // 4. Type
    const typeEmbed = new EmbedBuilder().setTitle('Step 4/8: Menu Style').setDescription('Select how users will pick roles.').setColor(0x5865F2);
    const typeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('w_btn').setLabel('Buttons').setStyle(ButtonStyle.Primary).setEmoji('🔘'),
      new ButtonBuilder().setCustomId('w_sel').setLabel('Dropdown Menu').setStyle(ButtonStyle.Secondary).setEmoji('📂')
    );
    const typeMsg = await channel.send({ embeds: [typeEmbed], components: [typeRow] });
    try {
      const i = await typeMsg.awaitMessageComponent({ filter: i => i.user.id === authorId, time: 60000 });
      type = (i.customId === 'w_btn') ? 'BUTTON' : 'SELECT';
      await i.deferUpdate();
    } catch { return channel.send(' Timeout.'); }

    // 5. Mode
    const modeEmbed = new EmbedBuilder().setTitle('Step 5/8: Selection Mode').setDescription('**Toggle**: Best for Games.\n**Single**: Best for Gender/Colors.').setColor(0x5865F2);
    const modeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('w_toggle').setLabel('Toggle (Multi)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('w_single').setLabel('Single (One Only)').setStyle(ButtonStyle.Danger)
    );
    const modeMsg = await channel.send({ embeds: [modeEmbed], components: [modeRow] });
    try {
      const i = await modeMsg.awaitMessageComponent({ filter: i => i.user.id === authorId, time: 60000 });
      mode = (i.customId === 'w_toggle') ? 'TOGGLE' : 'SINGLE';
      await i.deferUpdate();
    } catch { return channel.send(' Timeout.'); }

  }

  // 6. Create Database Entry
  const menuData = {
    guildId: message.guild.id,
    name: title.substring(0, 50),
    title,
    description,
    type,
    mode,
    embed_color,
    thumbnail,
    image,
    footer,
    author_name,
    author_icon
  };
  let menu;
  try {
    menu = await createRoleMenu(menuData);
  } catch (error) {
    logger.error('[RoleMenu] Failed to create role menu (DB):', error);
    return channel.send(' Failed to create the role menu in the database. Please try again.');
  }

  // 7. Loop for Adding Roles
  let adding = true;
  const roles = [];

  while (adding) {
    const menuPreview = new EmbedBuilder()
      .setTitle(`Setup: ${title}`)
      .setDescription(`Current Roles: ${roles.length}\n\n${roles.map(r => `${r.emoji} **${r.label}**`).join('\n')}`)
      .setColor(0x5865F2);

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('add_role').setLabel('Add Role').setStyle(ButtonStyle.Success).setEmoji('➕'),
      new ButtonBuilder().setCustomId('finish').setLabel('Save & Post').setStyle(ButtonStyle.Primary).setEmoji('💾'),
      new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );

    const menuMsg = await channel.send({ embeds: [menuPreview], components: [actionRow] });

    try {
      const i = await menuMsg.awaitMessageComponent({ filter: i => i.user.id === authorId, time: 300000 }); // 5 min timeout
      if (i.customId === 'cancel') {
        await i.update({ content: ' Creation cancelled.', components: [] });
        return;
      }
      if (i.customId === 'finish') {
        if (roles.length === 0) {
          await i.reply({ content: ' You need at least one role!', ephemeral: true });
          continue;
        }
        await i.deferUpdate();
        return sendRoleMenu(message, menu, roles); // Finish!
      }

      // ADD ROLE FLOW
      await i.deferUpdate();
      await menuMsg.delete(); // Cleanup previous UI

      // Ask for Role
      const roleMsg = await ask(new EmbedBuilder().setDescription('Ping the **Role** or send its ID.').setColor(0x5865F2), async (m) => {
        const r = m.mentions.roles.first() || m.guild.roles.cache.get(m.content.trim());
        return !!r;
      });
      if (!roleMsg) return;
      const roleObj = roleMsg.mentions.roles.first() || message.guild.roles.cache.get(roleMsg.content.trim());

      // Ask for Label
      const labelMsg = await ask(new EmbedBuilder().setDescription(`Selected **${roleObj.name}**. What should the button/label say?`).setColor(0x5865F2));
      const label = labelMsg.content;

      // Ask for Emoji
      const emojiMsg = await ask(new EmbedBuilder().setDescription('Send an **Emoji** for this role (or `skip`).').setColor(0x5865F2));
      const emoji = emojiMsg.content.toLowerCase() === 'skip' ? null : emojiMsg.content;

      // Style (if Button)
      let style = 'Secondary'; // Grey
      if (type === 'BUTTON') {
        const styleEmbed = new EmbedBuilder().setDescription('Choose Button Color').setColor(0x5865F2);
        const styleRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('Primary').setLabel('Blurple').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('Secondary').setLabel('Grey').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('Success').setLabel('Green').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('Danger').setLabel('Red').setStyle(ButtonStyle.Danger)
        );
        const styleAsk = await channel.send({ embeds: [styleEmbed], components: [styleRow] });
        try {
          const si = await styleAsk.awaitMessageComponent({ filter: ii => ii.user.id === authorId, time: 30000 });
          style = si.customId;
          await si.deferUpdate();
          await styleAsk.delete();
        } catch { }
      }

      // Description (if Select)
      let roleDesc = null;
      if (type === 'SELECT') {
        const rdMsg = await ask(new EmbedBuilder().setDescription('Dropdown Description? (or `skip`)').setColor(0x5865F2));
        if (rdMsg) roleDesc = rdMsg.content.toLowerCase() === 'skip' ? null : rdMsg.content;
      }

      // Add to local list and DB
      await addMenuOption(menu.id, roleObj.id, label, emoji, style, roleDesc);
      roles.push({ label, emoji, style, description: roleDesc });

    } catch (e) {
      console.log(e);
      adding = false;
    }
  }
}

async function sendRoleMenu(message, menu, roles) {
  const channel = message.channel;

  // Construct the final embed
  const finalEmbed = new EmbedBuilder()
    .setTitle(menu.title)
    .setDescription(menu.description || 'Select your roles below!');

  try {
    finalEmbed.setColor(menu.embed_color || 0x2B2D31);
  } catch (e) {
    console.warn(`[RoleMenu] Invalid color '${menu.embed_color}', falling back to default.`);
    finalEmbed.setColor(0x2B2D31);
  }

  // Safe Setters for Images
  try {
    if (menu.thumbnail && menu.thumbnail.startsWith('http')) finalEmbed.setThumbnail(menu.thumbnail);
  } catch (e) {
    console.warn(`[RoleMenu] Invalid thumbnail: ${menu.thumbnail}`);
  }

  try {
    if (menu.image && menu.image.startsWith('http')) finalEmbed.setImage(menu.image);
  } catch (e) {
    console.warn(`[RoleMenu] Invalid image: ${menu.image}`);
  }

  // Footer Logic
  const modeText = menu.mode === 'SINGLE' ? 'Select one role' : 'Select multiple roles';
  if (menu.footer) {
    finalEmbed.setFooter({ text: `${menu.footer} • ${modeText}` });
  } else {
    finalEmbed.setFooter({ text: modeText });
  }

  if (menu.author_name) {
    try {
      const iconURL = (menu.author_icon && menu.author_icon.startsWith('http')) ? menu.author_icon : undefined;
      finalEmbed.setAuthor({ name: menu.author_name, iconURL: iconURL });
    } catch (e) {
      console.warn(`[RoleMenu] Invalid author: ${e.message}`);
      finalEmbed.setAuthor({ name: menu.author_name });
    }
  }

  const components = [];

  if (menu.type === 'BUTTON') {
    // Batch buttons into rows of 5
    let currentRow = new ActionRowBuilder();
    const menuOptions = await require('../../../database/roleMenus').getRoleMenu(menu.id);

    menuOptions.options.forEach((opt, idx) => {
      const btn = new ButtonBuilder()
        .setCustomId(`rm_btn_${menu.id}_${opt.role_id}`)
        .setLabel(opt.label || 'Role')
        .setStyle(ButtonStyle[opt.style] || ButtonStyle.Secondary);

      if (opt.emoji) btn.setEmoji(opt.emoji);

      currentRow.addComponents(btn);
      if (currentRow.components.length === 5) {
        components.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
    });
    if (currentRow.components.length > 0) components.push(currentRow);

  } else {
    // SELECT MENU
    const menuOptions = await require('../../../database/roleMenus').getRoleMenu(menu.id);
    const select = new StringSelectMenuBuilder()
      .setCustomId(`rm_sel_${menu.id}`)
      .setPlaceholder('Select roles...')
      .setMinValues(0) // Logic handled in interaction
      .setMaxValues(1); // Logic handled in interaction or here? 
    // Actually, standard select menus act weirdly with state. 
    // For now, we set Max to 1 if SINGLE, or options.length if TOGGLE.

    if (menu.mode === 'TOGGLE') {
      select.setMaxValues(Math.min(menuOptions.options.length, 25));
    }

    const opts = menuOptions.options.map(o => ({
      label: o.label,
      value: o.role_id,
      emoji: o.emoji,
      description: o.description || undefined
    }));
    select.addOptions(opts);

    components.push(new ActionRowBuilder().addComponents(select));
  }

  // Post it!
  const postedMsg = await channel.send({ embeds: [finalEmbed], components: components });

  // Save Msg ID
  const { setMenuMessage } = require('../../../database/roleMenus');
  await setMenuMessage(menu.id, postedMsg.id, postedMsg.channelId);

  message.channel.send('<a:okey:1467170671351173121> **Menu Created & Posted!**');
}