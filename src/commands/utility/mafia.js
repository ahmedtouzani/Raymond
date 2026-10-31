const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');

const GAME_URL = 'https://mafia.resvyo.com';

// Darija summary of the mafia-game repo's docs/RULES.md (29 playable roles).
const sections = {
  start: {
    label: 'كيفاش نبداو', emoji: '🎮',
    text: `## 🎮 كيفاش نبداو
1. دخل لـ **${GAME_URL}**، كتب سميتك وضغط **«إنشاء غرفة جديدة»**.
2. ضغط **«ادعُ أصدقاءك»** وصيفط الرابط هنا فالسيرفر. الرابط كيعمّر رمز الغرفة بوحدو.
3. ختار الإعدادات، ولا خلي التوزيع المتوازن كيفما هو.
4. ملي توصلو **6 لاعبين على الأقل** (حتى 24)، ضغط **«ابدأ اللعبة»**.

> 💡 دخلو لروم صوتي باش تهضرو مع بعضياتكم فالنهار.
> كاين جوج أوضاع: **أوتوماتيك** (اللعبة كتسير راسها)، ولا مع **راوي** كيشوف كلشي وكيحكي الليل.`,
  },
  idea: {
    label: 'الفكرة ديال اللعبة', emoji: '🎩',
    text: `## 🎩 الفكرة ديال اللعبة
كل لاعب كياخد **دور سري**، وكاينين 3 ديال الجهات:
- 🏘️ **القرية:** الأغلبية. خاصهم يكتاشفو المافيا ويعدموهم بالتصويت.
- 🔪 **المافيا:** كيعرفو بعضياتهم، كيهضرو بيناتهم فالليل وكيقتلو واحد كل ليلة.
- 🎭 **المنفردين:** كل واحد عندو هدف ديالو بوحدو.

الكل كيعرف **شنو هي الأدوار اللي كاينة فاللعبة وشحال من واحد فكل دور**، ولكن حتى واحد ما كيعرف شكون عندو أش. إلا شي واحد قال «أنا الطبيب» وما كاينش طبيب فاللعبة… راه كيكذب 😏`,
  },
  phases: {
    label: 'مراحل اللعبة', emoji: '🌙',
    text: `## 🌙 مراحل اللعبة
1. **توزيع الأدوار:** كل واحد كيشوف الدور ديالو، والمافيا كيشوفو بعضياتهم.
2. **الليل (45ث):** كل دور كيدير القدرة ديالو بالسر، والمافيا كيختارو الضحية. فالليلة اللولة غير المافيا اللي تقدر تقتل.
3. **الفجر:** كيتعلنو الموتى، وكيخرج **تقرير الليل**: شنو حاول كل دور وواش نجح، **بلا أسامي**.
4. **النهار:** نقاش حر (15ث لكل واحد حي)، ولا كل واحد كيهضر فالنوبة ديالو.
5. **التصويت (30ث)** ← **منصة الدفاع (30ث)** ← تصويت من جديد.
6. **الإعدام:** كيتكشف الدور ديال المعدوم، ومن بعد كيرجع الليل.

> ☠️ اللي مات كيدخل لدردشة الموتى، وما بقاش يقدر يكتب فالدردشة العامة.`,
  },
  vote: {
    label: 'التصويت والإعدام', emoji: '🗳️',
    text: `## 🗳️ التصويت والإعدام
- كل واحد حي عندو **صوت واحد**، ويقدر يبدلو ولا يحيدو حتى يسالي الوقت.
- التصويت **علني** (الكل كيشوف شكون صوت على شكون)، إلا ما دارهش المضيف سري.
- **«لا أحد»** مسموح **غير فالنهار اللول**. من النهار التاني خاصك تختار متهم.
- اللي جاب **أكثر الأصوات** كيطلع لـ**منصة الدفاع** وكيهضر بوحدو باش يدافع على راسو.
- من بعد كيتعاود التصويت (الأصوات كتبقى). إلا بقى هو اللول **كيتعدم**.
- **التعادل = حتى واحد ما كيتعدم**، ونمشيو نيشان لليل.
- العمدة المكشوف ورئيس القرية **صوتهم بجوج**.`,
  },
  win: {
    label: 'شكون كيربح', emoji: '🏆',
    text: `## 🏆 شكون كيربح
- 🏘️ **القرية:** ملي ما يبقى حتى مافيا حي **ولا حتى دور منفرد** حي.
- 🔪 **المافيا:** ملي يولي عدد المافيا الحيين **قد الباقين ولا كثر**، ولا يبقاو **3 حيين ولا قل** وفيهم مافيا.
- 🃏 **المهرج:** كيربح إلا **تعدم بالتصويت**، واللعبة كتكمل.
- 🎭 **دور منفرد بعد ما تموت المافيا:** اللعبة كتكمل، وكيربح بوحدو إلا بقاو 3 حيين ولا قل وهو معاهم.
- 💘 **عشاق كيوبيد** (واحد مافيا وواحد ماشي مافيا): كيربحو بوحدهم إلا بقاو هوما آخر جوج.`,
  },
  town: {
    label: 'أدوار القرية (19)', emoji: '🏘️',
    text: `## 🏘️ أدوار القرية
👤 **المواطن:** ما عندو حتى قدرة. السلاح ديالو هو الصوت والملاحظة.
🔎 **المحقق:** كل ليلة كيفحص واحد ويعرف واش مافيا ولا لا (العرّاب كيبان بريء).
🩺 **الطبيب:** كل ليلة كيحمي واحد من قتل المافيا. راسو غير مرة وحدة.
🐾 **المتعقّب:** كل ليلة كيتبع واحد ويعرف شكون زارو.
🗳️ **العمدة:** كيكشف راسو فالنهار ويولي صوتو بجوج.
🏹 **الصياد:** ملي كيموت كياخد معاه واحد.
🧱 **المعطّل:** كل ليلة كيوقف القدرة ديال واحد.
🧪 **الساحرة:** جوج جرعات: دوا كينقذ اللي غيموت الليلة، وسم كيقتل.
🎯 **القناص:** رصاصة وحدة فاللعبة. إلا قتل واحد من القرية كيموت معاه بالندم.
👦 **الابن الصالح:** كيعرف باه. إلا القرية قتلات باه كيقلب مع المافيا.
🪶 **الغراب:** كيعلّم على واحد: جوج أصوات زايدين ضدو فتصويت غدا.
🦉 **البومة:** كتختار واحد: جوج أصوات ناقصين ضدو فتصويت غدا.
💧 **القسيس:** ماء مقدس مرة وحدة: كيقتل أي واحد طاح عليه.
👧 **البنت الصغيرة:** كتسول على واحد، والصياد هو اللي كيوصلو الدور ديالو.
🪤 **مول الفخ:** كيحط فخ عند واحد: أي مافيوزي زارو كيموت.
🐉 **التنين:** لهب كيحرق المافيا وكيرجع ليه. إلا حرق واحد من القرية كيموت هو.
😈 **المستفز:** كيستفز واحد: يا يكشف ليه الدور ديالو، يا يبدا التصويت وعليه جوج أصوات.
💘 **كيوبيد:** كيربط جوج عشاق: كيعيشو ويموتو مع بعض.
🎖️ **الديكتاتور:** مرة وحدة كيقلب حكم الإعدام على واحد آخر. إلا غلط كيموت بالندم.`,
  },
  mafia: {
    label: 'أدوار المافيا (7)', emoji: '🔪',
    text: `## 🔪 أدوار المافيا
👑 **العرّاب:** القائد. صوتو كيحسم، وكيبان بريء قدام المحقق.
🔫 **المنفّذ:** هو اللي كيمشي عند الضحية.
🕸️ **المبتز:** كيبتز واحد: ما يهضرش وما يصوتش فالنهار.
⛓️ **المافيا الحمراء:** كتشل القدرة ديال واحد ماشي من المافيا.
🟢 **المافيا الخضراء:** كتخمن الدور ديال واحد: إلا صابت كتسرقو ويولي مواطن.
🌹 **المافيا الوردية:** كتحكم على واحد بتحدي يديرو فنقاش غدا (مع الراوي).
🦠 **المافيا المعدية:** مرة وحدة كتعدي واحد ويولي من المافيا. ديك الليلة ما كاينش قتل.`,
  },
  solo: {
    label: 'الأدوار المنفردة (3)', emoji: '🎭',
    text: `## 🎭 الأدوار المنفردة
🃏 **المهرج:** كيربح إلا **تعدم بالتصويت**. خاصو يخلي الناس يشكو فيه.
👽 **الفضائي:** كينزل فالنقاش وكيخمن: إلا صاب كيختطف اللاعب. إلا غلط بزاف كيموت.
🛢️ **الزيّات:** كيزيّت اللاعبين بالسر، ومن بعد كيشعل فيهم النار كاملين دقة وحدة.

> المافيا ما تقدرش تقتل دور منفرد، ولكن أدوار القرية والتصويت كيأثرو فيه عادي.`,
  },
};

const text = content => new TextDisplayBuilder().setContent(content);
const separator = () => new SeparatorBuilder().setDivider(true);

function sectionMenu() {
  return new StringSelectMenuBuilder().setCustomId('mafia:rules').setPlaceholder('📖 ختار شنو بغيتي تفهم من القوانين')
    .addOptions(Object.entries(sections).map(([value, section]) => ({ value, label: section.label, emoji: section.emoji })));
}

function renderCard() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`## 🎩 لعبة المافيا
لعبة جماعية أونلاين: **من 6 حتى 24 لاعب**، و**29 دور**، وكتلعبها من التيليفون ولا من البيسي بلا ما تيليشارجي والو.
المافيا مخبيين بيناتكم… واش غتكتاشفوهم قبل ما يكملو عليكم؟ 🔪`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text('**كيفاش:** واحد يكريي غرفة فالموقع ويصيفط الرابط هنا، والباقين يدخلو منو. ختار من اللائحة باش تقرا القوانين.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(sectionMenu()))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(GAME_URL).setLabel('العب دابا').setEmoji('▶️'),
    ));
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

function renderSection(key) {
  const section = sections[key] || sections.start;
  const container = new ContainerBuilder().addTextDisplayComponents(text(section.text))
    .addSeparatorComponents(separator())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(GAME_URL).setLabel('العب دابا').setEmoji('▶️'),
    ));
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

// Routed from interactionCreate for every `mafia:` component, so the menu keeps working after restarts.
// Each answer is private to the member who asked, so many people can read the rules at once.
async function handleInteraction(interaction) {
  if (interaction.customId !== 'mafia:rules' || !interaction.isStringSelectMenu()) return;
  return interaction.reply(renderSection(interaction.values[0]));
}

module.exports = {
  name: 'mafia',
  aliases: ['مافيا'],
  description: 'Starts a Mafia game on mafia.resvyo.com and explains the rules in Darija.',
  usage: '=mafia',
  category: 'Utility',
  cooldown: 10,
  sections,
  renderCard,
  renderSection,
  handleInteraction,

  async execute(message) {
    return message.channel.send(renderCard());
  },
};
