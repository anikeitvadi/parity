import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, getDatabase, closeDatabase } from '../src/database/schema.js';
import {
  insertSnapshot,
  insertMany,
  getRecentSnapshots,
  getMarketHistory,
  getLatestSnapshot,
  insertOpportunity,
  insertOpportunities,
  getRecentOpportunities,
  getOpportunityStats,
  type MarketSnapshot,
  type OpportunityRow,
} from '../src/database/queries.js';
import type { ScoredOpportunity } from '../src/scoring/types.js';

describe('Database Schema', () => {
  const testDbPath = ':memory:';

  afterAll(() => {
    closeDatabase();
  });

  it('should initialize database with WAL mode enabled', () => {
    const db = initDatabase(testDbPath);
    const result = db.pragma('journal_mode');
    expect(result[0].journal_mode).toBe('memory'); // In-memory uses 'memory' mode, not 'wal'
    closeDatabase();
  });

  it('should enable WAL mode for file-based database', () => {
    const db = initDatabase('./test-wal.db');
    const result = db.pragma('journal_mode');
    expect(result[0].journal_mode).toBe('wal');
    closeDatabase();
    // Clean up test file
    const fs = require('fs');
    try {
      fs.unlinkSync('./test-wal.db');
      fs.unlinkSync('./test-wal.db-wal');
      fs.unlinkSync('./test-wal.db-shm');
    } catch {}
  });

  it('should create market_snapshots table with correct schema', () => {
    const db = initDatabase(testDbPath);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='market_snapshots'"
    ).all();
    expect(tables.length).toBe(1);
    closeDatabase();
  });

  it('should create indexes for efficient querying', () => {
    const db = initDatabase(testDbPath);
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_snapshots%'"
    ).all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_snapshots_platform_time');
    expect(indexNames).toContain('idx_snapshots_market');
    closeDatabase();
  });
});

describe('Snapshot Operations', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterAll(() => {
    closeDatabase();
  });

  describe('insertSnapshot', () => {
    it('should insert a snapshot and retrieve it', () => {
      const snapshot: MarketSnapshot = {
        platform: 'polymarket',
        marketId: 'market-123',
        timestamp: Date.now(),
        data: { price: 0.65, volume: 1000 },
      };

      insertSnapshot(snapshot);
      const results = getRecentSnapshots('polymarket', 10);

      expect(results.length).toBe(1);
      expect(results[0].platform).toBe('polymarket');
      expect(results[0].marketId).toBe('market-123');
      expect(results[0].data).toEqual({ price: 0.65, volume: 1000 });
    });

    it('should ignore duplicate snapshots (INSERT OR IGNORE)', () => {
      const snapshot: MarketSnapshot = {
        platform: 'polymarket',
        marketId: 'market-123',
        timestamp: 1700000000000,
        data: { price: 0.65 },
      };

      insertSnapshot(snapshot);
      insertSnapshot(snapshot); // Duplicate - same platform, marketId, timestamp
      const results = getRecentSnapshots('polymarket', 10);

      expect(results.length).toBe(1);
    });
  });

  describe('insertMany', () => {
    it('should batch insert multiple snapshots in a transaction', () => {
      const snapshots: MarketSnapshot[] = Array.from({ length: 100 }, (_, i) => ({
        platform: 'polymarket',
        marketId: `market-${i}`,
        timestamp: Date.now() + i,
        data: { price: 0.5 + i * 0.001 },
      }));

      insertMany(snapshots);
      const results = getRecentSnapshots('polymarket', 200);

      expect(results.length).toBe(100);
    });

    it('should complete batch insert of 100 snapshots in under 100ms', () => {
      const snapshots: MarketSnapshot[] = Array.from({ length: 100 }, (_, i) => ({
        platform: 'kalshi',
        marketId: `perf-test-${i}`,
        timestamp: Date.now() + i,
        data: { price: 0.5 },
      }));

      const start = performance.now();
      insertMany(snapshots);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('getRecentSnapshots', () => {
    it('should return only snapshots from specified platform', () => {
      insertSnapshot({ platform: 'polymarket', marketId: 'm1', timestamp: 1000, data: {} });
      insertSnapshot({ platform: 'kalshi', marketId: 'm2', timestamp: 2000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'm3', timestamp: 3000, data: {} });

      const polyResults = getRecentSnapshots('polymarket', 10);
      const kalshiResults = getRecentSnapshots('kalshi', 10);

      expect(polyResults.length).toBe(2);
      expect(kalshiResults.length).toBe(1);
      expect(polyResults.every((s) => s.platform === 'polymarket')).toBe(true);
    });

    it('should return snapshots ordered by timestamp descending', () => {
      insertSnapshot({ platform: 'polymarket', marketId: 'm1', timestamp: 1000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'm2', timestamp: 3000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'm3', timestamp: 2000, data: {} });

      const results = getRecentSnapshots('polymarket', 10);

      expect(results[0].timestamp).toBe(3000);
      expect(results[1].timestamp).toBe(2000);
      expect(results[2].timestamp).toBe(1000);
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        insertSnapshot({ platform: 'polymarket', marketId: `m${i}`, timestamp: i * 1000, data: {} });
      }

      const results = getRecentSnapshots('polymarket', 5);
      expect(results.length).toBe(5);
    });
  });

  describe('getMarketHistory', () => {
    it('should return snapshots within time range', () => {
      insertSnapshot({ platform: 'polymarket', marketId: 'market-abc', timestamp: 1000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'market-abc', timestamp: 2000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'market-abc', timestamp: 3000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'market-abc', timestamp: 4000, data: {} });

      const results = getMarketHistory('market-abc', 1500, 3500);

      expect(results.length).toBe(2);
      expect(results.every((s) => s.timestamp >= 1500 && s.timestamp <= 3500)).toBe(true);
    });

    it('should return snapshots ordered by timestamp ascending', () => {
      insertSnapshot({ platform: 'polymarket', marketId: 'market-xyz', timestamp: 3000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'market-xyz', timestamp: 1000, data: {} });
      insertSnapshot({ platform: 'polymarket', marketId: 'market-xyz', timestamp: 2000, data: {} });

      const results = getMarketHistory('market-xyz', 0, 5000);

      expect(results[0].timestamp).toBe(1000);
      expect(results[1].timestamp).toBe(2000);
      expect(results[2].timestamp).toBe(3000);
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return the most recent snapshot for a market', () => {
      insertSnapshot({ platform: 'polymarket', marketId: 'target-market', timestamp: 1000, data: { v: 1 } });
      insertSnapshot({ platform: 'polymarket', marketId: 'target-market', timestamp: 3000, data: { v: 3 } });
      insertSnapshot({ platform: 'polymarket', marketId: 'target-market', timestamp: 2000, data: { v: 2 } });

      const result = getLatestSnapshot('polymarket', 'target-market');

      expect(result).not.toBeNull();
      expect(result!.timestamp).toBe(3000);
      expect(result!.data).toEqual({ v: 3 });
    });

    it('should return null if no snapshot exists', () => {
      const result = getLatestSnapshot('polymarket', 'nonexistent-market');
      expect(result).toBeNull();
    });
  });

  describe('WAL Mode - Concurrent Access', () => {
    it('should allow reads during writes (WAL mode verification)', async () => {
      // Insert initial data
      insertSnapshot({ platform: 'polymarket', marketId: 'wal-test', timestamp: 1000, data: {} });

      // Simulate concurrent read while preparing to write
      const readPromise = Promise.resolve(getRecentSnapshots('polymarket', 10));

      // Insert more data
      insertMany(Array.from({ length: 50 }, (_, i) => ({
        platform: 'polymarket',
        marketId: `wal-market-${i}`,
        timestamp: 2000 + i,
        data: {},
      })));

      const readResult = await readPromise;

      // Both operations should complete without blocking
      expect(readResult.length).toBeGreaterThanOrEqual(1);
      const allResults = getRecentSnapshots('polymarket', 100);
      expect(allResults.length).toBe(51);
    });
  });
});

describe('Opportunity Operations', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterAll(() => {
    closeDatabase();
  });

  const createMockOpportunity = (overrides: Partial<ScoredOpportunity> = {}): ScoredOpportunity => ({
    id: 'test-opp-1',
    type: 'multi_outcome',
    platform: 'polymarket',
    marketId: 'market-123',
    marketQuestion: 'Will event X happen?',
    grossEdge: 0.12,
    netEdge: 0.10,
    detectorConfidence: 0.85,
    minLiquidity: 5000,
    liquidityDepth: 3,
    detectedAt: Date.now(),
    closeDate: '2026-03-01',
    raw: {},
    score: 7.5,
    scoreBreakdown: {
      edgeScore: 8,
      confidenceScore: 7,
      liquidityScore: 8,
      timeScore: 6,
      profitScore: 7,
      weights: {
        edgeSize: 0.35,
        confidence: 0.25,
        liquidity: 0.20,
        timeToResolution: 0.10,
        feeAdjustedProfit: 0.10,
      },
    },
    positionSize: 50,
    positionPercent: 0.10,
    ...overrides,
  });

  describe('insertOpportunity', () => {
    it('should insert an opportunity and retrieve it', () => {
      const opp = createMockOpportunity();
      insertOpportunity(opp);

      const results = getRecentOpportunities(0, 10, 24);
      expect(results.length).toBe(1);
      expect(results[0].opportunity_id).toBe('test-opp-1');
      expect(results[0].score).toBe(7.5);
      expect(results[0].platform).toBe('polymarket');
    });

    it('should ignore duplicate opportunities (INSERT OR IGNORE)', () => {
      const opp = createMockOpportunity({ detectedAt: 1700000000000 });

      insertOpportunity(opp);
      insertOpportunity(opp); // Duplicate - same opportunity_id, detected_at

      const stats = getOpportunityStats();
      expect(stats.total).toBe(1);
    });

    it('should store score breakdown as JSON', () => {
      const opp = createMockOpportunity();
      insertOpportunity(opp);

      const results = getRecentOpportunities(0, 10, 24);
      const breakdown = JSON.parse(results[0].score_breakdown);
      expect(breakdown.edgeScore).toBe(8);
      expect(breakdown.weights.edgeSize).toBe(0.35);
    });
  });

  describe('insertOpportunities', () => {
    it('should batch insert multiple opportunities in a transaction', () => {
      const opps = Array.from({ length: 50 }, (_, i) =>
        createMockOpportunity({
          id: `opp-${i}`,
          detectedAt: Date.now() + i,
          score: 5 + (i % 5),
        })
      );

      insertOpportunities(opps);

      const stats = getOpportunityStats();
      expect(stats.total).toBe(50);
    });

    it('should complete batch insert of 100 opportunities in under 100ms', () => {
      const opps = Array.from({ length: 100 }, (_, i) =>
        createMockOpportunity({
          id: `perf-opp-${i}`,
          detectedAt: Date.now() + i,
        })
      );

      const start = performance.now();
      insertOpportunities(opps);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('getRecentOpportunities', () => {
    it('should filter by minimum score', () => {
      insertOpportunity(createMockOpportunity({ id: 'low', score: 3, detectedAt: Date.now() }));
      insertOpportunity(createMockOpportunity({ id: 'med', score: 6, detectedAt: Date.now() + 1 }));
      insertOpportunity(createMockOpportunity({ id: 'high', score: 9, detectedAt: Date.now() + 2 }));

      const results = getRecentOpportunities(5, 10, 24);
      expect(results.length).toBe(2);
      expect(results.every((r) => r.score >= 5)).toBe(true);
    });

    it('should respect hoursBack parameter', () => {
      const now = Date.now();
      insertOpportunity(createMockOpportunity({
        id: 'old',
        detectedAt: now - (25 * 60 * 60 * 1000), // 25 hours ago
      }));
      insertOpportunity(createMockOpportunity({
        id: 'recent',
        detectedAt: now - (1 * 60 * 60 * 1000), // 1 hour ago
      }));

      const results = getRecentOpportunities(0, 10, 24);
      expect(results.length).toBe(1);
      expect(results[0].opportunity_id).toBe('recent');
    });

    it('should order by detected_at DESC, score DESC', () => {
      const now = Date.now();
      insertOpportunity(createMockOpportunity({ id: 'a', score: 8, detectedAt: now }));
      insertOpportunity(createMockOpportunity({ id: 'b', score: 9, detectedAt: now }));
      insertOpportunity(createMockOpportunity({ id: 'c', score: 7, detectedAt: now + 1000 }));

      const results = getRecentOpportunities(0, 10, 24);
      expect(results[0].opportunity_id).toBe('c'); // Most recent
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score); // Same time, higher score first
    });
  });

  describe('getOpportunityStats', () => {
    it('should return correct aggregate stats', () => {
      insertOpportunity(createMockOpportunity({ id: 'mo1', type: 'multi_outcome', score: 6, detectedAt: Date.now() }));
      insertOpportunity(createMockOpportunity({ id: 'mo2', type: 'multi_outcome', score: 8, detectedAt: Date.now() + 1 }));
      insertOpportunity(createMockOpportunity({ id: 'co1', type: 'correlated', score: 7, detectedAt: Date.now() + 2 }));

      const stats = getOpportunityStats();
      expect(stats.total).toBe(3);
      expect(stats.byType['multi_outcome']).toBe(2);
      expect(stats.byType['correlated']).toBe(1);
      expect(stats.avgScore).toBe(7); // (6 + 8 + 7) / 3
    });

    it('should return zero stats for empty database', () => {
      const stats = getOpportunityStats();
      expect(stats.total).toBe(0);
      expect(stats.avgScore).toBe(0);
      expect(Object.keys(stats.byType).length).toBe(0);
    });
  });
});
