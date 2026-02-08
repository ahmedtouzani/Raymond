// Native fetch is available in Node.js 18+
// Removed 'node-fetch' dependency to fix MODULE_NOT_FOUND error

const personas = require('../config/personas');
const embeddings = require('./embeddings');
const logger = require('../utils/logger');

let aiMemory = null;

/**
 * AI Service for interacting with OpenRouter
 */
class AIService {
    constructor() {
        // ========================================
        // FLEXIBLE API POOLS (v4.0.0)
        // ========================================

        // Load Groq API keys dynamically (1-10 keys)
        this.groqKeys = [];
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`GROQ_API_KEY_${i}`];
            if (key && key.trim()) {
                this.groqKeys.push(key.trim());
            }
        }

        // Load Gemini API keys dynamically (2-5 keys)
        this.geminiKeys = [];
        for (let i = 1; i <= 5; i++) {
            const key = process.env[`GEMINI_API_KEY_${i}`];
            if (key && key.trim()) {
                this.geminiKeys.push(key.trim());
            }
        }

        // Validate minimum requirements
        if (this.groqKeys.length < 1) {
            throw new Error('[AI Service] At least 1 Groq API key required (GROQ_API_KEY_1)');
        }
        if (this.geminiKeys.length < 2) {
            throw new Error('[AI Service] At least 2 Gemini API keys required (GEMINI_API_KEY_1, GEMINI_API_KEY_2)');
        }

        // API pool state
        this.currentGroqIndex = 0;
        this.currentGeminiIndex = 0;
        this.failedKeys = new Map(); // key -> failedUntil timestamp
        this.keyUsageStats = new Map(); // key -> usage count

        logger.info(`[AI Service] Loaded ${this.groqKeys.length} Groq keys, ${this.geminiKeys.length} Gemini keys`);

        // ========================================
        // LEGACY OPENROUTER SUPPORT (Fallback)
        // ========================================
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.defaultModel = process.env.OPENROUTER_MODEL || 'openrouter/free';
        this.timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 10_000);
        this.freeOnly = true;
        this.discoverFreeModels = String(process.env.OPENROUTER_DISCOVER_FREE_MODELS || 'true').toLowerCase() !== 'false';
        this.modelsCacheTtlMs = Number(process.env.OPENROUTER_MODELS_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
        this.modelsFetchTimeoutMs = Number(process.env.OPENROUTER_MODELS_FETCH_TIMEOUT_MS || 8_000);
        this.maxModelAttempts = Number(process.env.OPENROUTER_MAX_MODEL_ATTEMPTS || 8);
        this.siteUrl = process.env.SITE_URL || 'https://github.com/ahmedtouzani/Raymond';
        this.siteName = process.env.SITE_NAME || 'Raymond Bot';
        this.creatorName = (process.env.BOT_CREATOR_NAME || '').trim();
        this.creatorId = (process.env.OWNER_ID || '').trim();

        // ========================================
        // MEMORY CONFIGURATION
        // ========================================
        this.memoryEnabled = String(process.env.AI_MEMORY_ENABLED || 'true').toLowerCase() !== 'false';
        this.memoryLimit = Number(process.env.AI_MEMORY_LIMIT || 10);
        this.memoryTopK = Number(process.env.AI_MEMORY_TOP_K || 3);
        this.maxOutputTokens = Number(process.env.AI_MAX_OUTPUT_TOKENS || 200);
        this.memoryMaxChars = Number(process.env.AI_MEMORY_MAX_CHARS || 1200);
        this.memoryMinQueryChars = Number(process.env.AI_MEMORY_MIN_QUERY_CHARS || 12);
        this.memoryMinWordChars = Number(process.env.AI_MEMORY_MIN_WORD_CHARS || 3);
        this.memoryCacheTtlMs = Number(process.env.AI_MEMORY_CACHE_TTL_MS || 60_000);
        this.maxContextTokens = Number(process.env.AI_MAX_CONTEXT_TOKENS || 1000);
        this.similarityThreshold = Number(process.env.AI_MEMORY_SIMILARITY_THRESHOLD || 0.7);
        this.lastGoodModel = null;
        this.freeModelsCache = { fetchedAt: 0, models: [], modelSet: new Set() };
        this.memoriesCache = { fetchedAt: 0, query: '', items: [] };

        // ========================================
        // PERSONA CONFIGURATION
        // ========================================
        const personaName = (process.env.AI_PERSONA || 'raymond').trim().toLowerCase();
        this.persona = personas[personaName] || personas.raymond;

        const envPriority = (process.env.OPENROUTER_MODEL_PRIORITY || '').trim();
        this.modelPriority = envPriority
            ? envPriority.split(',').map(s => s.trim()).filter(Boolean)
            : [
                'google/gemma-2-9b-it:free',
                'meta-llama/llama-3.1-8b-instruct:free',
                'mistralai/mistral-7b-instruct:free',
                'openrouter/free'
            ];
    }

    // ========================================
    // API POOL MANAGEMENT (v4.0.0)
    // ========================================

    /**
     * Get next available Groq API key using round-robin
     * @returns {string} Groq API key
     */
    _getNextGroqKey() {
        const key = this.groqKeys[this.currentGroqIndex];
        this.currentGroqIndex = (this.currentGroqIndex + 1) % this.groqKeys.length;

        // Track usage
        this.keyUsageStats.set(key, (this.keyUsageStats.get(key) || 0) + 1);

        return key;
    }

    /**
     * Get next available Gemini API key using round-robin
     * @returns {string} Gemini API key
     */
    _getNextGeminiKey() {
        const key = this.geminiKeys[this.currentGeminiIndex];
        this.currentGeminiIndex = (this.currentGeminiIndex + 1) % this.geminiKeys.length;

        // Track usage
        this.keyUsageStats.set(key, (this.keyUsageStats.get(key) || 0) + 1);

        return key;
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
            logger.info(`[API Pool] Key recovered: ${key.substring(0, 10)}...`);
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
        logger.warn(`[API Pool] Key rate-limited: ${key.substring(0, 10)}... (cooldown: ${cooldownMs / 1000}s)`);
    }

    /**
     * Get API pool health statistics
     * @returns {object} Pool health metrics
     */
    getPoolHealth() {
        const groqAvailable = this.groqKeys.filter(k => this._isKeyAvailable(k)).length;
        const geminiAvailable = this.geminiKeys.filter(k => this._isKeyAvailable(k)).length;

        return {
            groq: {
                total: this.groqKeys.length,
                available: groqAvailable,
                failed: this.groqKeys.length - groqAvailable
            },
            gemini: {
                total: this.geminiKeys.length,
                available: geminiAvailable,
                failed: this.geminiKeys.length - geminiAvailable
            },
            usage: Object.fromEntries(
                Array.from(this.keyUsageStats.entries()).map(([key, count]) => [
                    key.substring(0, 15) + '...',
                    count
                ])
            )
        };
    }

    // ========================================
    // LEGACY METHODS (OpenRouter)
    // ========================================

    // ========================================
    // GROQ API INTEGRATION (v4.0.0)
    // ========================================

    /**
     * Strip XML-style tags (like <thinking>, <analysis>, etc.) from response
     * @param {string} text - AI response text
     * @returns {string} Cleaned text without XML tags
     * @private
     */
    _stripThinkingTags(text) {
        if (!text) return text;

        // Remove all XML-style tags and their content
        // Matches: <thinking>...</thinking>, <analysis>...</analysis>, etc.
        return text
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
            .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
            .replace(/<reflection>[\s\S]*?<\/reflection>/gi, '')
            .trim();
    }

    /**
     * Call Groq API with a specific key
     * @param {string} prompt - User prompt
     * @param {string} apiKey - Groq API key
     * @param {object} context - Request context
     * @returns {Promise<string>} AI response
     */
    async _callGroq(prompt, apiKey, context = {}) {
        const model = context.groqModel || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        const messages = this._buildMessages(prompt, context);

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: this.persona.temperature || 0.8,
                    max_tokens: this.maxOutputTokens || 200,
                    top_p: 0.9
                }),
                signal: AbortSignal.timeout(this.timeoutMs)
            });

            // Check for rate limit
            if (response.status === 429) {
                const error = new Error('Rate limit exceeded');
                error.status = 429;
                throw error;
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Groq API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid Groq API response format');
            }

            const rawResponse = data.choices[0].message.content;
            return this._stripThinkingTags(rawResponse);
        } catch (error) {
            if (error.status === 429) {
                throw error; // Re-throw rate limit errors for failover
            }
            logger.error(`[Groq] API call failed: ${error.message}`);
            throw error;
        }
    }

    // ========================================
    // GEMINI API INTEGRATION (v4.0.0)
    // ========================================

    /**
     * Call Gemini API with a specific key
     * @param {string} prompt - User prompt
     * @param {string} apiKey - Gemini API key
     * @param {object} context - Request context
     * @returns {Promise<string>} AI response
     */
    async _callGemini(prompt, apiKey, context = {}) {
        const model = context.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const messages = this._buildMessages(prompt, context);

        try {
            // Convert messages to Gemini format
            const contents = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents,
                        generationConfig: {
                            temperature: this.persona.temperature || 0.8,
                            maxOutputTokens: this.maxOutputTokens || 200,
                            topP: 0.9
                        }
                    }),
                    signal: AbortSignal.timeout(this.timeoutMs)
                }
            );

            // Check for rate limit
            if (response.status === 429) {
                const error = new Error('Rate limit exceeded');
                error.status = 429;
                throw error;
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Gemini API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();

            if (!data.candidates || data.candidates.length === 0) {
                throw new Error('No candidates in Gemini response');
            }

            const rawText = data.candidates[0].content.parts[0].text;
            return this._stripThinkingTags(rawText);
        } catch (error) {
            if (error.status === 429) {
                throw error; // Re-throw rate limit errors for failover
            }
            logger.error(`[Gemini] API call failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build messages array for API calls
     * @param {string} prompt - User prompt
     * @param {object} context - Request context
     * @returns {Array} Messages array
     */
    _buildMessages(prompt, context = {}) {
        const messages = [];

        // Add system prompt
        if (this.persona.systemPrompt) {
            messages.push({
                role: 'system',
                content: this.persona.systemPrompt
            });
        }

        // Add conversation history if provided
        if (context.conversationHistory && Array.isArray(context.conversationHistory)) {
            messages.push(...context.conversationHistory);
        }

        // Add memory context if provided
        if (context.memoryContext) {
            messages.push({
                role: 'system',
                content: `Relevant memories:\n${context.memoryContext}`
            });
        }

        // Add user prompt
        messages.push({
            role: 'user',
            content: prompt
        });

        return messages;
    }

    // ========================================
    // LEGACY OPENROUTER METHODS
    // ========================================

    _isFreeModel(model) {
        if (!model || typeof model !== 'string') return false;
        const m = model.trim();
        if (!m) return false;
        if (m === 'openrouter/free' || m.endsWith(':free')) return true;
        if (this.freeModelsCache?.modelSet instanceof Set && this.freeModelsCache.modelSet.has(m)) return true;
        return false;
    }

    _isZeroPrice(pricing) {
        if (!pricing || typeof pricing !== 'object') return false;
        const prompt = Number.parseFloat(String(pricing.prompt ?? 'NaN'));
        const completion = Number.parseFloat(String(pricing.completion ?? 'NaN'));
        return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
    }

    async _fetchModelsFromApi() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.modelsFetchTimeoutMs);

        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.siteUrl,
                    'X-Title': this.siteName,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            if (!response.ok) {
                const raw = await response.text().catch(() => '');
                throw new Error(`OpenRouter Models Error: ${response.status} - ${raw}`);
            }

            const data = await response.json();
            const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
            return list;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async _getDiscoveredFreeModels({ refresh = false } = {}) {
        if (!this.discoverFreeModels) return [];

        const now = Date.now();
        const isFresh = this.freeModelsCache.fetchedAt && (now - this.freeModelsCache.fetchedAt) < this.modelsCacheTtlMs;
        if (!refresh && isFresh && Array.isArray(this.freeModelsCache.models) && this.freeModelsCache.models.length) {
            return this.freeModelsCache.models;
        }

        try {
            const models = await this._fetchModelsFromApi();
            const freeIds = [];
            for (const m of models) {
                const id = typeof m?.id === 'string' ? m.id.trim() : '';
                if (!id) continue;
                if (this._isFreeModel(id) || this._isZeroPrice(m?.pricing)) {
                    freeIds.push(id);
                }
            }

            const deduped = this._dedupeModels(['openrouter/free', ...freeIds]);
            const filtered = deduped;
            this.freeModelsCache = { fetchedAt: now, models: filtered, modelSet: new Set(filtered) };
            return filtered;
        } catch (e) {
            return this.freeModelsCache.models || [];
        }
    }

    _isRetryableStatus(status) {
        // Retry on:
        // 404 (Model not found)
        // 408 (Timeout)
        // 429 (Rate Limit - try another provider)
        // 5xx (Server Error)
        // 401/402 (Unauthorized/Payment - likely a provider issue or paid model, try next)
        return status === 404 || status === 408 || status === 429 || status >= 500 || status === 401 || status === 402;
    }
    // ... (keeping existing code) ...


    _dedupeModels(models) {
        const seen = new Set();
        const out = [];
        for (const m of models) {
            if (!m || typeof m !== 'string') continue;
            const key = m.trim();
            if (!key) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(key);
        }
        return out;
    }

    async _getModelCandidates(modelOverride) {
        const candidates = [];

        if (modelOverride) candidates.push(modelOverride);
        if (!modelOverride && this.lastGoodModel) candidates.push(this.lastGoodModel);
        if (!modelOverride && this.defaultModel) candidates.push(this.defaultModel);
        candidates.push(...this.modelPriority);
        candidates.push(...await this._getDiscoveredFreeModels());

        const deduped = this._dedupeModels(candidates);
        const filtered = deduped.filter(m => this._isFreeModel(m));
        return filtered;
    }

    async listFreeModels(refresh = false) {
        return await this._getDiscoveredFreeModels({ refresh: Boolean(refresh) });
    }

    async _getMemories(prompt, context = {}) {
        if (!this.memoryEnabled) return [];

        if (!aiMemory) {
            aiMemory = require('../database/aiMemory');
        }

        const now = Date.now();
        const query = String(prompt || '').trim();
        const userName = String(context.userName || '').trim();
        const userId = String(context.userId || '').trim();
        const guildId = String(context.guildId || '').trim(); // Added for v4.0.0

        // Check cache (key based on prompt+user+id)
        const cacheKey = `${query}|${userName}|${userId}|${guildId}`;
        const isFresh = this.memoriesCache.fetchedAt && (now - this.memoriesCache.fetchedAt) < this.memoryCacheTtlMs;

        if (isFresh && this.memoriesCache.query === cacheKey && Array.isArray(this.memoriesCache.items)) {
            return this.memoriesCache.items;
        }

        const topK = Number.isFinite(this.memoryTopK) ? Math.max(1, this.memoryTopK) : 3;

        try {
            const results = [];

            // 1. Semantic Search by Prompt (if query is long enough)
            if (query.length >= (this.memoryMinQueryChars || 10)) {
                const semanticResults = await aiMemory.searchMemories(query, {
                    guildId, // Pass guildId for isolation
                    limit: topK,
                    threshold: this.similarityThreshold
                });
                results.push(...semanticResults);
            }

            // 2. Search by Username (if provided)
            if (userName.length >= 2 && results.length < topK) {
                const userResults = await aiMemory.searchMemories(userName, {
                    guildId, // Pass guildId for isolation
                    limit: topK - results.length,
                    threshold: this.similarityThreshold
                });
                results.push(...userResults);
            }

            // 3. Search by User ID (Created By Column)
            if (userId && results.length < topK) {
                const userIdResults = await aiMemory.getMemoriesByUserId(userId, {
                    limit: topK - results.length
                });
                results.push(...userIdResults);
            }

            // Deduplicate by ID
            const uniqueMap = new Map();
            for (const row of results) {
                if (row && row.id) uniqueMap.set(row.id, row);
            }

            // Sort by similarity score (if available) then by recency
            const merged = Array.from(uniqueMap.values())
                .sort((a, b) => {
                    // Primary sort: similarity score (descending)
                    const simA = a.similarity || 0;
                    const simB = b.similarity || 0;
                    if (simA !== simB) return simB - simA;

                    // Secondary sort: recency (newer first)
                    return b.id - a.id;
                })
                .slice(0, topK * 2);

            this.memoriesCache = { fetchedAt: now, query: cacheKey, items: merged };
            return merged;
        } catch (error) {
            logger.error('[AI Service] Memory search failed:', error.message);
            return [];
        }
    }

    _formatMemoryLine(m) {
        const key = String(m?.key ?? '').trim();
        const value = String(m?.value ?? '').trim();
        if (!value) return null;
        if (key) return `${key}: ${value}`;
        return value;
    }

    _buildExtraSystemContext(memories, context = {}) {
        const maxChars = Number.isFinite(this.memoryMaxChars) ? Math.max(200, this.memoryMaxChars) : 1200;
        const lines = [];

        if (this.creatorName || this.creatorId) {
            const who = this.creatorName || `User ID ${this.creatorId}`;
            const line = `You were created by ${who}.`;
            if (line.length <= maxChars) lines.push(line);
        }

        if (context.userName) {
            // Check if current user is the owner
            const ownerId = String(process.env.OWNER_ID || '').trim();
            const isOwner = ownerId && context.userId && context.userId === ownerId;

            if (isOwner) {
                lines.push(`CRITICAL: You are currently talking to ${context.userName}, who is YOUR OWNER (the person who created you). This is the most important person. When they ask "who am I?" or similar, acknowledge they are your owner/creator.`);
            } else {
                lines.push(`You are currently talking to a user named "${context.userName}".`);
            }
        }
        if (context.guildName) {
            lines.push(`Current Server: ${context.guildName}.`);
        }

        // Add mentioned users context
        if (context.mentionedUsers && Array.isArray(context.mentionedUsers) && context.mentionedUsers.length > 0) {
            lines.push('Users mentioned in this conversation:');
            for (const user of context.mentionedUsers) {
                lines.push(`- ${user.displayName} (@${user.username}, ID: ${user.id})`);
                if (user.roles && user.roles.length > 0) {
                    lines.push(`  Roles: ${user.roles.join(', ')}`);
                }
                if (user.joinedAt) {
                    const joinDate = new Date(user.joinedAt).toLocaleDateString();
                    lines.push(`  Joined: ${joinDate}`);
                }
            }
        }

        const items = Array.isArray(memories) ? memories : [];
        if (!items.length) {
            return lines.length ? lines.join('\n') : null;
        }

        const header = '**IMPORTANT - What you KNOW about this user:**';
        const headerCost = (lines.length ? 1 : 0) + header.length;
        if ((lines.join('\n').length + headerCost) <= maxChars) {
            lines.push(header);
            lines.push('USE these facts in your responses. If asked about something listed here, answer confidently based on these facts:');
        }

        let used = lines.join('\n').length;
        for (const m of items) {
            const formatted = this._formatMemoryLine(m);
            if (!formatted) continue;

            // Add similarity score if available
            const score = m.similarity ? ` (${(m.similarity * 100).toFixed(0)}% match)` : '';
            const line = `- ${formatted}${score}`;
            const extra = (used ? 1 : 0) + line.length;
            if (used + extra > maxChars) break;
            lines.push(line);
            used += extra;
        }

        return lines.length ? lines.join('\n') : null;
    }

    async _requestCompletion(prompt, selectedModel, context = {}, extraSystemContext = null) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        // Truncate input prompt to avoid massive token usage (save ~ tokens)
        const cleanPrompt = String(prompt || '').slice(0, 1200);

        try {
            const messages = [
                {
                    role: 'system',
                    content: this.persona.systemPrompt
                },
                ...(extraSystemContext ? [{ role: 'system', content: extraSystemContext }] : [])
            ];

            // Add conversation history if available
            if (Array.isArray(context.history)) {
                // Ensure history items have valid role/content
                const cleanHistory = context.history.map(msg => ({
                    role: msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
                    content: String(msg.content || '').slice(0, 500) // Truncate old messages to save tokens
                }));
                messages.push(...cleanHistory);
            }

            // check if last message in history is identical to current prompt to avoid duplication?
            // Actually, messageCreate usually excludes the current prompt from history or handles it?
            // checking messageCreate.js: it fetches "before: message.id", so the current prompt is NOT in history. Good.

            messages.push({
                role: 'user',
                content: cleanPrompt
            });

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.siteUrl,
                    'X-Title': this.siteName,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    max_tokens: this.persona.maxTokens || this.maxOutputTokens,
                    temperature: this.persona.temperature || 0.7,
                    messages: messages
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const status = response.status;
                const raw = await response.text().catch(() => '');
                let parsed = null;
                try {
                    parsed = raw ? JSON.parse(raw) : null;
                } catch {
                    parsed = null;
                }

                const details = parsed ? JSON.stringify(parsed) : raw;
                const err = new Error(`OpenRouter API Error: ${status} - ${details}`);
                err.status = status;
                err.retryable = this._isRetryableStatus(status);
                throw err;
            }

            const data = await response.json();

            let content = data?.choices?.[0]?.message?.content;
            if (!content) {
                const err = new Error('No response generated from AI.');
                err.retryable = true;
                throw err;
            }

            // Strip <thinking> tags if present
            content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
            // Fallback: Strip "Alright, the user..." type preambles if common (simple heuristic)
            if (content.startsWith("Alright,") && content.includes('"')) {
                const match = content.match(/"([^"]+)"/);
                if (match) content = match[1];
            }

            return content;
        } catch (error) {
            if (error && error.name === 'AbortError') {
                const err = new Error(`OpenRouter API Error: timeout after ${this.timeoutMs}ms`);
                err.retryable = true;
                throw err;
            }

            if (error && typeof error.retryable === 'boolean') {
                throw error;
            }

            const err = error instanceof Error ? error : new Error(String(error));
            err.retryable = true;
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Generate AI response using Groq pool with Gemini failover
     * @param {string} prompt - User's message
     * @param {object} context - Additional context (memories, conversation history, etc.)
     * @returns {Promise<string>} The AI's response
     */
    async generateResponse(prompt, context = {}) {
        // ========================================
        // MEMORY RETRIEVAL
        // ========================================
        const skipMemory = context.skipMemory || false;
        const memories = skipMemory ? [] : await this._getMemories(prompt, context);

        // Build memory context for messages
        if (memories && memories.length > 0) {
            const memoryText = memories.map(m => `- ${m.value}`).join('\n');
            context.memoryContext = memoryText;
        }

        // ========================================
        // GROQ POOL (Primary)
        // ========================================
        logger.info(`[AI Service] Trying Groq pool (${this.groqKeys.length} keys available)`);

        for (let attempt = 0; attempt < this.groqKeys.length; attempt++) {
            const key = this._getNextGroqKey();

            if (!this._isKeyAvailable(key)) {
                logger.debug(`[Groq] Key ${key.substring(0, 10)}... is rate-limited, skipping`);
                continue;
            }

            try {
                logger.debug(`[Groq] Attempting with key ${key.substring(0, 10)}... (attempt ${attempt + 1}/${this.groqKeys.length})`);
                const response = await this._callGroq(prompt, key, context);

                // Touch memories to update last_accessed_at
                if (memories && memories.length > 0) {
                    if (!aiMemory) {
                        aiMemory = require('../database/aiMemory');
                    }
                    const ids = memories.map(m => m?.id).filter(Boolean);
                    aiMemory.touchMemories(ids).catch(() => { });
                }

                logger.info(`[Groq] Success with key ${key.substring(0, 10)}...`);
                return response;
            } catch (error) {
                if (error.status === 429) {
                    this._markKeyFailed(key, 300000); // 5 min cooldown
                    logger.warn(`[Groq] Rate limit hit on key ${key.substring(0, 10)}..., trying next key`);
                    continue;
                } else {
                    logger.error(`[Groq] Error with key ${key.substring(0, 10)}...: ${error.message}`);
                    // For non-rate-limit errors, try next key
                    continue;
                }
            }
        }

        // ========================================
        // GEMINI POOL (Failover)
        // ========================================
        logger.warn(`[AI Service] Groq pool exhausted, failing over to Gemini pool (${this.geminiKeys.length} keys available)`);

        for (let attempt = 0; attempt < this.geminiKeys.length; attempt++) {
            const key = this._getNextGeminiKey();

            if (!this._isKeyAvailable(key)) {
                logger.debug(`[Gemini] Key ${key.substring(0, 10)}... is rate-limited, skipping`);
                continue;
            }

            try {
                logger.debug(`[Gemini] Attempting with key ${key.substring(0, 10)}... (attempt ${attempt + 1}/${this.geminiKeys.length})`);
                const response = await this._callGemini(prompt, key, context);

                // Touch memories
                if (memories && memories.length > 0) {
                    if (!aiMemory) {
                        aiMemory = require('../database/aiMemory');
                    }
                    const ids = memories.map(m => m?.id).filter(Boolean);
                    aiMemory.touchMemories(ids).catch(() => { });
                }

                logger.info(`[Gemini] Success with key ${key.substring(0, 10)}...`);
                return response;
            } catch (error) {
                if (error.status === 429) {
                    this._markKeyFailed(key, 300000); // 5 min cooldown
                    logger.warn(`[Gemini] Rate limit hit on key ${key.substring(0, 10)}..., trying next key`);
                    continue;
                } else {
                    logger.error(`[Gemini] Error with key ${key.substring(0, 10)}...: ${error.message}`);
                    continue;
                }
            }
        }

        // ========================================
        // ALL KEYS EXHAUSTED
        // ========================================
        const poolHealth = this.getPoolHealth();
        logger.error('[AI Service] All API keys exhausted', poolHealth);

        throw new Error(
            '⚠️ **AI Service Unavailable**\n' +
            `All API keys are currently rate-limited.\n` +
            `Groq: ${poolHealth.groq.failed}/${poolHealth.groq.total} failed\n` +
            `Gemini: ${poolHealth.gemini.failed}/${poolHealth.gemini.total} failed\n` +
            `Please try again in a few minutes.`
        );
    }
}

module.exports = new AIService();
