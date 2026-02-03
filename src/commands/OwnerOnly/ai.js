const { EmbedBuilder } = require('discord.js');
const aiService = require('../../services/ai');
const aiMemory = require('../../database/aiMemory');

module.exports = {
    name: 'ai',
    description: 'Ask Raymond (AI) a question.',
    usage: 'ai <prompt>',
    aliases: ['ask', 'gpt', 'gemini'],
    category: 'OwnerOnly', // Ensures it's categorized correctly

    async execute(message, args) {
        console.log('[AI Command] Triggered by:', message.author.id, message.author.tag);

        // Owner check is typically handled by the command handler based on folder/category
        // But for safety in this specific "OwnerOnly" folder logic:
        const config = require('../../config/dev-server');
        // Simple check if user is owner. 
        // Assuming your bot has an ownerID in config or env. 
        // For now, relying on the folder structure and handler logic if it exists.
        // If not, we can add a manual check here:
        if (process.env.OWNER_ID && message.author.id !== process.env.OWNER_ID) {
            console.log('[AI Command] Blocked: User is not owner.');
            // return; // Fail silently or reply
        }

        if (!args.length) {
            return message.reply('Please provide a prompt. Usage: `!ai <question>`');
        }

        const sub = String(args[0] || '').toLowerCase();
        const isOwner = !process.env.OWNER_ID || message.author.id === process.env.OWNER_ID;

        if (sub === 'remember') {
            if (!isOwner) return message.reply('Only the bot owner can modify AI memory.');

            const value = args.slice(1).join(' ').trim();
            if (!value) return message.reply('Usage: `!ai remember <fact>`');

            try {
                const saved = await aiMemory.addMemory(value, {
                    createdBy: message.author.id,
                });
                return message.reply(`✅ Saved memory (#${saved.id}).`);
            } catch (error) {
                console.error('[AI Command] Memory remember error:', error);
                return message.reply(`❌ Error saving memory: ${error.message}`);
            }
        }

        if (sub === 'memories' || sub === 'memory') {
            if (!isOwner) return message.reply('Only the bot owner can view AI memory.');

            const limit = Number(args[1] || 10);
            try {
                const rows = await aiMemory.listMemories({ limit });
                if (!rows.length) return message.reply('No memories saved yet.');

                const text = rows
                    .map(r => `#${r.id}: ${String(r.value || '').slice(0, 200)}`)
                    .join('\n');

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('Raymond Memory')
                    .setDescription(text.length > 4096 ? text.slice(0, 4090) + '…' : text)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('[AI Command] Memory list error:', error);
                return message.reply(`❌ Error listing memories: ${error.message}`);
            }
        }

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

        const prompt = args.join(' ');
        console.log('[AI Command] Prompt:', prompt);

        // Indicate processing
        const processingMsg = await message.reply('Thinking... 🧠');

        try {
            console.log('[AI Command] Calling AI Service...');
            const response = await aiService.generateResponse(prompt, {
                userName: message.author.username,
                guildName: message.guild.name
            });
            console.log('[AI Command] Response received, length:', response.length);

            // Discord message limit is 2000 chars
            const safeResponse = response.length > 2000 ? response.slice(0, 1990) + '...' : response;
            await processingMsg.edit({ content: safeResponse, embeds: [] });

        } catch (error) {
            console.error('[AI Command] Error:', error);
            await processingMsg.edit(`❌ Error: ${error.message}`);
        }
    }
};
