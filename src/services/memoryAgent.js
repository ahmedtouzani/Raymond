const logger = require('../utils/logger');
const aiMemory = require('../database/aiMemory');
const db = require('../services/database');

/**
 * Gemini Memory Agent (v4.0.0)
 * Autonomous background service for intelligent memory management
 * Uses Gemini 2.0 Flash with function calling to manage memories
 */
class MemoryAgent {
    constructor() {
        // Load Gemini API keys for memory agent
        this.geminiKeys = [];
        for (let i = 1; i <= 5; i++) {
            const key = process.env[`GEMINI_API_KEY_${i}`];
            if (key && key.trim()) {
                this.geminiKeys.push(key.trim());
            }
        }

        // Validate minimum requirements
        if (this.geminiKeys.length < 2) {
            logger.warn('[Memory Agent] Less than 2 Gemini keys found. Agent will not start.');
            this.enabled = false;
            return;
        }

        this.enabled = String(process.env.MEMORY_AGENT_ENABLED || 'true').toLowerCase() === 'true';
        this.currentGeminiIndex = 0;
        this.conversationQueue = [];
        this.batchInterval = Number(process.env.MEMORY_AGENT_BATCH_INTERVAL_MS || 300000); // 5 minutes
        this.messageThreshold = Number(process.env.MEMORY_AGENT_MESSAGE_THRESHOLD || 20);
        this.maxBatchSize = Number(process.env.MEMORY_AGENT_MAX_BATCH_SIZE || 50);
        this.isProcessing = false;
        this.failedKeys = new Map();

        logger.info(`[Memory Agent] Initialized with ${this.geminiKeys.length} Gemini keys`);
        logger.info(`[Memory Agent] Batch interval: ${this.batchInterval / 1000}s, Message threshold: ${this.messageThreshold}`);

        // Start background processor if enabled
        if (this.enabled) {
            this._startBatchProcessor();
            logger.info('[Memory Agent] Background processor started');
        } else {
            logger.info('[Memory Agent] Disabled via MEMORY_AGENT_ENABLED');
        }
    }

    /**
     * Queue a conversation for memory processing (non-blocking)
     * @param {string} userMessage - User's message
     * @param {string} botResponse - Bot's response
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} username - Username
     */
    queueConversation(userMessage, botResponse, guildId, userId, username) {
        if (!this.enabled) return;

        this.conversationQueue.push({
            userMessage,
            botResponse,
            guildId,
            userId,
            username,
            timestamp: Date.now()
        });

        logger.debug(`[Memory Agent] Queued conversation (queue size: ${this.conversationQueue.length})`);

        // Trigger immediate processing if threshold reached
        if (this.conversationQueue.length >= this.messageThreshold) {
            logger.info(`[Memory Agent] Message threshold reached (${this.conversationQueue.length}), triggering batch processing`);
            this._processBatch().catch(err => logger.error('[Memory Agent] Batch processing error:', err));
        }
    }

    /**
     * Start the background batch processor
     * @private
     */
    _startBatchProcessor() {
        setInterval(() => {
            if (this.conversationQueue.length > 0 && !this.isProcessing) {
                logger.info(`[Memory Agent] Timer triggered, processing ${this.conversationQueue.length} queued conversations`);
                this._processBatch().catch(err => logger.error('[Memory Agent] Batch processing error:', err));
            }
        }, this.batchInterval);
    }

    /**
     * Process a batch of queued conversations
     * @private
     */
    async _processBatch() {
        if (this.isProcessing) {
            logger.debug('[Memory Agent] Already processing, skipping');
            return;
        }

        this.isProcessing = true;

        try {
            const batch = this.conversationQueue.splice(0, this.maxBatchSize);
            logger.info(`[Memory Agent] Processing batch of ${batch.length} conversations`);

            for (const conv of batch) {
                try {
                    await this._processConversation(conv);
                } catch (error) {
                    logger.error(`[Memory Agent] Failed to process conversation for user ${conv.userId}:`, error.message);
                }
            }

            logger.info(`[Memory Agent] Batch processing complete`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a single conversation with multi-turn reasoning (v4.0.0)
     * @private
     */
    async _processConversation({ userMessage, botResponse, guildId, userId, username }) {
        const MAX_ITERATIONS = 5; // Circuit breaker: prevent infinite loops
        const ITERATION_TIMEOUT_MS = 30000; // 30 seconds per iteration
        const MAX_TOTAL_TIME_MS = 120000; // 2 minutes total timeout

        const startTime = Date.now();
        const conversationHistory = []; // Track full conversation with Gemini

        try {
            // Step 1: Fetch existing memories for context
            const existingMemories = await aiMemory.searchMemories(userMessage, {
                guildId,
                limit: 5,
                threshold: 0.6
            });

            // Step 2: Build tools definition
            const tools = this._getMemoryTools();

            // Multi-turn loop
            for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
                // Safety: Check total timeout
                const elapsed = Date.now() - startTime;
                if (elapsed > MAX_TOTAL_TIME_MS) {
                    logger.warn(`[Memory Agent] Total timeout (${elapsed}ms) reached after ${iteration - 1} iterations`);
                    break;
                }

                logger.info(`[Memory Agent] Turn ${iteration}/${MAX_ITERATIONS} for user ${username}`);

                // Build prompt for this iteration
                const isFirstTurn = iteration === 1;
                let prompt;

                if (isFirstTurn) {
                    // First turn: Send full context with existing memories
                    prompt = this._buildMemoryPrompt({
                        userMessage,
                        botResponse,
                        userId,
                        username,
                        guildId,
                        existingMemories
                    });
                } else {
                    // Subsequent turns: Ask Gemini to process tool results
                    prompt = "Based on the tool results above, decide what action to take next. If the task is complete, respond with text only (no tool calls).";
                }

                // Add current turn to conversation history
                conversationHistory.push({
                    role: 'user',
                    parts: [{ text: prompt }]
                });

                try {
                    // Call Gemini with timeout for this iteration
                    const iterationStartTime = Date.now();
                    const response = await Promise.race([
                        this._callGeminiWithTools({ conversationHistory }, tools),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Iteration timeout')), ITERATION_TIMEOUT_MS)
                        )
                    ]);

                    const iterationTime = Date.now() - iterationStartTime;
                    logger.info(`[Memory Agent] Turn ${iteration} completed in ${iterationTime}ms`);

                    // Build model response
                    const modelResponse = {
                        role: 'model',
                        parts: []
                    };

                    // Check if Gemini made tool calls
                    if (response.tool_calls && response.tool_calls.length > 0) {
                        logger.info(`[Memory Agent] Turn ${iteration}: ${response.tool_calls.length} tool call(s)`);

                        // Execute each tool and collect results
                        const toolResults = [];

                        for (const toolCall of response.tool_calls) {
                            const result = await this._executeToolCall(toolCall, guildId, userId, username);
                            toolResults.push({
                                tool: toolCall.name,
                                result
                            });
                        }

                        // Add tool calls to model response (for history)
                        if (response.text) {
                            modelResponse.parts.push({ text: response.text });
                        }

                        conversationHistory.push(modelResponse);

                        // Add tool results back to conversation for next iteration
                        const resultsText = toolResults.map(tr =>
                            `Tool: ${tr.tool}\nResult: ${JSON.stringify(tr.result, null, 2)}`
                        ).join('\n\n');

                        conversationHistory.push({
                            role: 'user',
                            parts: [{ text: `Tool execution results:\n\n${resultsText}` }]
                        });

                        // Continue to next iteration for Gemini to process results
                        continue;

                    } else {
                        // No more tool calls - Gemini is done
                        if (response.text) {
                            modelResponse.parts.push({ text: response.text });
                            logger.info(`[Memory Agent] Turn ${iteration}: ${response.text}`);
                        } else {
                            logger.info(`[Memory Agent] Turn ${iteration}: No tool calls, reasoning complete`);
                        }
                        conversationHistory.push(modelResponse);
                        break; // Exit loop - task complete
                    }

                } catch (iterationError) {
                    if (iterationError.message === 'Iteration timeout') {
                        logger.warn(`[Memory Agent] Turn ${iteration} timed out after ${ITERATION_TIMEOUT_MS}ms`);
                        break;
                    } else {
                        throw iterationError;
                    }
                }
            }

            // Check if we hit max iterations (circuit breaker activated)
            if (conversationHistory.filter(m => m.role === 'model').length >= MAX_ITERATIONS) {
                logger.warn(`[Memory Agent] Circuit breaker: Max iterations (${MAX_ITERATIONS}) reached`);
            }

            const totalTime = Date.now() - startTime;
            logger.info(`[Memory Agent] Multi-turn processing complete in ${totalTime}ms (${conversationHistory.length} messages)`);

        } catch (error) {
            logger.error(`[Memory Agent] Error in multi-turn processing:`, error.message);
            throw error;
        }
    }

    /**
     * Get memory management tools for Gemini function calling
     * @private
     */
    _getMemoryTools() {
        return [
            {
                name: 'fetch_and_verify',
                description: 'Search existing memories to verify if information already exists',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query to find related memories'
                        },
                        context: {
                            type: 'string',
                            description: 'New information to verify against existing memories'
                        }
                    },
                    required: ['query', 'context']
                }
            },
            {
                name: 'update_memory',
                description: 'Create a new memory or update an existing one',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Memory ID to update (null/0 to create new)',
                            nullable: true
                        },
                        content: {
                            type: 'string',
                            description: 'The memory content to save'
                        },
                        reason: {
                            type: 'string',
                            description: 'Why this memory is being created or updated'
                        }
                    },
                    required: ['content', 'reason']
                }
            },
            {
                name: 'prune_conflicts',
                description: 'Delete contradictory or outdated memories',
                parameters: {
                    type: 'object',
                    properties: {
                        ids: {
                            type: 'array',
                            items: { type: 'integer' },
                            description: 'Array of memory IDs to delete'
                        },
                        reason: {
                            type: 'string',
                            description: 'Why these memories are being removed'
                        }
                    },
                    required: ['ids', 'reason']
                }
            }
        ];
    }

    /**
     * Call Gemini API with function calling (v4.0.0 - supports multi-turn)
     * @private
     */
    async _callGeminiWithTools(context, tools) {
        // The instruction "Remove duplicate model declaration" is interpreted as not applicable here,
        // as 'model' is a local constant and not duplicated.
        const model = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
        const maxAttempts = this.geminiKeys.length;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Get next Gemini key with round-robin
            const key = this._getNextGeminiKey();

            if (!this._isKeyAvailable(key)) {
                logger.debug(`[Memory Agent] Key ${key.substring(0, 10)}... is rate-limited, skipping`);
                continue;
            }

            try {
                // Support both old (single-turn) and new (multi-turn) calling patterns
                const contents = context.conversationHistory || [{
                    role: 'user',
                    parts: [{
                        text: this._buildMemoryPrompt(context)
                    }]
                }];

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents,
                            tools: [{ function_declarations: tools }],
                            generationConfig: {
                                temperature: 0.5, // Higher for intelligent decision-making
                                maxOutputTokens: 500
                            }
                        }),
                        signal: AbortSignal.timeout(15000) // 15 second timeout
                    }
                );

                if (response.status === 429) {
                    this._markKeyFailed(key);
                    logger.warn(`[Memory Agent] Rate limit hit on key ${key.substring(0, 10)}..., trying next key`);
                    continue; // Try next key
                }

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    // Improve error parsing if it's JSON
                    let parsedError = errorText;
                    try {
                        const jsonError = JSON.parse(errorText);
                        parsedError = jsonError.error?.message || JSON.stringify(jsonError);
                    } catch (e) {
                        // Keep raw text if not JSON
                    }
                    throw new Error(`Gemini API error (${response.status}): ${parsedError}`);
                }

                const data = await response.json();
                return this._parseGeminiResponse(data);
            } catch (error) {
                // If we've tried all keys, re-throw the last error
                if (attempt === maxAttempts - 1) {
                    logger.error(`[Memory Agent] All Gemini keys exhausted or fatal error:`, error.message);
                    throw error;
                }

                // If it's a rate limit error that wasn't caught by status check (e.g. network error), try next
                if (error.message.includes('Rate limit') || error.status === 429) {
                    logger.warn(`[Memory Agent] Rate limit/Network error on key ${key.substring(0, 10)}..., trying next key`);
                    continue;
                }

                // For other errors, log and re-throw immediately (don't burn through keys on bad requests)
                logger.error(`[Memory Agent] Non-retriable error:`, error.message);
                throw error;
            }
        }

        throw new Error('All Gemini keys rate-limited or unavailable');
    }

    /**
     * Build the prompt for memory management
     * @private
     */
    _buildMemoryPrompt(context) {
        const existingMemoriesText = context.existingMemories && context.existingMemories.length > 0
            ? context.existingMemories.map(m => `- [ID: ${m.id}] ${m.value}`).join('\n')
            : 'No existing memories found.';

        return `You are Raymond's AUTONOMOUS Memory Curator Agent. You have database access to THINK and DECIDE what's important to remember.

**YOUR IDENTITY:**
- You are NOT a form-filler or template matcher
- You are an INTELLIGENT detective analyzing conversations
- Your job: THINK about what contextually matters
- You make STRATEGIC decisions about memory priority

**Conversation:**
User (${context.username}): ${context.userMessage}
Bot: ${context.botResponse}

**Existing Memories (may be incomplete - always verify):**
${existingMemoriesText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 **WHAT TO REMEMBER (Think Broadly!):**

✅ **IDENTITY & ROLES**
   - Names, nicknames, usernames
   - Roles: creator, owner, admin, developer, student, teacher, etc.
   - Self-descriptions: "I am X", "I work as Y"

✅ **RELATIONSHIPS (CRITICAL!)**
   - Romantic: "I love @user", "dating @user", "my boyfriend/girlfriend"
   - Family: "my mom/dad/brother/sister is X"
   - Friends: "my best friend is @user"
   - Professional: "my boss", "my colleague"
   - ANY @mention with emotional or relational context

✅ **PREFERENCES & PERSONALITY**
   - Likes/dislikes (food, music, activities, styles)
   - Hobbies, interests, passions
   - Habits, routines
   - Fears, phobias

✅ **EMOTIONAL & ASPIRATIONAL**
   - Goals, dreams, ambitions ("I want to be X")
   - Fears, worries, concerns
   - Current emotional state patterns
   - Motivations, values

✅ **PERSONAL FACTS**
   - Age, location, nationality
   - Job, profession, expertise
   - Skills, talents, abilities
   - Physical attributes (if mentioned)

✅ **HISTORICAL CONTEXT**
   - Events: "I did X yesterday"
   - Experiences: "I went to Y"
   - Things user told us before

❌ **IGNORE (Don't Remember):**
   - Greetings: "hello", "hi", "مرحبا", "salut"
   - Questions without information
   - Casual filler chat
   - Commands to the bot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 **MANDATORY SEARCH-FIRST PROTOCOL:**

**STEP 1: ALWAYS SEARCH FIRST**
Before creating/updating ANY memory, call:
→ fetch_and_verify(query="...", context="...")

**STEP 2: WAIT FOR RESULTS**
System returns search results in next turn.

**STEP 3: DECIDE ACTION**
- If ID found → update_memory(id=<found>, content="...", reason="...")
- If nothing found → update_memory(content="...", reason="...")
- If conflicts → prune_conflicts(ids=[...], reason="...") then update

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 **EXAMPLES (Learn the Pattern):**

**Example 1: Relationship (CRITICAL!)**
Turn 1:
User: "I love @Maria so much ❤️"
YOU: fetch_and_verify(query="User's romantic relationships or mentions of Maria", context="relationship detection")

Turn 2:
SYSTEM: {"count": 0, "results": []}
YOU: update_memory(content="User loves @Maria (romantic relationship)", reason="User expressed love for Maria with mention")

**Example 2: Role/Identity**
Turn 1:
User: "I created this bot" OR "أنا صاحب هذا البوت"
YOU: fetch_and_verify(query="User's role or ownership status", context="role detection")

Turn 2:
SYSTEM: {"count": 0, "results": []}
YOU: update_memory(content="User is the creator/owner of this bot", reason="User claimed ownership")

**Example 3: Family Information**
Turn 1:
User: "My mom is a doctor in Casablanca"
YOU: fetch_and_verify(query="User's family information", context="family facts")

Turn 2:
SYSTEM: {"count": 0, "results": []}
YOU: update_memory(content="User's mother is a doctor, works in Casablanca", reason="User shared family occupation and location")

**Example 4: Goals/Dreams**
Turn 1:
User: "I want to become a surgeon one day"
YOU: fetch_and_verify(query="User's goals or aspirations", context="career goals")

Turn 2:
SYSTEM: {"count": 0, "results": []}
YOU: update_memory(content="User dreams of becoming a surgeon", reason="User stated career aspiration")

**Example 5: Basic Fact (Classic)**
Turn 1:
User: "my name is Ahmed" OR "اسمي أحمد"
YOU: fetch_and_verify(query="User's name", context="name fact")

Turn 2:
SYSTEM: {"count": 0, "results": []}
YOU: update_memory(content="User's name is Ahmed", reason="User stated name")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 **MEMORY PRIORITY SYSTEM:**

**Priority 1 (MUST Remember):**
- Relationships (love, family, friends)
- Roles (creator, admin, owner)
- Identity (name, self-description)

**Priority 2 (Should Remember):**
- Emotional context (fears, dreams)
- Preferences (strong likes/dislikes)

**Priority 3 (Nice to Remember):**
- Basic facts (age, location)
- Historical events

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌍 **MULTILINGUAL HANDLING:**
- User can write in English, Arabic (MSA), Darija (Arabic/Latin)
- ALWAYS store memories in ENGLISH for consistency
- Search queries in English
- Examples: "أحب @ماريا" → store as "User loves @Maria"

🚨 **CRITICAL RULES:**
1. ALWAYS call fetch_and_verify FIRST (no exceptions!)
2. Extract facts from USER's message only (not bot's response)
3. Think BROADLY - relationships, roles, emotions, not just name/age
4. Store in ENGLISH for consistency
5. One memory per turn (focus on most important)
6. Use clear, concise language

**Available Tools:**
- fetch_and_verify(query, context) - REQUIRED FIRST STEP
- update_memory(content, reason, id?) - After search
- prune_conflicts(ids, reason) - Delete obsolete memories

NOW ANALYZE THE CONVERSATION AND DECIDE WHAT'S WORTH REMEMBERING.`;
    }

    /**
 * Parse Gemini response and extract tool calls
 * @private
 */
    _parseGeminiResponse(data) {
        const tool_calls = [];

        if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];

            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall) {
                        tool_calls.push({
                            name: part.functionCall.name,
                            args: part.functionCall.args || {}
                        });
                    }
                }
            }
        }

        return { tool_calls };
    }

    /**
     * Execute a tool call (v4.0.0 - returns structured results)
     * @private
     */
    async _executeToolCall(toolCall, guildId, userId, username) {
        const { name, args } = toolCall;

        logger.info(`[Memory Agent] Executing tool: ${name} for user ${username}`);

        try {
            switch (name) {
                case 'fetch_and_verify': {
                    const { query } = args;

                    const results = await aiMemory.searchMemories(query, {
                        guildId,
                        limit: 5,
                        threshold: 0.6
                    });

                    logger.info(`[Memory Agent] fetch_and_verify found ${results.length} memories for query "${query}"`);

                    return {
                        success: true,
                        count: results.length,
                        results: results.map(m => ({
                            id: m.id,
                            content: m.value,
                            created_at: m.created_at,
                            similarity: m.similarity ? `${(m.similarity * 100).toFixed(0)}%` : null
                        }))
                    };
                }

                case 'update_memory': {
                    const { id, content, reason } = args;

                    if (id && id > 0) {
                        // Update existing memory
                        const updated = await aiMemory.updateMemory(id, content, { guildId });

                        if (!updated) {
                            return {
                                success: false,
                                error: `Memory #${id} not found or does not belong to guild`
                            };
                        }

                        // Log to audit
                        await this._logAction('UPDATE_MEMORY', {
                            memoryId: id,
                            userId,
                            content,
                            reason
                        }, guildId, 'auto');

                        logger.info(`[Memory Agent] Updated memory #${id}: ${content} (Reason: ${reason})`);

                        return {
                            success: true,
                            action: 'updated',
                            memoryId: id,
                            content
                        };
                    } else {
                        // Create new memory
                        const created = await aiMemory.addMemory(content, {
                            createdBy: userId,
                            guildId
                        });

                        // Log to audit
                        await this._logAction('CREATE_MEMORY', {
                            memoryId: created.id,
                            userId,
                            content,
                            reason
                        }, guildId, 'auto');

                        logger.info(`[Memory Agent] Created new memory #${created.id}: ${content} (Reason: ${reason})`);

                        return {
                            success: true,
                            action: 'created',
                            memoryId: created.id,
                            content
                        };
                    }
                }

                case 'prune_conflicts': {
                    const { ids, reason } = args;

                    if (!Array.isArray(ids) || ids.length === 0) {
                        return {
                            success: false,
                            error: 'No IDs provided for pruning'
                        };
                    }

                    const deleted = await aiMemory.deleteMemories(ids, { guildId });

                    // Log to audit
                    await this._logAction('DELETE_MEMORIES', {
                        memoryIds: ids,
                        count: deleted,
                        reason
                    }, guildId, 'auto');

                    logger.info(`[Memory Agent] Deleted ${deleted} memories: [${ids.join(', ')}] (Reason: ${reason})`);

                    return {
                        success: true,
                        deleted,
                        ids
                    };
                }

                default:
                    logger.warn(`[Memory Agent] Unknown tool: ${name}`);
                    return {
                        success: false,
                        error: `Unknown tool: ${name}`
                    };
            }

        } catch (error) {
            logger.error(`[Memory Agent] Tool execution error (${name}):`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log an action to the audit table
     * @private
     */
    async _logAction(action, details, guildId, source = 'manual') {
        try {
            await db.query(
                'INSERT INTO ai_agent_audit_log (agent_name, action, details, guild_id) VALUES ($1, $2, $3, $4)',
                ['MemoryAgent', action, details, guildId]
            );
        } catch (error) {
            logger.error('[Memory Agent] Failed to log audit:', error.message);
        }
    }

    /**
     * Check if an API key is available (not rate-limited)
     * @param {string} key - API key to check
     * @returns {boolean} True if key is available
     */
    _isKeyAvailable(key) {
        const failedUntil = this.failedKeys.get(key);
        if (!failedUntil) return true;

        const now = Date.now();
        if (now > failedUntil) {
            this.failedKeys.delete(key); // Reset after cooldown
            logger.info(`[Memory Agent] Key recovered: ${key.substring(0, 10)}...`);
            return true;
        }

        return false;
    }

    /**
     * Mark an API key as failed (rate-limited)
     * @param {string} key - API key that failed
     * @param {number} cooldownMs - Cooldown duration in milliseconds (default: 5 minutes)
     */
    _markKeyFailed(key, cooldownMs = 300000) {
        const failedUntil = Date.now() + cooldownMs;
        this.failedKeys.set(key, failedUntil);
        logger.warn(`[Memory Agent] Key rate-limited: ${key.substring(0, 10)}... (cooldown: ${cooldownMs / 1000}s)`);
    }

    /**
     * Get next Gemini key using round-robin
     * @private
     */
    _getNextGeminiKey() {
        const key = this.geminiKeys[this.currentGeminiIndex];
        this.currentGeminiIndex = (this.currentGeminiIndex + 1) % this.geminiKeys.length;
        return key;
    }

    /**
     * Mark a key as failed (rate-limited)
     * @private
     */
    _markKeyFailed(key, cooldownMs = 300000) {
        const failedUntil = Date.now() + cooldownMs;
        this.failedKeys.set(key, failedUntil);
        logger.warn(`[Memory Agent] Key rate-limited: ${key.substring(0, 10)}... (cooldown: ${cooldownMs / 1000}s)`);
    }

    /**
     * Get agent statistics
     */
    getStats() {
        return {
            enabled: this.enabled,
            queueSize: this.conversationQueue.length,
            isProcessing: this.isProcessing,
            geminiKeys: this.geminiKeys.length,
            batchInterval: this.batchInterval,
            messageThreshold: this.messageThreshold
        };
    }
}

// Export singleton instance
module.exports = new MemoryAgent();
