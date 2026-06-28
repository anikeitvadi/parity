/**
 * Persistence for the Market Efficiency Study (`npm run study`).
 *
 * The study is reproducible: every run records (a) a self-describing run row
 * (model, thresholds, universe size, timestamp), (b) a point-in-time snapshot of
 * every market in the universe, and (c) the matched pairs with their gap math and
 * threshold flags. The embedding *vectors* live in `market_embedding_meta` (the
 * live matching cache, keyed by platform+market_id); these tables capture the
 * market facts and the match decisions so a reviewer can inspect exactly why only
 * a handful of markets matched — it's a record, not a runtime vibe.
 *
 * Kept separate from the app schema (database/schema.ts) so the study owns its
 * own storage and the live server never has to know about it. The same records
 * are also exported to docs/data/efficiency-study.json + gap-map.csv.
 *
 * @module database/study-store
 */

import Database from 'better-sqlite3';

/** One market in the scanned universe at study time. */
export interface StudyMarketRecord {
  marketId: string;
  platform: string;
  title: string;
  closeDate: string;
  price: number;
  volume: number;
}

/** One cross-platform matched pair with its gap math and threshold flags. */
export interface StudyPairRecord {
  polymarketId: string;
  kalshiId: string;
  polymarketTitle: string;
  kalshiTitle: string;
  cosineSimilarity: number;
  polymarketPrice: number;
  kalshiPrice: number;
  priceGap: number;
  feeAdjustedGap: number;
  surfaced3pp: boolean;
  beatsFees9pp: boolean;
  meetsDetector19pp: boolean;
  volume: number;
}

/** Everything one `npm run study` invocation persists. */
export interface StudyRunInput {
  generatedAt: string;
  embeddingModel: string;
  similarityThreshold: number;
  roundTripFees: number;
  universe: { polymarket: number; kalshi: number; total: number };
  markets: StudyMarketRecord[];
  pairs: StudyPairRecord[];
}

/** Normalize a market title for human-readable comparison (not used for matching). */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create the study tables if they don't exist. Idempotent; safe to call on every
 * run. Mirrors the WAL/INTEGER conventions used elsewhere in the schema.
 */
export function initStudyTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_runs (
      run_id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      similarity_threshold REAL NOT NULL,
      round_trip_fees REAL NOT NULL,
      universe_polymarket INTEGER NOT NULL,
      universe_kalshi INTEGER NOT NULL,
      universe_total INTEGER NOT NULL,
      matched_pairs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_markets (
      run_id INTEGER NOT NULL,
      market_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      close_date TEXT,
      price REAL,
      volume REAL,
      fetched_at TEXT NOT NULL,
      embedding_model TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_study_markets_run
      ON study_markets(run_id, platform);

    CREATE TABLE IF NOT EXISTS study_pairs (
      run_id INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      polymarket_id TEXT NOT NULL,
      kalshi_id TEXT NOT NULL,
      polymarket_title TEXT NOT NULL,
      kalshi_title TEXT NOT NULL,
      cosine_similarity REAL NOT NULL,
      polymarket_price REAL NOT NULL,
      kalshi_price REAL NOT NULL,
      price_gap REAL NOT NULL,
      fee_adjusted_gap REAL NOT NULL,
      surfaced_3pp INTEGER NOT NULL,
      beats_fees_9pp INTEGER NOT NULL,
      meets_detector_19pp INTEGER NOT NULL,
      volume REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_study_pairs_run
      ON study_pairs(run_id, price_gap DESC);
  `);
}

/**
 * Persist a full study run (run row + universe snapshot + matched pairs) in a
 * single transaction. Returns the new run_id.
 */
export function persistStudyRun(db: Database.Database, input: StudyRunInput): number {
  initStudyTables(db);

  const insertRun = db.prepare(`
    INSERT INTO study_runs
      (generated_at, embedding_model, similarity_threshold, round_trip_fees,
       universe_polymarket, universe_kalshi, universe_total, matched_pairs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMarket = db.prepare(`
    INSERT INTO study_markets
      (run_id, market_id, platform, title, normalized_title, close_date,
       price, volume, fetched_at, embedding_model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPair = db.prepare(`
    INSERT INTO study_pairs
      (run_id, generated_at, polymarket_id, kalshi_id, polymarket_title,
       kalshi_title, cosine_similarity, polymarket_price, kalshi_price,
       price_gap, fee_adjusted_gap, surfaced_3pp, beats_fees_9pp,
       meets_detector_19pp, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((data: StudyRunInput): number => {
    const result = insertRun.run(
      data.generatedAt,
      data.embeddingModel,
      data.similarityThreshold,
      data.roundTripFees,
      data.universe.polymarket,
      data.universe.kalshi,
      data.universe.total,
      data.pairs.length
    );
    const runId = Number(result.lastInsertRowid);

    for (const m of data.markets) {
      insertMarket.run(
        runId,
        m.marketId,
        m.platform,
        m.title,
        normalizeTitle(m.title),
        m.closeDate,
        m.price,
        m.volume,
        data.generatedAt,
        data.embeddingModel
      );
    }

    for (const p of data.pairs) {
      insertPair.run(
        runId,
        data.generatedAt,
        p.polymarketId,
        p.kalshiId,
        p.polymarketTitle,
        p.kalshiTitle,
        p.cosineSimilarity,
        p.polymarketPrice,
        p.kalshiPrice,
        p.priceGap,
        p.feeAdjustedGap,
        p.surfaced3pp ? 1 : 0,
        p.beatsFees9pp ? 1 : 0,
        p.meetsDetector19pp ? 1 : 0,
        p.volume
      );
    }

    return runId;
  });

  return tx(input);
}

export interface StudyRunRow {
  run_id: number;
  generated_at: string;
  embedding_model: string;
  similarity_threshold: number;
  round_trip_fees: number;
  universe_polymarket: number;
  universe_kalshi: number;
  universe_total: number;
  matched_pairs: number;
}

/** Most recent study run, or null if none persisted. */
export function getLatestStudyRun(db: Database.Database): StudyRunRow | null {
  initStudyTables(db);
  const row = db
    .prepare('SELECT * FROM study_runs ORDER BY run_id DESC LIMIT 1')
    .get() as StudyRunRow | undefined;
  return row ?? null;
}

/** Persisted matched pairs for a run, largest gap first. */
export function getStudyPairs(db: Database.Database, runId: number): Record<string, unknown>[] {
  initStudyTables(db);
  return db
    .prepare('SELECT * FROM study_pairs WHERE run_id = ? ORDER BY price_gap DESC')
    .all(runId) as Record<string, unknown>[];
}
