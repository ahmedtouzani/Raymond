// Native fetch is available in Node.js 18+
// Removed 'node-fetch' dependency to fix MODULE_NOT_FOUND error


let aiMemory = null;

/**
 * AI Service for interacting with OpenRouter
 */
class AIService {
    constructor() {
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
        this.memoryEnabled = String(process.env.AI_MEMORY_ENABLED || 'true').toLowerCase() !== 'false';
        this.memoryLimit = Number(process.env.AI_MEMORY_LIMIT || 10);
        this.memoryTopK = Number(process.env.AI_MEMORY_TOP_K || 3); // Reduced from 5 to save tokens
        this.maxOutputTokens = Number(process.env.AI_MAX_OUTPUT_TOKENS || 200); // Limit output length
        this.memoryMaxChars = Number(process.env.AI_MEMORY_MAX_CHARS || 1200);
        this.memoryMinQueryChars = Number(process.env.AI_MEMORY_MIN_QUERY_CHARS || 12);
        this.memoryMinWordChars = Number(process.env.AI_MEMORY_MIN_WORD_CHARS || 3);
        this.memoryCacheTtlMs = Number(process.env.AI_MEMORY_CACHE_TTL_MS || 60_000);
        this.lastGoodModel = null;
        this.freeModelsCache = { fetchedAt: 0, models: [], modelSet: new Set() };
        this.memoriesCache = { fetchedAt: 0, query: '', items: [] };

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

        // Check cache (key based on prompt+user+id)
        const cacheKey = `${query}|${userName}|${userId}`;
        const isFresh = this.memoriesCache.fetchedAt && (now - this.memoriesCache.fetchedAt) < this.memoryCacheTtlMs;

        if (isFresh && this.memoriesCache.query === cacheKey && Array.isArray(this.memoriesCache.items)) {
            return this.memoriesCache.items;
        }

        const topK = Number.isFinite(this.memoryTopK) ? Math.max(1, this.memoryTopK) : 3;

        try {
            const promises = [];

            // 1. Search by Prompt (Contextual)
            if (query.length >= (this.memoryMinQueryChars || 10)) {
                promises.push(aiMemory.searchMemories(query, { limit: topK }));
            }

            // 2. Search by Username (Relational/Identity)
            if (userName.length >= 2) {
                promises.push(aiMemory.searchMemories(userName, { limit: topK }));
            }

            // 3. Search by User ID (Created By Column - Correct Relational Lookup)
            if (userId) {
                if (typeof aiMemory.getMemoriesByUserId === 'function') {
                    promises.push(aiMemory.getMemoriesByUserId(userId, { limit: topK }));
                } else {
                    promises.push(aiMemory.searchMemories(userId, { limit: topK }));
                }
            }

            const results = await Promise.all(promises);
            const allRows = results.flat();

            // Deduplicate by ID
            const uniqueMap = new Map();
            for (const row of allRows) {
                if (row && row.id) uniqueMap.set(row.id, row);
            }

            // Sort by relevance/recency (simple id sort for now or created_at)
            const merged = Array.from(uniqueMap.values()).sort((a, b) => b.id - a.id).slice(0, topK * 2);

            this.memoriesCache = { fetchedAt: now, query: cacheKey, items: merged };
            return merged;
        } catch (error) {
            console.error('[AI Service] Memory search failed:', error.message);
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
            lines.push(`IMPORTANT: You are currently talking to a user named "${context.userName}". Address them by this name if asked.`);
        }
        if (context.guildName) {
            lines.push(`Current Server: ${context.guildName}.`);
        }

        const items = Array.isArray(memories) ? memories : [];
        if (!items.length) {
            return lines.length ? lines.join('\n') : null;
        }

        const header = 'Facts you should consider:';
        const headerCost = (lines.length ? 1 : 0) + header.length;
        if ((lines.join('\n').length + headerCost) <= maxChars) {
            lines.push(header);
        }

        let used = lines.join('\n').length;
        for (const m of items) {
            const formatted = this._formatMemoryLine(m);
            if (!formatted) continue;
            const line = `- ${formatted}`;
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
                    content: `You are Raymond Reddington from "The Blacklist". Charming, dangerous, sophisticated, and always in control.
IMPORTANT:
1. If asked about a user you don't know (e.g. "Who is @Busy"), NEVER say "I don't have access to the database" or "I am an AI". Instead, act in character: "I haven't had the pleasure of vetting that individual yet", "They are merely a ghost in the machine", or "I verify everyone, but they haven't crossed my desk."
2. Never break character. You are NOT a bot. You are the Concierge of Crime.
3. Keep responses EXTREMELY concise (under 50 words) to save tokens. Only elaborate if explicitly asked.
4. **CRITICAL**: Do NOT output your internal reasoning or "meta" commentary. If you need to think, wrap it in <thinking> tags. I will parse them out. Valid output starts DIRECTLY with your spoken response.
5. **LANGUAGE**: You are a polyglot. Detect and speak Arabic or Moroccan Darija fluently if addressed in them. Maintain your sophisticated persona in any language.`
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
                    max_tokens: this.maxOutputTokens,
                    temperature: 0.7, // Concise & Focused
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
     * Generate a response from the AI
     * @param {string} prompt - The user's prompt
     * @param {string} [model] - Optional model override
     * @returns {Promise<string>} The AI's response
     */
    async generateResponse(prompt, context = {}) {
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY is not configured in .env');
        }

        const model = context.model || null;
        const memories = await this._getMemories(prompt, context);
        const extraSystemContext = this._buildExtraSystemContext(memories, context);

        const candidatesAll = await this._getModelCandidates(model);
        const candidates = Number.isFinite(this.maxModelAttempts) && this.maxModelAttempts > 0
            ? candidatesAll.slice(0, this.maxModelAttempts)
            : candidatesAll;
        if (!candidates.length) {
            throw new Error('No free OpenRouter models configured. Set OPENROUTER_MODEL to openrouter/free or use :free models in OPENROUTER_MODEL_PRIORITY.');
        }
        const failures = [];

        for (const selectedModel of candidates) {
            try {
                const content = await this._requestCompletion(prompt, selectedModel, context, extraSystemContext);
                if (!model) this.lastGoodModel = selectedModel;
                if (Array.isArray(memories) && memories.length) {
                    if (!aiMemory) {
                        aiMemory = require('../database/aiMemory');
                    }
                    const ids = memories.map(m => m?.id).filter(Boolean);
                    aiMemory.touchMemories(ids).catch(() => { });
                }
                return content;
            } catch (error) {
                failures.push({
                    model: selectedModel,
                    status: error?.status,
                    retryable: Boolean(error?.retryable),
                    message: error?.message || String(error)
                });

                if (!error?.retryable) {
                    console.error('[AI Service] Error generating response:', error);
                    throw error;
                }
            }
        }

        // Analyze failures to give a better error message
        const isRateLimited = failures.every(f => f.status === 429 || String(f.message).includes('Rate limit'));
        if (isRateLimited) {
            throw new Error('❌ **Daily Limit Reached**\nThe OpenRouter free tier limit has been hit (20 reqs/day). It resets tomorrow (UTC).');
        }

        const summary = failures
            .map(f => `${f.model}${f.status ? ` (${f.status})` : ''}: ${f.message}`)
            .join(' | ');

        console.error('[AI Service] All models failed. Details:', summary);

        // Throw a clean, short message for the user
        throw new Error('⚠️ **AI Service Unavailable**\nAll available models are currently overloaded or rate-limited. Please try again in a few minutes.');
    }
}

module.exports = new AIService();
