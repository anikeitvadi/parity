/**
 * Correlated Markets Consistency Detector Tests
 *
 * TDD RED phase: Tests written first, implementation follows
 *
 * @module tests/correlated-markets
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CorrelatedMarketsDetector,
  type CorrelatedOpportunity,
} from '../src/detectors/correlated-markets.js';
import type { Market } from '../src/types/market.js';

/**
 * Helper to create a binary market for testing
 */
function createBinaryMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'test-market-1',
    platform: 'polymarket',
    question: 'Will Trump win the 2024 election?',
    outcomes: ['Yes', 'No'],
    prices: { Yes: 0.55, No: 0.45 },
    closeDate: '2024-11-06T00:00:00Z',
    volume: 1000000,
    liquidity: 50000,
    ...overrides,
  };
}

/**
 * Helper to create a multi-outcome market for testing
 */
function createMultiOutcomeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'test-multi-1',
    platform: 'polymarket',
    question: 'Who will win the 2024 election?',
    outcomes: ['Trump', 'Biden', 'Other'],
    prices: { Trump: 0.40, Biden: 0.35, Other: 0.25 },
    closeDate: '2024-11-06T00:00:00Z',
    volume: 2000000,
    liquidity: 100000,
    ...overrides,
  };
}

describe('CorrelatedMarketsDetector', () => {
  let detector: CorrelatedMarketsDetector;

  beforeEach(() => {
    detector = new CorrelatedMarketsDetector();
  });

  describe('Constructor', () => {
    it('should create detector with default parameters', () => {
      expect(detector).toBeDefined();
    });

    it('should accept custom minEdgePercent', () => {
      const customDetector = new CorrelatedMarketsDetector(5);
      expect(customDetector).toBeDefined();
    });

    it('should accept custom minLiquidity', () => {
      const customDetector = new CorrelatedMarketsDetector(2, 1000);
      expect(customDetector).toBeDefined();
    });
  });

  describe('Binary Market Consistency', () => {
    it('should NOT flag binary market with sum = 100%', () => {
      const market = createBinaryMarket({ prices: { Yes: 0.50, No: 0.50 } });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should NOT flag binary market with sum within tolerance (101%)', () => {
      const market = createBinaryMarket({ prices: { Yes: 0.51, No: 0.50 } });
      const opportunities = detector.detectFromMarkets([market]);

      // 1% edge is below 2% threshold
      expect(opportunities.length).toBe(0);
    });

    it('should flag binary market with sum > 102% (sell both opportunity)', () => {
      const market = createBinaryMarket({ prices: { Yes: 0.55, No: 0.50 } });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('binary_overpriced');
      expect(opportunities[0].edgeSize).toBeCloseTo(5, 1);
    });

    it('should flag binary market with sum < 98% (buy both opportunity)', () => {
      const market = createBinaryMarket({ prices: { Yes: 0.45, No: 0.50 } });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('binary_underpriced');
      expect(opportunities[0].edgeSize).toBeCloseTo(5, 1);
    });

    it('should calculate correct edge size for binary market', () => {
      const market = createBinaryMarket({ prices: { Yes: 0.60, No: 0.47 } });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      // Sum is 107%, edge is 7%
      expect(opportunities[0].edgeSize).toBeCloseTo(7, 1);
    });

    it('should include market reference in opportunity', () => {
      const market = createBinaryMarket({ prices: { Yes: 0.55, No: 0.50 } });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities[0].market).toBeDefined();
      expect(opportunities[0].market.id).toBe('test-market-1');
    });
  });

  describe('Multi-Outcome Market Consistency', () => {
    it('should NOT flag multi-outcome market with sum = 100%', () => {
      const market = createMultiOutcomeMarket({
        prices: { Trump: 0.40, Biden: 0.35, Other: 0.25 },
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should flag multi-outcome market with sum > 102%', () => {
      const market = createMultiOutcomeMarket({
        prices: { Trump: 0.42, Biden: 0.35, Other: 0.31 },
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('multi_overpriced');
      // Sum is 108%, edge is 8%
      expect(opportunities[0].edgeSize).toBeCloseTo(8, 1);
    });

    it('should flag multi-outcome market with sum < 98%', () => {
      const market = createMultiOutcomeMarket({
        prices: { Trump: 0.38, Biden: 0.30, Other: 0.25 },
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('multi_underpriced');
      // Sum is 93%, edge is 7%
      expect(opportunities[0].edgeSize).toBeCloseTo(7, 1);
    });

    it('should handle 5-outcome market correctly', () => {
      const market: Market = {
        id: 'five-outcome',
        platform: 'polymarket',
        question: 'Which candidate will win?',
        outcomes: ['A', 'B', 'C', 'D', 'E'],
        prices: { A: 0.25, B: 0.25, C: 0.20, D: 0.20, E: 0.18 },
        closeDate: '2024-11-06T00:00:00Z',
        volume: 1000000,
        liquidity: 50000,
      };
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('multi_overpriced');
      // Sum is 108%, edge is 8%
      expect(opportunities[0].edgeSize).toBeCloseTo(8, 1);
    });

    it('should NOT flag 5-outcome market with sum = 100%', () => {
      const market: Market = {
        id: 'five-outcome',
        platform: 'polymarket',
        question: 'Which candidate will win?',
        outcomes: ['A', 'B', 'C', 'D', 'E'],
        prices: { A: 0.25, B: 0.25, C: 0.20, D: 0.20, E: 0.10 },
        closeDate: '2024-11-06T00:00:00Z',
        volume: 1000000,
        liquidity: 50000,
      };
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });
  });

  describe('Liquidity Filter', () => {
    it('should NOT flag market below $500 liquidity threshold', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: 400,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should flag market at exactly $500 liquidity', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: 500,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
    });

    it('should flag market above $500 liquidity', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: 10000,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
    });

    it('should use custom liquidity threshold', () => {
      const customDetector = new CorrelatedMarketsDetector(2, 1000);
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: 800,
      });
      const opportunities = customDetector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should handle market with undefined liquidity', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: undefined,
      });
      const opportunities = detector.detectFromMarkets([market]);

      // Should skip markets without liquidity data
      expect(opportunities.length).toBe(0);
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign 0.9-1.0 confidence for >5% edge', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.58, No: 0.50 },
        liquidity: 10000,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].confidence).toBeGreaterThanOrEqual(0.9);
      expect(opportunities[0].confidence).toBeLessThanOrEqual(1.0);
    });

    it('should assign 0.7-0.9 confidence for 2-5% edge', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.52, No: 0.51 },
        liquidity: 10000,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(opportunities[0].confidence).toBeLessThan(0.9);
    });

    it('should scale confidence with edge size', () => {
      const smallEdge = createBinaryMarket({
        id: 'small-edge',
        prices: { Yes: 0.52, No: 0.51 },
        liquidity: 10000,
      });
      const largeEdge = createBinaryMarket({
        id: 'large-edge',
        prices: { Yes: 0.60, No: 0.50 },
        liquidity: 10000,
      });

      const smallOpp = detector.detectFromMarkets([smallEdge]);
      const largeOpp = detector.detectFromMarkets([largeEdge]);

      expect(largeOpp[0].confidence).toBeGreaterThan(smallOpp[0].confidence);
    });
  });

  describe('Edge Cases', () => {
    it('should skip single outcome market', () => {
      const market: Market = {
        id: 'single-outcome',
        platform: 'polymarket',
        question: 'Test?',
        outcomes: ['Yes'],
        prices: { Yes: 0.50 },
        closeDate: '2024-11-06T00:00:00Z',
        liquidity: 10000,
      };
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should skip market with missing price data', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55 }, // Missing No price
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should skip market with zero prices', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0, No: 0 },
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });

    it('should handle empty market array', () => {
      const opportunities = detector.detectFromMarkets([]);

      expect(opportunities).toEqual([]);
    });

    it('should handle null/undefined prices gracefully', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: null as unknown as number },
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(0);
    });
  });

  describe('Opportunity Sorting', () => {
    it('should sort opportunities by edge size descending', () => {
      const markets = [
        createBinaryMarket({
          id: 'small-edge',
          prices: { Yes: 0.52, No: 0.51 },
          liquidity: 10000,
        }),
        createBinaryMarket({
          id: 'large-edge',
          prices: { Yes: 0.60, No: 0.50 },
          liquidity: 10000,
        }),
        createBinaryMarket({
          id: 'medium-edge',
          prices: { Yes: 0.55, No: 0.50 },
          liquidity: 10000,
        }),
      ];

      const opportunities = detector.detectFromMarkets(markets);

      expect(opportunities.length).toBe(3);
      expect(opportunities[0].market.id).toBe('large-edge');
      expect(opportunities[1].market.id).toBe('medium-edge');
      expect(opportunities[2].market.id).toBe('small-edge');
    });
  });

  describe('Opportunity Structure', () => {
    it('should include all required fields', () => {
      const market = createBinaryMarket({
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: 10000,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities.length).toBe(1);
      const opp = opportunities[0];

      expect(opp).toHaveProperty('market');
      expect(opp).toHaveProperty('type');
      expect(opp).toHaveProperty('edgeSize');
      expect(opp).toHaveProperty('confidence');
      expect(opp).toHaveProperty('priceSum');
      expect(opp).toHaveProperty('timestamp');
    });

    it('should include platform in opportunity', () => {
      const market = createBinaryMarket({
        platform: 'kalshi',
        prices: { Yes: 0.55, No: 0.50 },
        liquidity: 10000,
      });
      const opportunities = detector.detectFromMarkets([market]);

      expect(opportunities[0].market.platform).toBe('kalshi');
    });
  });
});

describe('CorrelatedOpportunity Type', () => {
  it('should have correct type values', () => {
    const detector = new CorrelatedMarketsDetector();

    const overpriced = createBinaryMarket({
      id: 'overpriced',
      prices: { Yes: 0.55, No: 0.50 },
      liquidity: 10000,
    });
    const underpriced = createBinaryMarket({
      id: 'underpriced',
      prices: { Yes: 0.45, No: 0.50 },
      liquidity: 10000,
    });

    const opportunities = detector.detectFromMarkets([overpriced, underpriced]);

    const types = opportunities.map((o) => o.type);
    expect(types).toContain('binary_overpriced');
    expect(types).toContain('binary_underpriced');
  });
});
