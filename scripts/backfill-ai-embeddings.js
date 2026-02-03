require('dotenv').config();

const db = require('../src/services/database');
const embeddings = require('../src/services/embeddings');

function getBatchSize() {
  const n = Number(process.env.AI_EMBEDDINGS_BACKFILL_BATCH || 50);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(500, Math.floor(n)));
}

function getMaxRows() {
  const n = Number(process.env.AI_EMBEDDINGS_BACKFILL_MAX || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

async function main() {
  if (String(process.env.AI_EMBEDDINGS_ENABLED || 'false').toLowerCase() !== 'true') {
    console.error('AI_EMBEDDINGS_ENABLED must be true to run this script.');
    process.exit(1);
  }

  const batchSize = getBatchSize();
  const maxRows = getMaxRows();

  try {
    const ext = await db.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    if (!ext.rowCount) {
      console.error("pgvector extension is not installed. Run migrations (and ensure your Postgres supports pgvector).");
      process.exit(1);
    }

    const cols = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'ai_memories'
         AND column_name IN ('embedding','embedding_model','embedding_updated_at')`
    );
    const set = new Set(cols.rows.map(r => r.column_name));
    if (!set.has('embedding') || !set.has('embedding_model') || !set.has('embedding_updated_at')) {
      console.error('Embedding columns are missing on ai_memories. Run: npm run migrate');
      process.exit(1);
    }
  } catch (e) {
    console.error('Failed to validate pgvector/columns:', e?.message || String(e));
    process.exit(1);
  }

  let processed = 0;
  while (true) {
    if (maxRows && processed >= maxRows) break;

    const remaining = maxRows ? Math.max(0, maxRows - processed) : batchSize;
    const limit = Math.min(batchSize, remaining || batchSize);

    let rows;
    try {
      const res = await db.query(
        `SELECT id, key, value
         FROM ai_memories
         WHERE embedding IS NULL
         ORDER BY updated_at DESC
         LIMIT $1`,
        [limit]
      );
      rows = res.rows;
    } catch (e) {
      console.error('Failed to query memories for backfill:', e?.message || String(e));
      process.exit(1);
    }

    if (!rows.length) break;

    for (const r of rows) {
      const id = Number(r.id);
      const value = String(r.value || '').trim();
      const key = String(r.key || '').trim();
      const text = key ? `${key}: ${value}` : value;

      if (Number.isInteger(id) && id > 0 && text) {
        try {
          const vec = await embeddings.embedText(text);
          if (vec && vec.length) {
            const model = embeddings.getEmbeddingModelId();
            const literal = `[${vec.map(n => (Number.isFinite(Number(n)) ? String(Number(n)) : '0')).join(',')}]`;
            await db.query(
              `UPDATE ai_memories
               SET embedding = $2::vector,
                   embedding_model = $3,
                   embedding_updated_at = NOW()
               WHERE id = $1`,
              [id, literal, model]
            );
          }
        } catch (e) {
          console.error(`Failed to embed memory id=${id}:`, e?.message || String(e));
        }
      }

      processed += 1;
      if (maxRows && processed >= maxRows) break;
    }

    console.log(`Backfill progress: processed=${processed}`);
  }

  console.log(`Backfill complete: processed=${processed}`);
  await db.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
