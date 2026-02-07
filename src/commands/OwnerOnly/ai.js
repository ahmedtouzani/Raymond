const { EmbedBuilder } = require('discord.js');
const aiService = require('../../services/ai');
const aiMemory = require('../../database/aiMemory');
const aiChatUsageHourly = require('../../database/aiChatUsageHourly');
const aiConversationHistory = require('../../database/aiConversationHistory');

module.exports = {
    name: 'ai',
    description: 'Ask Raymond (AI) a question.',
    usage: 'ai <prompt>',
    aliases: ['ask', 'gpt', 'gemini'],
    category: 'OwnerOnly',
    prefixless: true,

    async execute(message, args) {
        const isOwner = !process.env.OWNER_ID || message.author.id === process.env.OWNER_ID;

        if (!args.length) {
            const { createUsageEmbed } = require('../../utils/embed');
            const embed = await createUsageEmbed(message.guild.id, {
                command: 'ai',
                description: 'Talk to **Raymond Reddington** (AI with semantic memory).\\nHe learns from your conversation and remembers what you tell him.',
                usage: '`!ai <message>`\\n`!ai remember <fact>`\\n`!ai memories`\\n`!ai forget <id>`',
                examples: '`!ai Who is the president?`\\n`!ai remember My name is Ahmed`\\n`!ai memories`'
            });
            return message.reply({ embeds: [embed] });
        }

        const sub = String(args[0] || '').toLowerCase();

        // ===== REMEMBER SUBCOMMAND =====
        if (sub === 'remember') {
            if (!isOwner) return message.reply('Only the bot owner can modify AI memory.');

            const value = args.slice(1).join(' ').trim();
            if (!value) return message.reply('Usage: `!ai remember <fact>`');

            try {
                const saved = await aiMemory.addMemory(value, {
                    createdBy: message.author.id,
                });
                return message.reply(`✅ Saved memory (#${saved.id}) with embedding.`);
            } catch (error) {
                console.error('[AI Command] Memory remember error:', error);
                return message.reply(`❌ Error saving memory: ${error.message}`);
            }
        }

        // ===== MEMORIES SUBCOMMAND =====
        if (sub === 'memories' || sub === 'memory') {
            if (!isOwner) return message.reply('Only the bot owner can view AI memory.');

            const limit = Number(args[1] || 10);
            try {
                const rows = await aiMemory.listMemories({ limit });
                if (!rows.length) return message.reply('No memories saved yet.');

                const text = rows
                    .map(r => {
                        const hasEmbedding = r.embedding ? '🧠' : '📝';
                        return `${hasEmbedding} #${r.id}: ${String(r.value || '').slice(0, 150)}`;
                    })
                    .join('\\n');

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('Raymond Memory')
                    .setDescription(text.length > 4096 ? text.slice(0, 4090) + '…' : text)
                    .setFooter({ text: '🧠 = Has embedding | 📝 = Keyword only' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('[AI Command] Memory list error:', error);
                return message.reply(`❌ Error listing memories: ${error.message}`);
            }
        }

        // ===== FORGET SUBCOMMAND =====
        if (sub === 'forget' || sub === 'delete') {
            if (!isOwner) return message.reply('Only the bot owner can modify AI memory.');

            const id = Number(args[1]);
            if (!Number.isInteger(id) || id <= 0) return message.reply('Usage: `!ai forget <id>`');

            try {
                const ok = await aiMemory.deleteMemory(id);
                return message.reply(ok ? `✅ Deleted memory (#${id}).` : `Memory (#${id}) not found.`);
            } catch (error) {
                console.error('[AI Command] Memory forget error:', error);
                return message.reply(`❌ Error deleting memory: ${error.message}`);
            }
        }

        // ===== AI CHAT WITH NEW FEATURES =====

        // Check hourly rate limit
        const rateLimit = await aiChatUsageHourly.checkRateLimit(message.guild.id, message.author.id);

        if (!rateLimit.allowed) {
            const resetTime = new Date();
            resetTime.setMinutes(0, 0, 0);
            resetTime.setHours(resetTime.getHours() + 1);
            const minutesLeft = Math.ceil((resetTime - Date.now()) / 60000);

            return message.reply(
                `⏱️ **Hourly limit reached** (${rateLimit.used}/${rateLimit.limit} messages).\\nTry again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
            );
        }

        const prompt = args.join(' ');
        const processingMsg = await message.reply('Thinking... 🧠');

        try {
            // Fetch conversation history from database (last 3 messages for this user)
            const history = await aiConversationHistory.getUserConversationHistory(
                message.guild.id,
                message.author.id,
                3
            ).catch(() => []);

            // Generate response with full context (includes semantic memory search)
            const response = await aiService.generateResponse(prompt, {
                userName: message.author.username,
                userId: message.author.id,
                guildName: message.guild.name,
                history
            });

            // Increment hourly usage counter
            await aiChatUsageHourly.incrementHourlyUsage(message.guild.id, message.author.id).catch(() => { });

            // Save conversation to database
            await aiConversationHistory.saveUserMessage(
                message.guild.id,
                message.author.id,
                prompt,
                message.id
            ).catch(() => { });

            // Discord message limit is 2000 chars
            const safeResponse = response.length > 1900 ? response.slice(0, 1890) + '…' : response;
            await processingMsg.edit({ content: safeResponse, embeds: [] });

            // Save bot response to database
            await aiConversationHistory.saveBotResponse(
                message.guild.id,
                message.author.id,
                safeResponse,
                processingMsg.id
            ).catch(() => { });

            // Cleanup old conversation history (keep last 10 messages)
            await aiConversationHistory.cleanupOldHistory(
                message.guild.id,
                message.author.id,
                10
            ).catch(() => { });

        } catch (error) {
            console.error('[AI Command] Error:', error);
            await processingMsg.edit(`❌ Error: ${error.message}`);
        }
    }
};
