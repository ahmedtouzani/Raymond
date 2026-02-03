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
        this.maxOutputTokens = Number(process.env.AI_MAX_OUTPUT_TOKENS || 400); // Limit output length
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

    async _getMemories(prompt) {
        if (!this.memoryEnabled) return [];

        if (!aiMemory) {
            aiMemory = require('../database/aiMemory');
        }

        const now = Date.now();
        const isFresh = this.memoriesCache.fetchedAt && (now - this.memoriesCache.fetchedAt) < this.memoryCacheTtlMs;
        const query = String(prompt || '').trim();

        const minQueryChars = Number.isFinite(this.memoryMinQueryChars) ? Math.max(0, this.memoryMinQueryChars) : 12;
        const minWordChars = Number.isFinite(this.memoryMinWordChars) ? Math.max(1, this.memoryMinWordChars) : 3;
        const longEnough = query.length >= minQueryChars;
        const hasWord = query.split(/\s+/).some(w => w.length >= minWordChars);
        if (!longEnough || !hasWord) {
            this.memoriesCache = { fetchedAt: now, query, items: [] };
            return [];
        }

        if (isFresh && this.memoriesCache.query === query && Array.isArray(this.memoriesCache.items)) {
            return this.memoriesCache.items;
        }

        const topK = Number.isFinite(this.memoryTopK) ? Math.max(0, Math.min(20, this.memoryTopK)) : 5;
        if (topK <= 0) {
            this.memoriesCache = { fetchedAt: now, query, items: [] };
            return [];
        }

        try {
            const rows = await aiMemory.searchMemories(query, { limit: topK });
            this.memoriesCache = { fetchedAt: now, query, items: rows };
            return rows;
        } catch {
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

    async _requestCompletion(prompt, selectedModel, extraSystemContext = null) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        // Truncate input prompt to avoid massive token usage (save ~ tokens)
        const cleanPrompt = String(prompt || '').slice(0, 1200);

        try {
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
                    messages: [
                        {
                            role: 'system',
                            content: 'You are Raymond Reddington, a charming, intelligent, and dangerous criminal mastermind from "The Blacklist". You are helpful but maintain your enigmatic, sophisticated, and storytelling persona. Keep responses concise for Discord.'
                        },
                        ...(extraSystemContext ? [{ role: 'system', content: extraSystemContext }] : []),
                        {
                            role: 'user',
                            content: cleanPrompt
                        }
                    ]
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

            const content = data?.choices?.[0]?.message?.content;
            if (!content) {
                const err = new Error('No response generated from AI.');
                err.retryable = true;
                throw err;
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
        const memories = await this._getMemories(prompt);
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
                const content = await this._requestCompletion(prompt, selectedModel, extraSystemContext);
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

        const summary = failures
            .map(f => `${f.model}${f.status ? ` (${f.status})` : ''}: ${f.message}`)
            .join(' | ');
        const err = new Error(`All OpenRouter models failed. Tried: ${candidates.join(', ')}. Errors: ${summary}`);
        console.error('[AI Service] Error generating response:', err);
        throw err;
    }
}

module.exports = new AIService();
