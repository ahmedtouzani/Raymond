const db = require('../services/database');
const embeddings = require('../services/embeddings');
const logger = require('../utils/logger');

// Ensure table exists
(async () => {
  try {
    await db.query(`
            CREATE TABLE IF NOT EXISTS ai_memories (
                id SERIAL PRIMARY KEY,
                key TEXT,
                value TEXT NOT NULL,
                created_by TEXT,
                last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
  } catch (error) {
    console.error('Failed to init ai_memories table:', error);
  }
})();

/**
 * Check if pgvector extension is available
 * @returns {Promise<boolean>}
 */
async function isPgVectorAvailable() {
  try {
    const { rows } = await db.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
    );
    return rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if embedding columns exist
 * @returns {Promise<boolean>}
 */
async function hasEmbeddingColumns() {
  try {
    const { rows } = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'ai_memories'
         AND column_name IN ('embedding','embedding_model','embedding_updated_at')`
    );
    const cols = new Set(rows.map(r => r.column_name));
    return cols.has('embedding') && cols.has('embedding_model') && cols.has('embedding_updated_at');
  } catch (error) {
    return false;
  }
}

module.exports = {
  /**
   * Add a memory with automatic embedding generation
   * @param {string} value - Memory content
   * @param {object} options - Options
   * @param {string} options.createdBy - User ID who created the memory
   * @param {string} options.key - Optional key/category for the memory
   * @returns {Promise<object>} Created memory record
   */
  async addMemory(value, { createdBy, key } = {}) {
    const text = String(value || '').trim();
    if (!text) {
      throw new Error('Memory value cannot be empty');
    }

    // Check if embeddings are enabled and available
    const embeddingsEnabled = String(process.env.AI_EMBEDDINGS_ENABLED || 'false').toLowerCase() === 'true';
    const hasEmbeddings = embeddingsEnabled && await hasEmbeddingColumns();

    let embedding = null;
    let embeddingModel = null;

    if (hasEmbeddings) {
      try {
        // Generate embedding for the memory
        const keyText = key ? `${key}: ${text}` : text;
        const vec = await embeddings.embedText(keyText);

        if (vec && vec.length) {
          embedding = `[${vec.join(',')}]`;
          embeddingModel = embeddings.getEmbeddingModelId();
        }
      } catch (error) {
        logger.warn('Failed to generate embedding for memory:', error.message);
        // Continue without embedding - will fall back to keyword search
      }
    }

    // Insert with or without embedding
    if (hasEmbeddings && embedding) {
      const { rows } = await db.query(
        `INSERT INTO ai_memories (value, created_by, key, embedding, embedding_model, embedding_updated_at)
         VALUES ($1, $2, $3, $4::vector, $5, NOW())
         RETURNING *`,
        [text, createdBy, key, embedding, embeddingModel]
      );
      return rows[0];
    } else {
      const { rows } = await db.query(
        'INSERT INTO ai_memories (value, created_by, key) VALUES ($1, $2, $3) RETURNING *',
        [text, createdBy, key]
      );
      return rows[0];
    }
  },

  /**
   * List recent memories
   * @param {object} options - Options
   * @param {number} options.limit - Maximum number of memories to return
   * @returns {Promise<Array>} Array of memory records
   */
  async listMemories({ limit = 10 } = {}) {
    const { rows } = await db.query(
      'SELECT * FROM ai_memories ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  },

  /**
   * Search memories using hybrid approach (semantic + keyword fallback)
   * @param {string} query - Search query
   * @param {object} options - Options
   * @param {number} options.limit - Maximum number of results
   * @param {number} options.threshold - Similarity threshold (0-1, default: 0.7)
   * @returns {Promise<Array>} Array of matching memories with similarity scores
   */
  async searchMemories(query, { limit = 5, threshold = 0.7 } = {}) {
    const queryText = String(query || '').trim();
    if (!queryText) {
      return [];
    }

    const embeddingsEnabled = String(process.env.AI_EMBEDDINGS_ENABLED || 'false').toLowerCase() === 'true';
    const useHybrid = String(process.env.AI_MEMORY_RETRIEVAL || 'hybrid').toLowerCase() === 'hybrid';
    const hasEmbeddings = embeddingsEnabled && await hasEmbeddingColumns() && await isPgVectorAvailable();

    // Try semantic search first if available
    if (hasEmbeddings) {
      try {
        const vec = await embeddings.embedText(queryText);

        if (vec && vec.length) {
          const results = await this.searchMemoriesBySimilarity(vec, { limit, threshold });

          // If we got good results, return them
          if (results.length > 0) {
            return results;
          }

          // If no results and hybrid mode is disabled, return empty
          if (!useHybrid) {
            return [];
          }
        }
      } catch (error) {
        logger.warn('Semantic search failed, falling back to keyword search:', error.message);
      }
    }

    // Fallback to keyword search (ILIKE)
    const { rows } = await db.query(
      `SELECT *, NULL as similarity 
       FROM ai_memories 
       WHERE value ILIKE $1 OR key ILIKE $1
       ORDER BY updated_at DESC 
       LIMIT $2`,
      [`%${queryText}%`, limit]
    );

    return rows;
  },

  /**
   * Search memories by similarity using vector embeddings
   * @param {Array<number>} embedding - Query embedding vector
   * @param {object} options - Options
   * @param {number} options.limit - Maximum number of results
   * @param {number} options.threshold - Similarity threshold (0-1)
   * @returns {Promise<Array>} Array of matching memories with similarity scores
   */
  async searchMemoriesBySimilarity(embedding, { limit = 5, threshold = 0.7 } = {}) {
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      return [];
    }

    const hasEmbeddings = await hasEmbeddingColumns();
    const hasPgVector = await isPgVectorAvailable();

    if (!hasEmbeddings || !hasPgVector) {
      logger.warn('Semantic search requested but pgvector or embedding columns not available');
      return [];
    }

    const similarityThreshold = Number(process.env.AI_MEMORY_SIMILARITY_THRESHOLD || threshold);
    const embeddingLiteral = `[${embedding.join(',')}]`;

    try {
      const { rows } = await db.query(
        `SELECT *,
                1 - (embedding <=> $1::vector) as similarity
         FROM ai_memories
         WHERE embedding IS NOT NULL
           AND 1 - (embedding <=> $1::vector) >= $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [embeddingLiteral, similarityThreshold, limit]
      );

      return rows;
    } catch (error) {
      logger.error('Vector similarity search failed:', error.message);
      return [];
    }
  },

  /**
   * Get memories by user ID
   * @param {string} userId - Discord user ID
   * @param {object} options - Options
   * @param {number} options.limit - Maximum number of results
   * @returns {Promise<Array>} Array of memories created by the user
   */
  async getMemoriesByUserId(userId, { limit = 5 } = {}) {
    const { rows } = await db.query(
      'SELECT * FROM ai_memories WHERE created_by = $1 ORDER BY created_at DESC LIMIT $2',
      [String(userId), limit]
    );
    return rows;
  },

  /**
   * Delete a memory by ID
   * @param {number} id - Memory ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteMemory(id) {
    const { rowCount } = await db.query('DELETE FROM ai_memories WHERE id = $1', [id]);
    return rowCount > 0;
  },

  /**
   * Update last_used_at timestamp for memories
   * @param {Array<number>} ids - Array of memory IDs
   * @returns {Promise<void>}
   */
  async touchMemories(ids) {
    if (!ids || !ids.length) return;
    await db.query(
      'UPDATE ai_memories SET last_used_at = CURRENT_TIMESTAMP WHERE id = ANY($1)',
      [ids]
    );
  },

  /**
   * Backfill embeddings for existing memories
   * @param {object} options - Options
   * @param {number} options.batchSize - Number of memories to process at once
   * @param {function} options.onProgress - Progress callback
   * @returns {Promise<{processed: number, failed: number}>}
   */
  async backfillEmbeddings({ batchSize = 10, onProgress } = {}) {
    const hasEmbeddings = await hasEmbeddingColumns();

    if (!hasEmbeddings) {
      throw new Error('Embedding columns not available. Run migrations first.');
    }

    let processed = 0;
    let failed = 0;

    while (true) {
      const { rows } = await db.query(
        `SELECT id, key, value
         FROM ai_memories
         WHERE embedding IS NULL
         ORDER BY updated_at DESC
         LIMIT $1`,
        [batchSize]
      );

      if (!rows.length) break;

      for (const row of rows) {
        try {
          const text = row.key ? `${row.key}: ${row.value}` : row.value;
          const vec = await embeddings.embedText(text);

          if (vec && vec.length) {
            const embeddingLiteral = `[${vec.join(',')}]`;
            const model = embeddings.getEmbeddingModelId();

            await db.query(
              `UPDATE ai_memories
               SET embedding = $2::vector,
                   embedding_model = $3,
                   embedding_updated_at = NOW()
               WHERE id = $1`,
              [row.id, embeddingLiteral, model]
            );

            processed++;
          }
        } catch (error) {
          logger.error(`Failed to backfill embedding for memory ${row.id}:`, error.message);
          failed++;
        }

        if (onProgress) {
          onProgress({ processed, failed });
        }
      }
    }

    return { processed, failed };
  },
};
