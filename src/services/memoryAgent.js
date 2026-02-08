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
        // Get next Gemini key with round-robin
        const key = this._getNextGeminiKey();
        const model = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';

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
                            temperature: 0.3, // Lower for consistency
                            maxOutputTokens: 500
                        }
                    }),
                    signal: AbortSignal.timeout(15000) // 15 second timeout
                }
            );

            if (response.status === 429) {
                this._markKeyFailed(key);
                throw new Error('Rate limit exceeded');
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Gemini API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            return this._parseGeminiResponse(data);
        } catch (error) {
            logger.error(`[Memory Agent] Gemini API call failed:`, error.message);
            throw error;
        }
    }

    /**
     * Build the prompt for memory management
     * @private
     */
    _buildMemoryPrompt(context) {
        const existingMemoriesText = context.existingMemories && context.existingMemories.length > 0
            ? context.existingMemories.map(m => `- [ID: ${m.id}] ${m.value}`).join('\n')
            : 'No existing memories found.';

        return `You are Raymond's Memory Management Agent with STRICT search-first protocol.

**Conversation:**
User (${context.username}): ${context.userMessage}
Bot: ${context.botResponse}

**Existing Memories (may be incomplete - always verify):**
${existingMemoriesText}

**MANDATORY WORKFLOW - FOLLOW IN ORDER:**

🔍 **STEP 1: ALWAYS SEARCH FIRST (REQUIRED)**
Before creating OR updating ANY memory, you MUST call fetch_and_verify.

Examples of what to search for:
- User says "my name is Ahmed" OR "اسمي أحمد" → fetch_and_verify(query="User's name", context="name fact")
- User says "I'm 25 years old" OR "عمري 25 سنة" → fetch_and_verify(query="User's age", context="age fact")
- User says "I love pizza" OR "أحب البيتزا" → fetch_and_verify(query="User's food preferences", context="food likes")

🚫 **NEVER** skip this step, even if existing memories look empty!

⏸️ **STEP 2: WAIT FOR SEARCH RESULTS**
System will return what was found. This happens in the NEXT turn.

✅ **STEP 3: DECIDE BASED ON RESULTS**
After seeing search results:

- **If ID found** → update_memory(id=<found_id>, content="...", reason="...")
- **If nothing found** → update_memory(content="...", reason="...")
- **If multiple found** → prune_conflicts(ids=[...], reason="...") then update_memory(...)

🎯 **COMPLETE EXAMPLES:**

**Example 1: First mention of name (English)**
Turn 1:
User: "my name is Ahmed"
YOU: fetch_and_verify(query="User's name", context="searching for name")

Turn 2:
SYSTEM: {"success": true, "count": 0, "results": []}
YOU: update_memory(content="User's name is Ahmed", reason="User stated their name for first time")

**Example 2: First mention of name (Arabic)**
Turn 1:
User: "اسمي أحمد"
YOU: fetch_and_verify(query="User's name", context="searching for name")

Turn 2:
SYSTEM: {"success": true, "count": 0, "results": []}
YOU: update_memory(content="User's name is Ahmed", reason="User stated their name in Arabic")

**Example 3: Correcting name**
Turn 1:
User: "actually my name is Mohamed" OR "في الحقيقه اسمي محمد"
YOU: fetch_and_verify(query="User's name", context="name correction")

Turn 2:
SYSTEM: {"success": true, "count": 1, "results": [{"id": 83, "content": "User's name is Ahmed"}]}
YOU: update_memory(id=83, content="User's name is Mohamed", reason="User corrected name from Ahmed to Mohamed")

**Example 4: Adding location**
Turn 1:
User: "I live in Morocco" OR "أنا أعيش في المغرب"
YOU: fetch_and_verify(query="User's location", context="location fact")

Turn 2:
SYSTEM: {"success": true, "count": 0, "results": []}
YOU: update_memory(content="User lives in Morocco", reason="User stated location")

🚨 **CRITICAL RULES:**
1. **ALWAYS call fetch_and_verify FIRST** - No exceptions!
2. Extract facts ONLY from user's message (NOT bot's response)
3. **Handle BOTH English AND Arabic** - Store facts in English for consistency
4. Ignore greetings, questions, casual chat (both languages)
5. One fact at a time
6. Use clear, concise memory text in English

🌍 **BILINGUAL HANDLING:**
- User can write in English or Arabic
- ALWAYS store memories in ENGLISH for consistency
- Search queries should be in English
- Examples: "اسمي أحمد" → store as "User's name is Ahmed"

**Tools Available:**
- fetch_and_verify(query, context) - REQUIRED FIRST STEP
- update_memory(content, reason, id?) - Use after search
- prune_conflicts(ids, reason) - Delete obsolete memories`;
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
