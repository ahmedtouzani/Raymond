let extractorPromise = null;
let activeModelId = null;

function getEmbeddingModelId() {
  return (process.env.AI_EMBEDDINGS_MODEL || 'Xenova/all-MiniLM-L6-v2').trim() || 'Xenova/all-MiniLM-L6-v2';
}

async function getExtractor() {
  const modelId = getEmbeddingModelId();
  if (extractorPromise && activeModelId === modelId) return extractorPromise;

  extractorPromise = (async () => {
    const transformers = await import('@xenova/transformers');
    const { env, pipeline } = transformers;

    const cacheDir = (process.env.AI_EMBEDDINGS_CACHE_DIR || '').trim();
    if (cacheDir) env.cacheDir = cacheDir;

    activeModelId = modelId;
    return await pipeline('feature-extraction', modelId);
  })();

  return extractorPromise;
}

function toNumberArray(vec) {
  if (!vec) return null;

  if (Array.isArray(vec)) {
    return vec.flat(Infinity).map(Number);
  }

  if (vec.data && (vec.data instanceof Float32Array || ArrayBuffer.isView(vec.data))) {
    return Array.from(vec.data, Number);
  }

  return null;
}

async function embedText(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  const extractor = await getExtractor();
  const out = await extractor(t, { pooling: 'mean', normalize: true });
  const arr = toNumberArray(out);

  if (!arr || !arr.length) return null;
  return arr;
}

module.exports = {
  embedText,
  getEmbeddingModelId,
};
