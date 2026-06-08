/**
 * embeddingService.js — Phase 3 implementation
 * Semantic similarity computation via TF-IDF (default) or transformers.js (optional).
 *
 * Set EMBEDDING_PROVIDER=transformers in .env to use @xenova/transformers.
 * Falls back to TF-IDF gracefully if transformers.js is not installed.
 */

const db = require('../db');

// Resolve provider from env var
const PROVIDER = process.env.EMBEDDING_PROVIDER || 'tfidf';

// ============================================================
// TEXT UTILITIES
// ============================================================

/**
 * Build a flat corpus text string from a bookmark's fields.
 * Handles missing/null tags gracefully.
 */
const buildText = (bookmark) => {
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  return [bookmark.title, bookmark.description, ...tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

/**
 * Tokenize text: split on non-word chars, remove stop words, drop short tokens.
 */
const tokenize = (text) => {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'for', 'of',
    'and', 'or', 'but', 'with', 'this', 'that', 'it', 'its', 'be',
    'are', 'was', 'were', 'has', 'have', 'had', 'by', 'from', 'as',
    'not', 'can', 'will', 'do', 'did', 'does', 'so', 'if', 'my',
    'your', 'we', 'us', 'how', 'what', 'why', 'when', 'who', 'all',
    'more', 'any', 'get', 'also', 'use', 'used', 'into', 'about',
  ]);
  if (!text || typeof text !== 'string') return [];
  return text.split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
};

/**
 * Compute term frequency (TF) for a token array.
 * Returns a map of { term → tf_value }.
 */
const computeTF = (tokens) => {
  const tf = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  const total = tokens.length || 1;
  Object.keys(tf).forEach(k => { tf[k] /= total; });
  return tf;
};

/**
 * Compute inverse document frequency (IDF) across an array of token arrays.
 * Returns a map of { term → idf_value } using smooth IDF.
 */
const computeIDF = (documents) => {
  const df = {};
  const N = documents.length;
  documents.forEach(tokens => {
    new Set(tokens).forEach(term => {
      df[term] = (df[term] || 0) + 1;
    });
  });
  const idf = {};
  Object.keys(df).forEach(term => {
    idf[term] = Math.log((N + 1) / (df[term] + 1)) + 1;
  });
  return idf;
};

/**
 * Compute cosine similarity between two sparse TF-IDF vectors.
 * Returns a value in [0, 1].
 */
const cosineSimilarity = (vecA, vecB) => {
  const allTerms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, magA = 0, magB = 0;
  allTerms.forEach(t => {
    const a = vecA[t] || 0;
    const b = vecB[t] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  });
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
};

// ============================================================
// TF-IDF PROVIDER
// ============================================================

/**
 * Compute pairwise similarities for all bookmarks using TF-IDF cosine similarity.
 * Only pairs with score >= THRESHOLD are stored to keep the cache lean.
 *
 * @param {Array<{ id: number, title: string, description: string, tags: string[], url: string }>} bookmarks
 * @returns {Promise<void>}
 */
const computeAllSimilarities = async (bookmarks) => {
  if (!bookmarks || bookmarks.length < 2) {
    console.log('[embeddingService] Not enough bookmarks to compute similarities.');
    return;
  }

  console.log(`[embeddingService] Computing TF-IDF similarities for ${bookmarks.length} bookmarks...`);
  const startTime = Date.now();

  // Build corpus
  const corpus = bookmarks.map(b => tokenize(buildText(b)));
  const idf = computeIDF(corpus);

  // Build TF-IDF vectors for each bookmark
  const vectors = corpus.map(tokens => {
    const tf = computeTF(tokens);
    const tfidf = {};
    Object.keys(tf).forEach(term => {
      if (idf[term] !== undefined) tfidf[term] = tf[term] * idf[term];
    });
    return tfidf;
  });

  // Compute pairwise similarities with threshold shortcut
  const THRESHOLD = 0.1;
  const pairs = [];

  for (let i = 0; i < bookmarks.length; i++) {
    for (let j = i + 1; j < bookmarks.length; j++) {
      const score = cosineSimilarity(vectors[i], vectors[j]);
      if (score >= THRESHOLD) {
        pairs.push({
          a: bookmarks[i].id,
          b: bookmarks[j].id,
          score: Math.round(score * 1000) / 1000,
        });
      }
    }
  }

  // Cache results in both directions for O(1) lookup
  const allPairs = [
    ...pairs,
    ...pairs.map(p => ({ a: p.b, b: p.a, score: p.score })),
  ];

  db.clearSimilarities();
  db.upsertSimilarities(allPairs);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[embeddingService] Done. ${pairs.length} unique pairs stored (${allPairs.length} with reverse). Elapsed: ${elapsed}s`);
};

// ============================================================
// TRANSFORMERS.JS PROVIDER (optional, lazy-loaded)
// ============================================================

let pipeline = null;

const loadTransformersProvider = async () => {
  if (pipeline) return pipeline;
  try {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[embeddingService] transformers.js pipeline loaded successfully.');
    return pipeline;
  } catch (err) {
    console.warn('[embeddingService] transformers.js not available, falling back to TF-IDF:', err.message);
    return null;
  }
};

/**
 * Compute pairwise similarities using transformer embeddings.
 * Gracefully falls back to TF-IDF if @xenova/transformers is not installed.
 *
 * @param {Array<{ id: number, title: string, description: string, tags: string[], url: string }>} bookmarks
 * @returns {Promise<void>}
 */
const computeAllSimilaritiesTransformers = async (bookmarks) => {
  if (!bookmarks || bookmarks.length < 2) {
    console.log('[embeddingService] Not enough bookmarks to compute similarities.');
    return;
  }

  const pipe = await loadTransformersProvider();
  // Graceful fallback if transformers.js is unavailable
  if (!pipe) return computeAllSimilarities(bookmarks);

  console.log(`[embeddingService] Computing transformer embeddings for ${bookmarks.length} bookmarks...`);
  const startTime = Date.now();

  const texts = bookmarks.map(buildText);
  const embeddings = await Promise.all(
    texts.map(t => pipe(t, { pooling: 'mean', normalize: true }))
  );

  const THRESHOLD = 0.1;
  const pairs = [];

  for (let i = 0; i < bookmarks.length; i++) {
    for (let j = i + 1; j < bookmarks.length; j++) {
      // Dense vector cosine similarity (vectors are already normalized, so dot = cosine)
      const vecA = Array.from(embeddings[i].data);
      const vecB = Array.from(embeddings[j].data);
      const dot = vecA.reduce((sum, v, k) => sum + v * vecB[k], 0);
      const score = Math.round(dot * 1000) / 1000;
      if (score >= THRESHOLD) {
        pairs.push({ a: bookmarks[i].id, b: bookmarks[j].id, score });
      }
    }
  }

  const allPairs = [
    ...pairs,
    ...pairs.map(p => ({ a: p.b, b: p.a, score: p.score })),
  ];

  db.clearSimilarities();
  db.upsertSimilarities(allPairs);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[embeddingService] Done. ${pairs.length} unique pairs stored. Elapsed: ${elapsed}s`);
};

// ============================================================
// EXPORTED API
// ============================================================

/**
 * Returns the name of the current embedding/similarity provider.
 * @returns {string}
 */
const getProviderName = () => PROVIDER;

/**
 * Returns the ISO datetime string of the last similarity computation, or null.
 * @returns {Promise<string|null>}
 */
const getLastComputed = async () => db.getLastSimilarityComputed();

module.exports = {
  computeAllSimilarities: PROVIDER === 'transformers'
    ? computeAllSimilaritiesTransformers
    : computeAllSimilarities,
  getProviderName,
  getLastComputed,
};
