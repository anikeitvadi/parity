import { describe, it, expect, afterEach } from 'vitest';
import { initDatabase, closeDatabase } from '../../src/database/schema.js';
import {
  persistStudyRun,
  getLatestStudyRun,
  getStudyPairs,
  normalizeTitle,
  type StudyRunInput,
} from '../../src/database/study-store.js';

function sampleRun(overrides: Partial<StudyRunInput> = {}): StudyRunInput {
  return {
    generatedAt: '2026-06-16T17:00:16.205Z',
    embeddingModel: 'text-embedding-3-small',
    similarityThreshold: 0.85,
    roundTripFees: 0.09,
    universe: { polymarket: 1500, kalshi: 719, total: 2219 },
    markets: [
      { marketId: 'poly-1', platform: 'polymarket', title: 'Will X happen?', closeDate: '2026-12-31', price: 0.2, volume: 1000 },
      { marketId: 'kalshi-1', platform: 'kalshi', title: 'Will X happen?', closeDate: '2026-12-31', price: 0.38, volume: 2000 },
    ],
    pairs: [
      {
        polymarketId: 'poly-1',
        kalshiId: 'kalshi-1',
        polymarketTitle: 'Will X happen?',
        kalshiTitle: 'Will X occur?',
        cosineSimilarity: 0.8536,
        polymarketPrice: 0.195,
        kalshiPrice: 0.38,
        priceGap: 0.185,
        feeAdjustedGap: 0.095,
        surfaced3pp: true,
        beatsFees9pp: true,
        meetsDetector19pp: false,
        volume: 1624573,
      },
    ],
    ...overrides,
  };
}

describe('study-store', () => {
  afterEach(() => closeDatabase());

  it('normalizeTitle lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeTitle('Will  Naftali Bennett be PM?!')).toBe('will naftali bennett be pm');
  });

  it('persists a run with its universe snapshot and matched pairs', () => {
    const db = initDatabase(':memory:');
    const runId = persistStudyRun(db, sampleRun());
    expect(runId).toBeGreaterThan(0);

    const run = getLatestStudyRun(db);
    expect(run).not.toBeNull();
    expect(run!.universe_total).toBe(2219);
    expect(run!.matched_pairs).toBe(1);
    expect(run!.embedding_model).toBe('text-embedding-3-small');
    expect(run!.similarity_threshold).toBe(0.85);

    const markets = db.prepare('SELECT COUNT(*) AS c FROM study_markets WHERE run_id = ?').get(runId) as { c: number };
    expect(markets.c).toBe(2);

    const pairs = getStudyPairs(db, runId);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].polymarket_id).toBe('poly-1');
    expect(pairs[0].kalshi_id).toBe('kalshi-1');
    expect(pairs[0].price_gap).toBeCloseTo(0.185);
    // Threshold flags persist as 0/1 integers a reviewer can filter on.
    expect(pairs[0].beats_fees_9pp).toBe(1);
    expect(pairs[0].meets_detector_19pp).toBe(0);
  });

  it('keeps each run separate and returns the most recent', () => {
    const db = initDatabase(':memory:');
    persistStudyRun(db, sampleRun({ generatedAt: '2026-06-16T00:00:00.000Z' }));
    const second = persistStudyRun(db, sampleRun({ generatedAt: '2026-06-20T00:00:00.000Z', universe: { polymarket: 1600, kalshi: 800, total: 2400 } }));

    const run = getLatestStudyRun(db);
    expect(run!.run_id).toBe(second);
    expect(run!.universe_total).toBe(2400);

    const allRuns = db.prepare('SELECT COUNT(*) AS c FROM study_runs').get() as { c: number };
    expect(allRuns.c).toBe(2);
  });
});
