const aiService = require('./ai');
const aiMemory = require('../database/aiMemory');
const logger = require('../utils/logger');

/**
 * Memory Extraction Service
 * Automatically extracts and saves important facts from conversations
 */

class MemoryExtractor {
    constructor() {
        this.enabled = String(process.env.AI_AUTO_MEMORY_ENABLED || 'true').toLowerCase() === 'true';
        this.minMessageLength = Number(process.env.AI_AUTO_MEMORY_MIN_LENGTH || 15);
        this.cooldownMs = Number(process.env.AI_AUTO_MEMORY_COOLDOWN_MS || 3000);
        this.lastExtraction = new Map(); // userId -> timestamp
    }

    /**
     * Check if extraction is allowed for this user
     */
    canExtract(userId) {
        if (!this.enabled) return false;

        const lastTime = this.lastExtraction.get(userId) || 0;
        const now = Date.now();

        if (now - lastTime < this.cooldownMs) {
            return false; // Still in cooldown
        }

        return true;
    }

    /**
     * Extract facts from a conversation
     * @param {string} userMessage - User's message
     * @param {string} botResponse - Bot's response
     * @param {string} userId - Discord user ID
     * @param {string} userName - Discord username
     * @returns {Promise<Array<string>>} Array of extracted facts
     */
    async extractFacts(userMessage, botResponse, userId, userName) {
        if (!this.enabled) return [];
        if (!userMessage || userMessage.length < this.minMessageLength) return [];
        if (!this.canExtract(userId)) return [];

        try {
            const extractionPrompt = `Analyze this conversation and extract ONLY clearly stated facts worth remembering long-term.
You can respond in ENGLISH or ARABIC - use the same language as the conversation.

Focus on / ركز على:
- Personal information (name, age, location, occupation, hobbies) / معلومات شخصية (الاسم، العمر، الموقع، المهنة، الهوايات)
- Preferences (likes, dislikes, favorites) / التفضيلات (الإعجابات، عدم الإعجاب، المفضلات)
- Relationships (who knows who, family, friends) / العلاقات (من يعرف من، العائلة، الأصدقاء)
- Important events or dates / الأحداث أو التواريخ المهمة
- Current projects or goals / المشاريع أو الأهداف الحالية

Rules / القواعد:
- Only extract facts that are EXPLICITLY stated / استخرج فقط الحقائق المذكورة صراحة
- Each fact should be a short, clear statement (max 100 characters) / كل حقيقة يجب أن تكون عبارة قصيرة وواضحة
- Don't make assumptions or inferences / لا تفترض أو تستنتج
- Don't extract greetings, questions, or casual chat / لا تستخرج التحيات أو الأسئلة أو الدردشة العادية
- Format: One fact per line, starting with "- " / التنسيق: حقيقة واحدة في كل سطر، تبدأ بـ "-"
- Maximum 3 facts per conversation / 3 حقائق كحد أقصى لكل محادثة
- Use the SAME LANGUAGE as the user's message / استخدم نفس لغة رسالة المستخدم

Conversation:
User (${userName}): ${userMessage}
Bot: ${botResponse}

Facts to remember (or "None" if nothing important) / حقائق للتذكر (أو "لا شيء" إذا لم يكن هناك شيء مهم):`;

            // Use AI to extract facts
            const response = await aiService.generateResponse(extractionPrompt, {
                userName: 'System',
                userId: 'system',
                skipMemory: true, // Don't retrieve memories for extraction
                maxTokens: 150 // Keep it short
            });

            // Parse the response
            const facts = this._parseFacts(response, userName);

            // Update cooldown
            this.lastExtraction.set(userId, Date.now());

            return facts;
        } catch (error) {
            logger.error('[Memory Extractor] Extraction failed:', error.message);
            return [];
        }
    }

    /**
     * Parse facts from AI response
     */
    _parseFacts(response, userName) {
        if (!response || response.toLowerCase().includes('none') || response.includes('لا شيء')) {
            return [];
        }

        const lines = response.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('-') || line.match(/^\d+\./));

        const facts = [];
        for (const line of lines) {
            // Remove bullet points or numbers
            let fact = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();

            // Skip if too short or too long
            if (fact.length < 10 || fact.length > 150) continue;

            // Skip if it's just a greeting or question (English or Arabic)
            if (fact.match(/^(hi|hello|hey|thanks|thank you|ok|okay|مرحبا|أهلا|شكرا|حسنا)/i)) continue;

            facts.push(fact);
        }

        return facts.slice(0, 3); // Max 3 facts
    }

    /**
     * Save extracted facts to memory
     * @param {Array<string>} facts - Facts to save
     * @param {string} userId - Discord user ID
     * @param {string} userName - Discord username
     * @returns {Promise<number>} Number of facts saved
     */
    async saveFacts(facts, userId, userName) {
        if (!facts || !facts.length) return 0;

        let saved = 0;
        for (const fact of facts) {
            try {
                // Check if similar fact already exists
                const existing = await aiMemory.searchMemories(fact, {
                    limit: 1,
                    threshold: 0.85 // High threshold to avoid duplicates
                });

                if (existing.length > 0 && existing[0].similarity > 0.85) {
                    logger.info(`[Memory Extractor] Skipping duplicate fact: ${fact}`);
                    continue;
                }

                // Save the fact
                await aiMemory.addMemory(fact, {
                    createdBy: userId,
                    key: `auto:${userName}` // Tag as auto-learned
                });

                saved++;
                logger.info(`[Memory Extractor] Auto-saved: ${fact}`);
            } catch (error) {
                logger.error(`[Memory Extractor] Failed to save fact: ${error.message}`);
            }
        }

        return saved;
    }

    /**
     * Process a conversation and auto-save facts
     * @param {string} userMessage - User's message
     * @param {string} botResponse - Bot's response
     * @param {string} userId - Discord user ID
     * @param {string} userName - Discord username
     */
    async processConversation(userMessage, botResponse, userId, userName) {
        if (!this.enabled) return;

        try {
            const facts = await this.extractFacts(userMessage, botResponse, userId, userName);

            if (facts.length > 0) {
                const saved = await this.saveFacts(facts, userId, userName);
                if (saved > 0) {
                    logger.info(`[Memory Extractor] Auto-learned ${saved} fact(s) from ${userName}`);
                }
            }
        } catch (error) {
            logger.error('[Memory Extractor] Process failed:', error.message);
        }
    }
}

// Export singleton instance
module.exports = new MemoryExtractor();
