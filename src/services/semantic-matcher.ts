/**
 * Semantic Market Matcher
 *
 * Uses vector embeddings (OpenAI text-embedding-3-small) stored in
 * sqlite-vec to find semantically identical markets across platforms.
 *
 * Replaces keyword-based matching which produces false positives
 * (e.g., "next James Bond actor" matching "next James Bond villain").
 *
 * Architecture:
 * 1. Embed all market questions → 1536-dim vectors
 * 2. Store in sqlite-vec virtual table alongside market metadata
 * 3. For each market on platform A, KNN search against platform B
 * 4. Filter by cosine similarity threshold (0.85+)
 *
 * @module services/semantic-matcher
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { embedTexts, cosineSimilarity, EMBEDDING_DIMENSIONS } from './embedding.js';
import { logger } from '../utils/logger.js';
import type { Market } from '../types/market.js';

const matcherLogger = logger.child({ component: 'semantic-matcher' });

const SIMILARITY_THRESHOLD = 0.85;

export interface SemanticMatch {
  polymarket: Market;
  kalshi: Market;
  similarity: number;
  method: 'semantic';
}

/**
 * Initialize the sqlite-vec virtual table for embeddings.
 * Call this after initDatabase().
 */
export function initEmbeddingTable(db: Database.Database): void {
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_embedding_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      question TEXT NOT NULL,
      embedding BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(platform, market_id)
    );
  `);

  matcherLogger.debug('Embedding table initialized');
}

/**
 * Embed and store market questions. Skips markets that already
 * have up-to-date embeddings (within 24 hours).
 */
export async function embedMarkets(
  db: Database.Database,
  markets: Market[]
): Promise<number> {
  if (markets.length === 0) return 0;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h freshness

  // Find which markets need (re-)embedding
  const checkStmt = db.prepare(
    'SELECT updated_at FROM market_embedding_meta WHERE platform = ? AND market_id = ?'
  );

  const needsEmbedding: Market[] = [];
  for (const m of markets) {
    const existing = checkStmt.get(m.platform, m.id) as
      | { updated_at: number }
      | undefined;
    if (!existing || existing.updated_at < cutoff) {
      needsEmbedding.push(m);
    }
  }

  if (needsEmbedding.length === 0) {
    matcherLogger.debug('All embeddings are fresh');
    return 0;
  }

  // Batch embed (OpenAI supports up to 2048 inputs per call)
  const batchSize = 500;
  let embedded = 0;

  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO market_embedding_meta
    (market_id, platform, question, embedding, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < needsEmbedding.length; i += batchSize) {
    const batch = needsEmbedding.slice(i, i + batchSize);
    const texts = batch.map((m) => m.question);

    const vectors = await embedTexts(texts);
    if (!vectors) {
      matcherLogger.warn('Embedding API returned null — skipping batch');
      continue;
    }

    const insertMany = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const m = batch[j];
        const vec = vectors[j];
        upsertStmt.run(
          m.id,
          m.platform,
          m.question,
          Buffer.from(vec.buffer),
          Date.now()
        );
      }
    });

    insertMany();
    embedded += batch.length;
  }

  matcherLogger.info({ embedded, total: markets.length }, 'Embedded markets');
  return embedded;
}

/**
 * Find semantic matches between Polymarket and Kalshi markets.
 *
 * For each Polymarket market, finds the closest Kalshi market by
 * cosine similarity of their question embeddings. Only returns
 * matches above the similarity threshold.
 */
export function findSemanticMatches(
  db: Database.Database,
  polyMarkets: Market[],
  kalshiMarkets: Market[]
): SemanticMatch[] {
  const matches: SemanticMatch[] = [];

  // Build lookup maps
  const polyMap = new Map(polyMarkets.map((m) => [m.id, m]));
  const kalshiMap = new Map(kalshiMarkets.map((m) => [m.id, m]));

  // Load all embeddings
  const rows = db
    .prepare(
      'SELECT market_id, platform, embedding FROM market_embedding_meta'
    )
    .all() as { market_id: string; platform: string; embedding: Buffer }[];

  const polyEmbeddings: { id: string; vec: Float32Array }[] = [];
  const kalshiEmbeddings: { id: string; vec: Float32Array }[] = [];

  for (const row of rows) {
    const vec = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    if (row.platform === 'polymarket' && polyMap.has(row.market_id)) {
      polyEmbeddings.push({ id: row.market_id, vec });
    } else if (row.platform === 'kalshi' && kalshiMap.has(row.market_id)) {
      kalshiEmbeddings.push({ id: row.market_id, vec });
    }
  }

  if (polyEmbeddings.length === 0 || kalshiEmbeddings.length === 0) {
    matcherLogger.debug('Not enough embeddings for matching');
    return [];
  }

  // For each Polymarket market, find best Kalshi match
  const matchedKalshi = new Set<string>();

  for (const poly of polyEmbeddings) {
    let bestSim = 0;
    let bestKalshiId = '';

    for (const kalshi of kalshiEmbeddings) {
      if (matchedKalshi.has(kalshi.id)) continue;

      const sim = cosineSimilarity(poly.vec, kalshi.vec);
      if (sim > bestSim) {
        bestSim = sim;
        bestKalshiId = kalshi.id;
      }
    }

    if (bestSim >= SIMILARITY_THRESHOLD && bestKalshiId) {
      const polyMarket = polyMap.get(poly.id);
      const kalshiMarket = kalshiMap.get(bestKalshiId);

      if (polyMarket && kalshiMarket) {
        matches.push({
          polymarket: polyMarket,
          kalshi: kalshiMarket,
          similarity: bestSim,
          method: 'semantic',
        });
        matchedKalshi.add(bestKalshiId);
      }
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.similarity - a.similarity);

  matcherLogger.info(
    {
      polyCount: polyEmbeddings.length,
      kalshiCount: kalshiEmbeddings.length,
      matches: matches.length,
    },
    'Semantic matching complete'
  );

  return matches;
}
