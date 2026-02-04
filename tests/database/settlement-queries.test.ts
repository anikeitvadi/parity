import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDatabase,
  closeDatabase,
} from '../../src/database/schema.js';
import {
  saveSettlementComparison,
  getSettlementComparison,
  setSettlementOverride,
  recordSettlementOutcome,
  getSafeComparisons,
  getDivergenceStats,
} from '../../src/database/queries.js';
import type { SettlementComparison } from '../../src/types/settlement.js';

describe('Settlement Comparison Database Operations', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  const mockComparison: SettlementComparison = {
    polymarketId: 'poly-123',
    kalshiTicker: 'KALSHI-ABC',
    similarity: {
      question: 0.95,
      criteria: 0.85,
      timing: 0.9,
      dataSource: 0.7,
      overall: 0.88,
    },
    safeForArbitrage: true,
    riskFactors: ['timing_difference'],
    comparedAt: new Date('2026-02-04T12:00:00Z'),
  };

  describe('saveSettlementComparison', () => {
    it('saves a new comparison', () => {
      saveSettlementComparison(mockComparison);

      const result = getSettlementComparison('poly-123', 'KALSHI-ABC');
      expect(result).not.toBeNull();
      expect(result!.polymarketId).toBe('poly-123');
      expect(result!.similarity.overall).toBe(0.88);
    });

    it('updates existing comparison on upsert', () => {
      saveSettlementComparison(mockComparison);

      const updated = {
        ...mockComparison,
        similarity: { ...mockComparison.similarity, overall: 0.95 },
      };
      saveSettlementComparison(updated);

      const result = getSettlementComparison('poly-123', 'KALSHI-ABC');
      expect(result!.similarity.overall).toBe(0.95);
    });
  });

  describe('getSettlementComparison', () => {
    it('returns null for non-existent comparison', () => {
      const result = getSettlementComparison('nonexistent', 'also-nonexistent');
      expect(result).toBeNull();
    });

    it('returns full comparison with all fields', () => {
      const withNotes: SettlementComparison = {
        ...mockComparison,
        manualOverride: 'safe',
        notes: 'Verified manually',
      };
      saveSettlementComparison(withNotes);

      const result = getSettlementComparison('poly-123', 'KALSHI-ABC');
      expect(result!.manualOverride).toBe('safe');
      expect(result!.notes).toBe('Verified manually');
    });
  });

  describe('setSettlementOverride', () => {
    it('sets manual override on existing comparison', () => {
      saveSettlementComparison(mockComparison);
      setSettlementOverride('poly-123', 'KALSHI-ABC', 'unsafe', 'Different criteria');

      const result = getSettlementComparison('poly-123', 'KALSHI-ABC');
      expect(result!.manualOverride).toBe('unsafe');
      expect(result!.notes).toBe('Different criteria');
    });
  });

  describe('recordSettlementOutcome', () => {
    it('records settlement outcome for tracking', () => {
      saveSettlementComparison(mockComparison);
      recordSettlementOutcome('poly-123', 'KALSHI-ABC', 'matched');

      const result = getSettlementComparison('poly-123', 'KALSHI-ABC');
      expect(result!.settlementOutcome).toBe('matched');
    });

    it('records divergence for analysis', () => {
      saveSettlementComparison(mockComparison);
      recordSettlementOutcome('poly-123', 'KALSHI-ABC', 'diverged');

      const result = getSettlementComparison('poly-123', 'KALSHI-ABC');
      expect(result!.settlementOutcome).toBe('diverged');
    });
  });

  describe('getSafeComparisons', () => {
    it('returns empty array when no safe comparisons', () => {
      const result = getSafeComparisons();
      expect(result).toHaveLength(0);
    });

    it('returns only comparisons marked safe', () => {
      saveSettlementComparison(mockComparison);
      saveSettlementComparison({
        ...mockComparison,
        polymarketId: 'poly-456',
        kalshiTicker: 'KALSHI-DEF',
        safeForArbitrage: false,
      });

      const result = getSafeComparisons();
      expect(result).toHaveLength(1);
      expect(result[0].polymarketId).toBe('poly-123');
    });

    it('orders by confidence descending', () => {
      saveSettlementComparison(mockComparison);
      saveSettlementComparison({
        ...mockComparison,
        polymarketId: 'poly-456',
        kalshiTicker: 'KALSHI-DEF',
        similarity: { ...mockComparison.similarity, overall: 0.95 },
      });

      const result = getSafeComparisons();
      expect(result[0].similarity.overall).toBe(0.95);
      expect(result[1].similarity.overall).toBe(0.88);
    });
  });

  describe('getDivergenceStats', () => {
    it('returns zero stats when no outcomes recorded', () => {
      const stats = getDivergenceStats();
      expect(stats.total).toBe(0);
      expect(stats.diverged).toBe(0);
      expect(stats.rate).toBe(0);
    });

    it('calculates divergence rate correctly', () => {
      // Save 3 comparisons, record outcomes
      saveSettlementComparison(mockComparison);
      saveSettlementComparison({
        ...mockComparison,
        polymarketId: 'poly-456',
        kalshiTicker: 'KALSHI-DEF',
      });
      saveSettlementComparison({
        ...mockComparison,
        polymarketId: 'poly-789',
        kalshiTicker: 'KALSHI-GHI',
      });

      recordSettlementOutcome('poly-123', 'KALSHI-ABC', 'matched');
      recordSettlementOutcome('poly-456', 'KALSHI-DEF', 'matched');
      recordSettlementOutcome('poly-789', 'KALSHI-GHI', 'diverged');

      const stats = getDivergenceStats();
      expect(stats.total).toBe(3);
      expect(stats.diverged).toBe(1);
      expect(stats.rate).toBeCloseTo(0.333, 2);
    });
  });
});
