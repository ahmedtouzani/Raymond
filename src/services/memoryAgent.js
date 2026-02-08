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
     * Process a single conversation for memory extraction
     * @private
     */
    async _processConversation({ userMessage, botResponse, guildId, userId, username }) {
        try {
            // Step 1: Fetch existing memories for context
            const existingMemories = await aiMemory.searchMemories(userMessage, {
                guildId, // Pass guildId for isolation
                createdBy: userId,
                limit: 10,
                similarityThreshold: 0.6
            });

            // Step 2: Call Gemini with function calling
            const tools = this._getMemoryTools();
            const response = await this._callGeminiWithTools({
                userMessage,
                botResponse,
                existingMemories,
                guildId,
                userId,
                username
            }, tools);

            // Step 3: Execute tool calls if present
            if (response.tool_calls && response.tool_calls.length > 0) {
                logger.info(`[Memory Agent] Executing ${response.tool_calls.length} tool call(s) for user ${username}`);

                for (const toolCall of response.tool_calls) {
                    await this._executeToolCall(toolCall, guildId, userId, username);
                }
            } else {
                logger.info(`[Memory Agent] Gemini decided no memory actions needed for: "${userMessage}"`);
            }
        } catch (error) {
            logger.error(`[Memory Agent] Error processing conversation:`, error.message);
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
     * Call Gemini API with function calling
     * @private
     */
    async _callGeminiWithTools(context, tools) {
        // Get next Gemini key with round-robin
        const key = this._getNextGeminiKey();
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'; // Free model with function calling

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [{
                                text: this._buildMemoryPrompt(context)
                            }]
                        }],
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

        return `You are Raymond's Memory Management Agent. Extract and manage facts about the USER.

**Conversation:**
User (${context.username}): ${context.userMessage}
Bot: ${context.botResponse}

**Existing Memories for this User:**
${existingMemoriesText}

**CRITICAL WORKFLOW - FOLLOW THESE STEPS:**

**STEP 1: Identify User Facts**
Extract ONLY facts from "${context.username}"'s message (NOT the bot's response):
- Personal info: name, age, location, occupation
- Preferences: likes, dislikes, favorites
- Facts: relationships, goals, habits, experiences

**STEP 2: Check for Conflicts**
Look at the Existing Memories above. Does the NEW fact contradict any EXISTING memory?

Example:
- Existing: "User's name is Mohamed" (ID: 65)
- New fact: User says "my name is ahmed"
- CONFLICT DETECTED! ✓

**STEP 3: Take Action**

IF there's a CONFLICT:
1. First call: fetch_and_verify(query="User's name", context="search for name memories")
2. Then call: update_memory(id=<old_memory_id>, content="User's name is Ahmed", reason="User corrected their name")

IF it's a NEW fact (no conflict):
1. Call: update_memory(content="...", reason="User stated...")

IF it's a correction WITHOUT prior memory:
1. Call: update_memory(content="...", reason="User stated...")

**EXAMPLE 1: Correction**
User says: "No my name is ahmed"
Existing: [ID: 65] "User's name is Mohamed"
→ Actions:
1. fetch_and_verify(query="User's name", context="name")
2. update_memory(id=65, content="User's name is Ahmed", reason="User corrected their name from Mohamed to Ahmed")

**EXAMPLE 2: New Info**
User says: "I love pizza"
Existing: No food preferences
→ Action:
1. update_memory(content="User loves pizza", reason="User stated food preference")

**DO NOT** save:
- Greetings, questions, or casual chat
- Bot responses
- Vague statements

**Available Tools:**
- fetch_and_verify(query, context) - SEARCH existing memories first
- update_memory(content, reason, id?) - CREATE (no id) or UPDATE (with id)
- prune_conflicts(ids, reason) - DELETE obsolete memories`;
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
     * Execute a tool call
     * @private
     */
    async _executeToolCall(toolCall, guildId, userId, username) {
        const { name, args } = toolCall;

        logger.info(`[Memory Agent] Executing tool: ${name} for user ${username}`);
        logger.debug(`[Memory Agent] Tool args:`, args);

        try {
            switch (name) {
                case 'fetch_and_verify':
                    // This is just for AI context, no action needed
                    logger.debug(`[Memory Agent] Fetch and verify: ${args.query}`);
                    break;

                case 'update_memory':
                    if (args.id && args.id > 0) {
                        // Update existing memory
                        logger.info(`[Memory Agent] Updating memory ${args.id}: ${args.content}`);
                        const updated = await aiMemory.updateMemory(args.id, args.content, { guildId });
                        if (updated) {
                            await this._logAudit(guildId, 'UPDATE_MEMORY', {
                                memoryId: args.id,
                                oldValue: '(hidden)',
                                newValue: args.content,
                                reason: args.reason,
                                userId
                            });
                        }
                    } else {
                        // Create new memory
                        logger.info(`[Memory Agent] Creating new memory: ${args.content} (Reason: ${args.reason})`);
                        const newMemory = await aiMemory.addMemory(args.content, {
                            guildId,
                            createdBy: userId,
                            key: `auto:${username}`
                        });

                        await this._logAudit(guildId, 'CREATE_MEMORY', {
                            memoryId: newMemory ? newMemory.id : 'unknown',
                            content: args.content,
                            reason: args.reason,
                            userId
                        });
                    }
                    break;

                case 'prune_conflicts':
                    if (args.ids && Array.isArray(args.ids) && args.ids.length > 0) {
                        logger.info(`[Memory Agent] Pruning ${args.ids.length} conflicting memories (Reason: ${args.reason})`);
                        const deletedCount = await aiMemory.deleteMemories(args.ids, { guildId });

                        await this._logAudit(guildId, 'PRUNE_MEMORIES', {
                            memoryIds: args.ids,
                            count: deletedCount,
                            reason: args.reason,
                            userId
                        });
                    }
                    break;

                default:
                    logger.warn(`[Memory Agent] Unknown tool: ${name}`);
            }
        } catch (error) {
            logger.error(`[Memory Agent] Tool execution failed for ${name}:`, error.message);
        }
    }

    /**
     * Log an action to the audit table
     * @private
     */
    async _logAudit(guildId, action, details) {
        try {
            await db.query(
                'INSERT INTO ai_agent_audit_log (agent_name, action, details, guild_id) VALUES ($1, $2, $3, $4)',
                ['MemoryAgent', action, details, guildId]
            );
        } catch (error) {
            logger.error('[Memory Agent] Failed to write audit log:', error.message);
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
