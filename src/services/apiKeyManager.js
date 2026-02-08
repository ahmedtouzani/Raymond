const logger = require('../utils/logger');

/**
 * Centralized API Key Manager (v4.1.0)
 * Shared state management for both AIService and MemoryAgent
 * Prevents independent services from burning the same rate-limited keys
 */
class APIKeyManager {
    constructor() {
        // ========================================
        // GROQ API KEY POOL (1-10 keys)
        // ========================================
        this.groqKeys = [];
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`GROQ_API_KEY_${i}`];
            if (key && key.trim()) {
                this.groqKeys.push(key.trim());
            }
        }

        // ========================================
        // GEMINI API KEY POOL (2-10 keys)
        // ========================================
        this.geminiKeys = [];
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`GEMINI_API_KEY_${i}`];
            if (key && key.trim()) {
                this.geminiKeys.push(key.trim());
            }
        }

        // ========================================
        // SHARED STATE (CRITICAL!)
        // ========================================
        this.failedKeys = new Map(); // key -> failedUntil timestamp
        this.keyUsageStats = new Map(); // key -> usage count
        this.currentGroqIndex = 0;
        this.currentGeminiIndex = 0;

        // Validate minimum requirements
        if (this.groqKeys.length < 1) {
            logger.warn('[API Key Manager] No Groq API keys found (GROQ_API_KEY_1)');
        }
        if (this.geminiKeys.length < 2) {
            logger.warn('[API Key Manager] Less than 2 Gemini API keys found');
        }

        logger.info(`[API Key Manager] Initialized: ${this.groqKeys.length} Groq keys, ${this.geminiKeys.length} Gemini keys`);
    }

    // ========================================
    // KEY SELECTION (Round-Robin)
    // ========================================

    /**
     * Get next available Groq API key using round-robin
     * @returns {string|null} Groq API key or null if none available
     */
    getNextGroqKey() {
        if (this.groqKeys.length === 0) {
            logger.error('[API Key Manager] No Groq keys available');
            return null;
        }

        const key = this.groqKeys[this.currentGroqIndex];
        this.currentGroqIndex = (this.currentGroqIndex + 1) % this.groqKeys.length;

        // Track usage
        this.keyUsageStats.set(key, (this.keyUsageStats.get(key) || 0) + 1);

        return key;
    }

    /**
     * Get next available Gemini API key using round-robin
     * @returns {string|null} Gemini API key or null if none available
     */
    getNextGeminiKey() {
        if (this.geminiKeys.length === 0) {
            logger.error('[API Key Manager] No Gemini keys available');
            return null;
        }

        const key = this.geminiKeys[this.currentGeminiIndex];
        this.currentGeminiIndex = (this.currentGeminiIndex + 1) % this.geminiKeys.length;

        // Track usage
        this.keyUsageStats.set(key, (this.keyUsageStats.get(key) || 0) + 1);

        return key;
    }

    // ========================================
    // KEY AVAILABILITY & FAILURE MANAGEMENT
    // ========================================

    /**
     * Check if an API key is available (not rate-limited)
     * @param {string} key - API key to check
     * @returns {boolean} True if key is available
     */
    isKeyAvailable(key) {
        const failedUntil = this.failedKeys.get(key);
        if (!failedUntil) return true;

        const now = Date.now();
        if (now > failedUntil) {
            this.failedKeys.delete(key); // Reset after cooldown
            logger.info(`[API Key Manager] Key recovered: ${key.substring(0, 10)}...`);
            return true;
        }

        return false;
    }

    /**
     * Mark an API key as failed (rate-limited)
     * @param {string} key - API key that failed
     * @param {number} cooldownMs - Cooldown duration in milliseconds (default: 5 minutes)
     */
    markKeyFailed(key, cooldownMs = 300000) {
        const failedUntil = Date.now() + cooldownMs;
        this.failedKeys.set(key, failedUntil);
        logger.warn(`[API Key Manager] Key rate-limited: ${key.substring(0, 10)}... (cooldown: ${cooldownMs / 1000}s)`);
    }

    // ========================================
    // HEALTH MONITORING
    // ========================================

    /**
     * Get API pool health statistics
     * @returns {object} Pool health metrics
     */
    getPoolHealth() {
        const groqAvailable = this.groqKeys.filter(k => this.isKeyAvailable(k)).length;
        const geminiAvailable = this.geminiKeys.filter(k => this.isKeyAvailable(k)).length;

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
}

// Export singleton instance
module.exports = new APIKeyManager();
