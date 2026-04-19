/**
 * Embedding service for semantic market matching.
 *
 * Uses OpenAI text-embedding-3-small (1536 dimensions) to generate
 * vector embeddings of market questions. Falls back gracefully
 * if no API key is configured.
 *
 * @module services/embedding
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const embeddingLogger = logger.child({ component: 'embedding' });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}

/**
 * Generate embeddings for a batch of texts.
 * Returns null if OpenAI API key is not configured.
 */
export async function embedTexts(
  texts: string[]
): Promise<Float32Array[] | null> {
  const openai = getClient();
  if (!openai) {
    embeddingLogger.debug('Embedding unavailable — no OPENAI_API_KEY');
    return null;
  }

  if (texts.length === 0) return [];

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return response.data.map((item) => new Float32Array(item.embedding));
  } catch (err) {
    embeddingLogger.error({ err }, 'Failed to generate embeddings');
    return null;
  }
}

/**
 * Generate embedding for a single text.
 */
export async function embedText(text: string): Promise<Float32Array | null> {
  const results = await embedTexts([text]);
  return results ? results[0] : null;
}

/**
 * Calculate cosine similarity between two vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export { EMBEDDING_DIMENSIONS };
