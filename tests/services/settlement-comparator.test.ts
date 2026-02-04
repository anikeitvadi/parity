/**
 * Settlement Comparator Service Tests
 *
 * TDD test suite for cross-platform settlement rule comparison.
 * Tests multi-level similarity scoring, risk factor detection, and safety determination.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettlementComparator } from '../../src/services/settlement-comparator.js';
import type { SettlementCriteria } from '../../src/types/settlement.js';
import * as queries from '../../src/database/queries.js';

// Mock database queries
vi.mock('../../src/database/queries.js', () => ({
  getSettlementComparison: vi.fn(),
}));

describe('SettlementComparator', () => {
  let comparator: SettlementComparator;

  beforeEach(() => {
    comparator = new SettlementComparator();
    vi.clearAllMocks();
  });

  // Helper to create test settlement criteria
  const createCriteria = (overrides: Partial<SettlementCriteria> = {}): SettlementCriteria => ({
    platform: 'polymarket',
    marketId: 'test-market',
    question: 'Will Bitcoin reach $100k by end of 2026?',
    primaryRule: 'Resolves YES if Bitcoin (BTC) closes above $100,000 on December 31, 2026 according to CoinMarketCap.',
    outcomes: ['Yes', 'No'],
    resolutionDate: new Date('2026-12-31'),
    dataSource: 'CoinMarketCap',
    settlementType: 'binary',
    extracted: {
      dates: [],
      keywords: [],
      entities: [],
    },
    ...overrides,
  });

  describe('Similarity Scoring', () => {
    it('should return perfect similarity for identical markets', () => {
      const poly = createCriteria({ platform: 'polymarket', marketId: 'pm-123' });
      const kalshi = createCriteria({ platform: 'kalshi', marketId: 'KX-456' });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.question).toBeCloseTo(1.0, 5);
      expect(result.similarity.criteria).toBeCloseTo(1.0, 5);
      expect(result.similarity.timing).toBeCloseTo(1.0, 5);
      expect(result.similarity.dataSource).toBeCloseTo(1.0, 5);
      expect(result.similarity.overall).toBeCloseTo(1.0, 5);
    });

    it('should calculate lower similarity for different questions', () => {
      const poly = createCriteria({
        question: 'Will Bitcoin reach $100k by end of 2026?',
      });
      const kalshi = createCriteria({
        platform: 'kalshi',
        question: 'Will Ethereum reach $10k by end of 2026?',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.question).toBeLessThan(0.8);
      expect(result.similarity.question).toBeGreaterThan(0.3); // Some word overlap
    });

    it('should calculate lower similarity for different criteria', () => {
      const poly = createCriteria({
        primaryRule: 'Resolves YES if Bitcoin closes above $100,000 according to CoinMarketCap.',
      });
      const kalshi = createCriteria({
        platform: 'kalshi',
        primaryRule: 'Resolves YES if Bitcoin average price exceeds $100,000 according to Coinbase.',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.criteria).toBeLessThan(0.9);
      expect(result.similarity.criteria).toBeGreaterThan(0.5); // Some overlap
    });

    it('should score timing perfectly when dates match', () => {
      const poly = createCriteria({ resolutionDate: new Date('2026-12-31') });
      const kalshi = createCriteria({
        platform: 'kalshi',
        resolutionDate: new Date('2026-12-31'),
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.timing).toBe(1.0);
    });

    it('should score timing lower when dates differ by 7 days', () => {
      const poly = createCriteria({ resolutionDate: new Date('2026-12-31') });
      const kalshi = createCriteria({
        platform: 'kalshi',
        resolutionDate: new Date('2027-01-07'), // 7 days later
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.timing).toBe(0.5); // 1 - 7/14 = 0.5
    });

    it('should score timing 0 when dates differ by 14+ days', () => {
      const poly = createCriteria({ resolutionDate: new Date('2026-12-31') });
      const kalshi = createCriteria({
        platform: 'kalshi',
        resolutionDate: new Date('2027-01-15'), // 15 days later
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.timing).toBe(0);
    });

    it('should score timing 0 when one date is missing', () => {
      const poly = createCriteria({ resolutionDate: new Date('2026-12-31') });
      const kalshi = createCriteria({
        platform: 'kalshi',
        resolutionDate: undefined,
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.timing).toBe(0);
    });

    it('should score data sources when they match', () => {
      const poly = createCriteria({ dataSource: 'CoinMarketCap' });
      const kalshi = createCriteria({
        platform: 'kalshi',
        dataSource: 'CoinMarketCap',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.dataSource).toBe(1.0);
    });

    it('should score data sources lower when different', () => {
      const poly = createCriteria({ dataSource: 'CoinMarketCap' });
      const kalshi = createCriteria({
        platform: 'kalshi',
        dataSource: 'Coinbase',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.dataSource).toBeLessThan(0.8);
    });

    it('should use weighted average for overall similarity', () => {
      const poly = createCriteria({
        question: 'Test question',
        primaryRule: 'Test rule',
        resolutionDate: new Date('2026-12-31'),
        dataSource: 'TestSource',
      });
      const kalshi = createCriteria({
        platform: 'kalshi',
        question: 'Test question',
        primaryRule: 'Test rule',
        resolutionDate: new Date('2026-12-31'),
        dataSource: 'TestSource',
      });

      const result = comparator.compare(poly, kalshi);

      // Weights: question(0.3) + criteria(0.4) + timing(0.2) + source(0.1)
      const expectedOverall =
        result.similarity.question * 0.3 +
        result.similarity.criteria * 0.4 +
        result.similarity.timing * 0.2 +
        result.similarity.dataSource * 0.1;

      expect(result.similarity.overall).toBeCloseTo(expectedOverall, 5);
    });
  });

  describe('Risk Factor Detection', () => {
    it('should flag missing resolution date', () => {
      const poly = createCriteria({ resolutionDate: undefined });
      const kalshi = createCriteria({ platform: 'kalshi' });

      const result = comparator.compare(poly, kalshi);

      expect(result.riskFactors).toContain('Missing resolution date');
    });

    it('should flag dates differing by more than 7 days', () => {
      const poly = createCriteria({ resolutionDate: new Date('2026-12-31') });
      const kalshi = createCriteria({
        platform: 'kalshi',
        resolutionDate: new Date('2027-01-10'), // 10 days later
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.riskFactors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Resolution dates differ by 10 days/)
        ])
      );
    });

    it('should flag different data sources', () => {
      const poly = createCriteria({ dataSource: 'CoinMarketCap' });
      const kalshi = createCriteria({
        platform: 'kalshi',
        dataSource: 'Coinbase',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.riskFactors).toContain('Different data sources');
    });

    it('should flag subjective criteria keywords', () => {
      const poly = createCriteria({
        primaryRule: 'Resolves based on reasonable interpretation of mainstream consensus.',
      });
      const kalshi = createCriteria({ platform: 'kalshi' });

      const result = comparator.compare(poly, kalshi);

      expect(result.riskFactors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Subjective criteria detected: reasonable/)
        ])
      );
    });

    it('should detect multiple subjective keywords', () => {
      const poly = createCriteria({
        primaryRule: 'Resolves based on general consensus or reasonable interpretation.',
      });
      const kalshi = createCriteria({ platform: 'kalshi' });

      const result = comparator.compare(poly, kalshi);

      // Should detect multiple keywords (order may vary)
      expect(result.riskFactors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Subjective criteria detected:.*reasonable/)
        ])
      );
      expect(result.riskFactors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Subjective criteria detected:.*consensus/)
        ])
      );
      expect(result.riskFactors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Subjective criteria detected:.*general/)
        ])
      );
    });

    it('should return empty risk factors for safe comparison', () => {
      const poly = createCriteria();
      const kalshi = createCriteria({ platform: 'kalshi' });

      const result = comparator.compare(poly, kalshi);

      expect(result.riskFactors).toEqual([]);
    });
  });

  describe('Safety Determination', () => {
    it('should mark as safe when all thresholds met', () => {
      const poly = createCriteria();
      const kalshi = createCriteria({ platform: 'kalshi' });

      const result = comparator.compare(poly, kalshi);

      // overall >= 0.9, criteria >= 0.7, timing >= 0.5, no risk factors
      expect(result.similarity.overall).toBeGreaterThanOrEqual(0.9);
      expect(result.similarity.criteria).toBeGreaterThanOrEqual(0.7);
      expect(result.similarity.timing).toBeGreaterThanOrEqual(0.5);
      expect(result.riskFactors).toEqual([]);
      expect(result.safeForArbitrage).toBe(true);
    });

    it('should mark as unsafe when overall < 0.9', () => {
      const poly = createCriteria({
        question: 'Will Bitcoin reach $100k?',
        primaryRule: 'Simple rule',
      });
      const kalshi = createCriteria({
        platform: 'kalshi',
        question: 'Will Ethereum reach $10k?', // Very different question
        primaryRule: 'Different rule entirely',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.overall).toBeLessThan(0.9);
      expect(result.safeForArbitrage).toBe(false);
    });

    it('should mark as unsafe when criteria < 0.7', () => {
      const poly = createCriteria({
        primaryRule: 'Resolves YES if Bitcoin closes above $100,000 according to CoinMarketCap.',
      });
      const kalshi = createCriteria({
        platform: 'kalshi',
        primaryRule: 'Completely different criteria here with no overlap at all.',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.criteria).toBeLessThan(0.7);
      expect(result.safeForArbitrage).toBe(false);
    });

    it('should mark as unsafe when timing < 0.5', () => {
      const poly = createCriteria({ resolutionDate: new Date('2026-12-31') });
      const kalshi = createCriteria({
        platform: 'kalshi',
        resolutionDate: new Date('2027-01-10'), // 10 days later, timing will be < 0.5
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.similarity.timing).toBeLessThan(0.5);
      expect(result.safeForArbitrage).toBe(false);
    });

    it('should mark as unsafe when risk factors present', () => {
      const poly = createCriteria({
        primaryRule: 'Resolves based on reasonable consensus interpretation.',
      });
      const kalshi = createCriteria({ platform: 'kalshi' });

      const result = comparator.compare(poly, kalshi);

      expect(result.riskFactors.length).toBeGreaterThan(0);
      expect(result.safeForArbitrage).toBe(false);
    });
  });

  describe('Manual Override', () => {
    it('should mark as unsafe when manual_override is unsafe', () => {
      const poly = createCriteria({ marketId: 'pm-123' });
      const kalshi = createCriteria({ platform: 'kalshi', marketId: 'kx-456' });

      // Mock database returning unsafe override
      vi.mocked(queries.getSettlementComparison).mockReturnValue({
        polymarketId: 'pm-123',
        kalshiTicker: 'kx-456',
        similarity: { question: 1, criteria: 1, timing: 1, dataSource: 1, overall: 1 },
        safeForArbitrage: false,
        riskFactors: [],
        manualOverride: 'unsafe',
        comparedAt: new Date(),
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.manualOverride).toBe('unsafe');
      expect(result.safeForArbitrage).toBe(false);
    });

    it('should mark as safe when manual_override is safe', () => {
      const poly = createCriteria({
        marketId: 'pm-123',
        question: 'Different question',
      });
      const kalshi = createCriteria({
        platform: 'kalshi',
        marketId: 'kx-456',
        question: 'Very different question',
      });

      // Mock database returning safe override
      vi.mocked(queries.getSettlementComparison).mockReturnValue({
        polymarketId: 'pm-123',
        kalshiTicker: 'kx-456',
        similarity: { question: 0.3, criteria: 0.4, timing: 0.5, dataSource: 0.6, overall: 0.5 },
        safeForArbitrage: true,
        riskFactors: ['Some risk'],
        manualOverride: 'safe',
        comparedAt: new Date(),
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.manualOverride).toBe('safe');
      expect(result.safeForArbitrage).toBe(true);
    });

    it('should use calculated safety when no manual override', () => {
      const poly = createCriteria({ marketId: 'pm-123' });
      const kalshi = createCriteria({ platform: 'kalshi', marketId: 'kx-456' });

      // Mock database returning null (no override)
      vi.mocked(queries.getSettlementComparison).mockReturnValue(null);

      const result = comparator.compare(poly, kalshi);

      expect(result.manualOverride).toBeUndefined();
      // Should use calculated safety (identical markets = safe)
      expect(result.safeForArbitrage).toBe(true);
    });
  });

  describe('Result Structure', () => {
    it('should return complete SettlementComparison structure', () => {
      const poly = createCriteria({ marketId: 'pm-123' });
      const kalshi = createCriteria({ platform: 'kalshi', marketId: 'kx-456' });

      const result = comparator.compare(poly, kalshi);

      expect(result).toMatchObject({
        polymarketId: 'pm-123',
        kalshiTicker: 'kx-456',
        similarity: expect.objectContaining({
          question: expect.any(Number),
          criteria: expect.any(Number),
          timing: expect.any(Number),
          dataSource: expect.any(Number),
          overall: expect.any(Number),
        }),
        safeForArbitrage: expect.any(Boolean),
        riskFactors: expect.any(Array),
        comparedAt: expect.any(Date),
      });
    });

    it('should populate market IDs correctly', () => {
      const poly = createCriteria({ marketId: 'polymarket-abc' });
      const kalshi = createCriteria({
        platform: 'kalshi',
        marketId: 'KALSHI-XYZ',
      });

      const result = comparator.compare(poly, kalshi);

      expect(result.polymarketId).toBe('polymarket-abc');
      expect(result.kalshiTicker).toBe('KALSHI-XYZ');
    });
  });
});
