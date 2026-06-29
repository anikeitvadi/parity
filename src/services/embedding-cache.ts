/**
 * Persistent embedding cache (SQLite-backed).
 *
 * Embedding the full tradeable universe is ~25M tokens and the slowest part of
 * the study (TPM-throttled, tens of minutes). Embeddings are pure functions of
 * (text, model), so they cache perfectly: keyed by sha256(model + text), a
 * re-run only embeds genuinely new market text. This is what makes the pipeline
 * iterable — the billion-scale match can be re-tuned without re-embedding.
 *
 * @module services/embedding-cache
 */

import crypto from 'crypto';
import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database/schema.js';
import { embedTexts, EMBEDDING_MODEL } from './embedding.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'embedding-cache' });
const EMBED_BATCH = 200;

function ensureTable(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS embedding_cache (
       key TEXT PRIMARY KEY,
       model TEXT NOT NULL,
       dim INTEGER NOT NULL,
       vec BLOB NOT NULL
     )`
  );
}

function cacheKey(text: string, model: string): string {
  return crypto.createHash('sha256').update(`${model}\n${text}`).digest('hex');
}

/** Pack a Float32Array into an owned Buffer (copy — never alias the SQLite page). */
function pack(v: Float32Array): Buffer {
  return Buffer.from(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
}

/** Unpack a stored BLOB back into a Float32Array (copy out of the SQLite buffer). */
function unpack(buf: Buffer): Float32Array {
  const copy = Buffer.from(buf); // own the bytes; SQLite reuses its page buffer
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export interface EmbedCacheStats {
  hits: number;
  misses: number;
}

/**
 * Embed `texts`, serving hits from the SQLite cache and embedding only misses
 * (in bounded batches), then persisting the new vectors. Order-preserving.
 */
export async function embedTextsCached(
  texts: string[],
  opts: { model?: string; db?: Database; stats?: EmbedCacheStats } = {}
): Promise<Float32Array[]> {
  const model = opts.model ?? EMBEDDING_MODEL;
  const db = opts.db ?? getDatabase();
  ensureTable(db);
  const getStmt = db.prepare('SELECT vec FROM embedding_cache WHERE key = ?');
  const putStmt = db.prepare(
    'INSERT OR REPLACE INTO embedding_cache (key, model, dim, vec) VALUES (?, ?, ?, ?)'
  );

  const out: (Float32Array | null)[] = new Array(texts.length).fill(null);
  const missIdx: number[] = [];
  const missText: string[] = [];

  texts.forEach((t, i) => {
    const row = getStmt.get(cacheKey(t, model)) as { vec: Buffer } | undefined;
    if (row) out[i] = unpack(row.vec);
    else {
      missIdx.push(i);
      missText.push(t);
    }
  });

  if (opts.stats) {
    opts.stats.hits += texts.length - missText.length;
    opts.stats.misses += missText.length;
  }

  if (missText.length > 0) {
    log.info({ total: texts.length, misses: missText.length }, 'embedding cache misses — calling API');
    for (let i = 0; i < missText.length; i += EMBED_BATCH) {
      const slice = missText.slice(i, i + EMBED_BATCH);
      const batch = await embedTexts(slice);
      if (!batch) throw new Error('embedding failed (no OPENAI_API_KEY?)');
      const writeBatch = db.transaction((vecs: Float32Array[]) => {
        vecs.forEach((v, j) => {
          const globalIdx = missIdx[i + j];
          out[globalIdx] = v;
          putStmt.run(cacheKey(texts[globalIdx], model), model, v.length, pack(v));
        });
      });
      writeBatch(batch);
    }
  }

  return out as Float32Array[];
}
