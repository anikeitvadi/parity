/**
 * Multi-Outcome Arbitrage Detector Tests
 *
 * TDD RED phase: Tests written first, implementation follows
 *
 * Multi-outcome arbitrage occurs when:
 * - BUY ARB: Sum of ask prices < 100% (buy all outcomes for guaranteed profit)
 * - SELL ARB: Sum of bid prices > 100% (sell all outcomes for guaranteed profit)
 *
 * @module tests/multi-outcome-arb
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MultiOutcomeArbDetector,
  type ArbOpportunity,
  type MultiOutcomeMarket,
} from '../src/detectors/multi-outcome-arb.js';
import { initDatabase, closeDatabase } from '../src/database/schema.js';
import { insertSnapshot } from '../src/database/queries.js';

/**
 * Helper to create a multi-outcome market for testing
 */
function createMultiOutcomeMarket(overrides: Partial<MultiOutcomeMarket> = {}): MultiOutcomeMarket {
  return {
    id: 'market-123',
    platform: 'polymarket',
    question: 'Who will win the election?',
    outcomes: ['Candidate A', 'Candidate B', 'Candidate C'],
    askPrices: { 'Candidate A': 0.30, 'Candidate B': 0.25, 'Candidate C': 0.40 },
    bidPrices: { 'Candidate A': 0.28, 'Candidate B': 0.23, 'Candidate C': 0.38 },
    liquidity: { 'Candidate A': 1000, 'Candidate B': 800, 'Candidate C': 1200 },
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Helper to insert a market as a snapshot
 */
function insertMarketSnapshot(market: MultiOutcomeMarket): void {
  insertSnapshot({
    platform: market.platform,
    marketId: market.id,
    timestamp: Math.floor(market.timestamp / 1000),
    data: {
      question: market.question,
      outcomes: market.outcomes,
      askPrices: market.askPrices,
      bidPrices: market.bidPrices,
      liquidity: market.liquidity,
    },
  });
}

describe('MultiOutcomeArbDetector', () => {
  let detector: MultiOutcomeArbDetector;

  beforeEach(() => {
    initDatabase(':memory:');
    detector = new MultiOutcomeArbDetector();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('Constructor Configuration', () => {
    it('should use default values when not specified', () => {
      const det = new MultiOutcomeArbDetector();
      expect(det.minNetEdge).toBe(0.5);
      expect(det.minLiquidityPerOutcome).toBe(500);
      expect(det.feePercent).toBe(2);
    });

    it('should accept custom configuration', () => {
      const det = new MultiOutcomeArbDetector(1.0, 1000, 3);
      expect(det.minNetEdge).toBe(1.0);
      expect(det.minLiquidityPerOutcome).toBe(1000);
      expect(det.feePercent).toBe(3);
    });
  });

  describe('Buy Arbitrage Detection', () => {
    it('should detect buy arb when sum of ask prices < 100%', async () => {
      // 30% + 25% + 40% = 95% total (5% gross edge)
      // Fees: 3 outcomes * 2% = 6%
      // Net edge: 5% - 6% = -1% (negative, should NOT flag with default settings)
      // Need larger edge for test
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });
      // 25% + 25% + 35% = 85% total (15% gross edge)
      // Fees: 3 * 2% = 6%
      // Net edge: 15% - 6% = 9% (positive, should flag)

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('buy');
      expect(opportunities[0].grossEdge).toBeCloseTo(15, 1);
      expect(opportunities[0].netEdge).toBeCloseTo(9, 1);
    });

    it('should calculate buy arb edge correctly for various outcome counts', async () => {
      // 4 outcomes at 20% each = 80% total (20% gross edge)
      // Fees: 4 * 2% = 8%
      // Net edge: 20% - 8% = 12%
      const market = createMultiOutcomeMarket({
        outcomes: ['A', 'B', 'C', 'D'],
        askPrices: { A: 0.20, B: 0.20, C: 0.20, D: 0.20 },
        bidPrices: { A: 0.18, B: 0.18, C: 0.18, D: 0.18 },
        liquidity: { A: 600, B: 600, C: 600, D: 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].grossEdge).toBeCloseTo(20, 1);
      expect(opportunities[0].netEdge).toBeCloseTo(12, 1);
      expect(opportunities[0].outcomeCount).toBe(4);
    });

    it('should return capital required based on outcome count and price', async () => {
      // For buy arb with 3 outcomes at 25%, 25%, 35%:
      // To win $100 from each, you need to buy shares such that
      // each outcome pays out $100 if it wins
      // Capital = sum of ask prices for unit payout
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      // Capital for $100 payout = 25 + 25 + 35 = $85
      expect(opportunities[0].capitalRequired).toBeCloseTo(85, 0);
    });
  });

  describe('Sell Arbitrage Detection', () => {
    it('should detect sell arb when sum of bid prices > 100%', async () => {
      // 35% + 35% + 40% = 110% total (10% gross edge)
      // Fees: 3 * 2% = 6%
      // Net edge: 10% - 6% = 4% (positive, should flag)
      const market = createMultiOutcomeMarket({
        bidPrices: { 'Candidate A': 0.35, 'Candidate B': 0.35, 'Candidate C': 0.40 },
        askPrices: { 'Candidate A': 0.37, 'Candidate B': 0.37, 'Candidate C': 0.42 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('sell');
      expect(opportunities[0].grossEdge).toBeCloseTo(10, 1);
      expect(opportunities[0].netEdge).toBeCloseTo(4, 1);
    });

    it('should calculate sell arb correctly for 4+ outcomes', async () => {
      // 4 outcomes at 28% each = 112% total (12% gross edge)
      // Fees: 4 * 2% = 8%
      // Net edge: 12% - 8% = 4%
      const market = createMultiOutcomeMarket({
        outcomes: ['A', 'B', 'C', 'D'],
        bidPrices: { A: 0.28, B: 0.28, C: 0.28, D: 0.28 },
        askPrices: { A: 0.30, B: 0.30, C: 0.30, D: 0.30 },
        liquidity: { A: 600, B: 600, C: 600, D: 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('sell');
      expect(opportunities[0].grossEdge).toBeCloseTo(12, 1);
      expect(opportunities[0].netEdge).toBeCloseTo(4, 1);
    });
  });

  describe('Fee Adjustment', () => {
    it('should skip opportunities where fees exceed gross edge', async () => {
      // 33% + 33% + 32% = 98% (2% gross edge)
      // Fees: 3 * 2% = 6%
      // Net edge: 2% - 6% = -4% (negative, should skip)
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.33, 'Candidate B': 0.33, 'Candidate C': 0.32 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0);
    });

    it('should apply correct fee calculation: outcomeCount * feePercent', async () => {
      // Test with custom fee percent
      const customDetector = new MultiOutcomeArbDetector(0.5, 500, 1); // 1% fee

      // 3 outcomes at 30% each = 90% (10% gross edge)
      // Fees: 3 * 1% = 3%
      // Net edge: 10% - 3% = 7%
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.30, 'Candidate B': 0.30, 'Candidate C': 0.30 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await customDetector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].netEdge).toBeCloseTo(7, 1);
    });

    it('should only flag if net edge > minNetEdge threshold', async () => {
      // Detector with 5% min edge requirement
      const strictDetector = new MultiOutcomeArbDetector(5.0, 500, 2);

      // 3 outcomes totaling 85% = 15% gross, 9% net after 6% fees
      // Net edge (9%) > minNetEdge (5%) -> should flag
      const goodMarket = createMultiOutcomeMarket({
        id: 'good-market',
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      // 3 outcomes totaling 92% = 8% gross, 2% net after 6% fees
      // Net edge (2%) < minNetEdge (5%) -> should skip
      const badMarket = createMultiOutcomeMarket({
        id: 'bad-market',
        askPrices: { 'Candidate A': 0.30, 'Candidate B': 0.30, 'Candidate C': 0.32 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(goodMarket);
      insertMarketSnapshot(badMarket);

      const opportunities = await strictDetector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].marketId).toBe('good-market');
    });
  });

  describe('Liquidity Validation', () => {
    it('should skip opportunities where any outcome lacks minimum liquidity', async () => {
      // Good edge but one outcome has only $200 liquidity
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 200, 'Candidate C': 600 }, // B is illiquid
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0);
    });

    it('should pass when all outcomes meet minimum liquidity', async () => {
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
    });

    it('should respect custom liquidity threshold', async () => {
      const strictDetector = new MultiOutcomeArbDetector(0.5, 1000, 2);

      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 800, 'Candidate B': 800, 'Candidate C': 800 }, // All below 1000
      });

      insertMarketSnapshot(market);

      const opportunities = await strictDetector.detect('polymarket');

      expect(opportunities.length).toBe(0);
    });

    it('should handle markets with 10+ outcomes checking all liquidity', async () => {
      const outcomes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const askPrices: Record<string, number> = {};
      const bidPrices: Record<string, number> = {};
      const liquidity: Record<string, number> = {};

      outcomes.forEach((o) => {
        askPrices[o] = 0.08; // 10 * 8% = 80% total (20% gross edge)
        bidPrices[o] = 0.07;
        liquidity[o] = 600;
      });

      // Make one outcome illiquid
      liquidity['E'] = 100;

      const market = createMultiOutcomeMarket({
        outcomes,
        askPrices,
        bidPrices,
        liquidity,
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0); // Should skip due to illiquid outcome E
    });
  });

  describe('Binary Market Filtering', () => {
    it('should skip binary markets (2 outcomes) - handled by correlated detector', async () => {
      const binaryMarket = createMultiOutcomeMarket({
        outcomes: ['Yes', 'No'],
        askPrices: { Yes: 0.40, No: 0.45 }, // 85% total, looks like arb
        bidPrices: { Yes: 0.38, No: 0.43 },
        liquidity: { Yes: 1000, No: 1000 },
      });

      insertMarketSnapshot(binaryMarket);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0);
    });

    it('should process markets with exactly 3 outcomes', async () => {
      const market = createMultiOutcomeMarket({
        outcomes: ['A', 'B', 'C'],
        askPrices: { A: 0.25, B: 0.25, C: 0.35 },
        bidPrices: { A: 0.23, B: 0.23, C: 0.33 },
        liquidity: { A: 600, B: 600, C: 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign 0.9-1.0 confidence for high edge (>3% net) with deep liquidity', async () => {
      // 15% gross, 9% net with deep liquidity
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 5000, 'Candidate B': 5000, 'Candidate C': 5000 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].confidence).toBeGreaterThanOrEqual(0.9);
      expect(opportunities[0].confidence).toBeLessThanOrEqual(1.0);
    });

    it('should assign 0.7-0.9 confidence for moderate edge (1-3% net)', async () => {
      // 10% gross, ~4% net (moderate)
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.30, 'Candidate B': 0.30, 'Candidate C': 0.30 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(opportunities[0].confidence).toBeLessThan(0.9);
    });
  });

  describe('ArbOpportunity Structure', () => {
    it('should include all required fields in opportunity', async () => {
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      const opp = opportunities[0];

      expect(opp.marketId).toBe('market-123');
      expect(opp.platform).toBe('polymarket');
      expect(opp.type).toMatch(/^(buy|sell)$/);
      expect(typeof opp.grossEdge).toBe('number');
      expect(typeof opp.netEdge).toBe('number');
      expect(typeof opp.capitalRequired).toBe('number');
      expect(typeof opp.expectedProfit).toBe('number');
      expect(typeof opp.confidence).toBe('number');
      expect(typeof opp.outcomeCount).toBe('number');
      expect(typeof opp.timestamp).toBe('number');
    });

    it('should calculate expected profit correctly', async () => {
      // 15% gross edge, 9% net edge
      // For $100 investment: profit = $100 * 9% = $9
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      // Expected profit for capital of ~$85 to get $100 payout
      // Profit = $100 - $85 = $15 gross, minus fees
      expect(opportunities[0].expectedProfit).toBeGreaterThan(0);
    });
  });

  describe('Sorting and Filtering', () => {
    it('should return opportunities sorted by net edge DESC', async () => {
      // Market 1: 15% gross, 9% net
      const market1 = createMultiOutcomeMarket({
        id: 'high-edge',
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      // Market 2: 10% gross, 4% net
      const market2 = createMultiOutcomeMarket({
        id: 'low-edge',
        askPrices: { 'Candidate A': 0.30, 'Candidate B': 0.30, 'Candidate C': 0.30 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(market1);
      insertMarketSnapshot(market2);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(2);
      expect(opportunities[0].marketId).toBe('high-edge');
      expect(opportunities[1].marketId).toBe('low-edge');
      expect(opportunities[0].netEdge).toBeGreaterThan(opportunities[1].netEdge);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array when no snapshots exist', async () => {
      const opportunities = await detector.detect('polymarket');
      expect(opportunities).toEqual([]);
    });

    it('should handle market with missing liquidity data gracefully', async () => {
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: {}, // Missing liquidity
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0); // Should skip due to missing liquidity
    });

    it('should handle market with partial liquidity data', async () => {
      const market = createMultiOutcomeMarket({
        outcomes: ['A', 'B', 'C'],
        askPrices: { A: 0.25, B: 0.25, C: 0.35 },
        liquidity: { A: 600, B: 600 }, // Missing C
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0); // Should skip
    });

    it('should use snapshot timestamp for opportunity timestamp', async () => {
      const snapshotTime = Date.now() - 60000; // 1 minute ago
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
        timestamp: snapshotTime,
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(1);
      // Timestamp should be in seconds (from DB)
      expect(opportunities[0].timestamp).toBe(Math.floor(snapshotTime / 1000));
    });

    it('should filter out stale snapshots (older than 30 minutes)', async () => {
      const oldTime = Date.now() - 35 * 60 * 1000; // 35 minutes ago
      const market = createMultiOutcomeMarket({
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
        timestamp: oldTime,
      });

      insertMarketSnapshot(market);

      const opportunities = await detector.detect('polymarket');

      expect(opportunities.length).toBe(0);
    });
  });

  describe('Platform Filtering', () => {
    it('should only detect opportunities for specified platform', async () => {
      const polyMarket = createMultiOutcomeMarket({
        id: 'poly-market',
        platform: 'polymarket',
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      const kalshiMarket = createMultiOutcomeMarket({
        id: 'kalshi-market',
        platform: 'kalshi',
        askPrices: { 'Candidate A': 0.25, 'Candidate B': 0.25, 'Candidate C': 0.35 },
        liquidity: { 'Candidate A': 600, 'Candidate B': 600, 'Candidate C': 600 },
      });

      insertMarketSnapshot(polyMarket);
      insertMarketSnapshot(kalshiMarket);

      const polyOpportunities = await detector.detect('polymarket');
      const kalshiOpportunities = await detector.detect('kalshi');

      expect(polyOpportunities.length).toBe(1);
      expect(polyOpportunities[0].platform).toBe('polymarket');
      expect(kalshiOpportunities.length).toBe(1);
      expect(kalshiOpportunities[0].platform).toBe('kalshi');
    });
  });
});

describe('MultiOutcomeArbDetector Integration', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should handle realistic multi-outcome market scenario', async () => {
    const detector = new MultiOutcomeArbDetector(0.5, 500, 2);

    // Realistic scenario: 5-way presidential race
    const presidentialMarket = createMultiOutcomeMarket({
      id: 'pres-2028-5way',
      platform: 'polymarket',
      question: 'Who will win the 2028 Presidential Election?',
      outcomes: ['Trump Jr', 'Newsom', 'DeSantis', 'Harris', 'Other'],
      askPrices: {
        'Trump Jr': 0.22,
        Newsom: 0.20,
        DeSantis: 0.18,
        Harris: 0.15,
        Other: 0.10,
      }, // 85% total
      bidPrices: {
        'Trump Jr': 0.20,
        Newsom: 0.18,
        DeSantis: 0.16,
        Harris: 0.13,
        Other: 0.08,
      },
      liquidity: {
        'Trump Jr': 10000,
        Newsom: 8000,
        DeSantis: 7000,
        Harris: 5000,
        Other: 3000,
      },
    });

    insertMarketSnapshot(presidentialMarket);

    const opportunities = await detector.detect('polymarket');

    expect(opportunities.length).toBe(1);
    expect(opportunities[0].type).toBe('buy');
    // 15% gross - 10% fees (5 outcomes * 2%) = 5% net
    expect(opportunities[0].grossEdge).toBeCloseTo(15, 1);
    expect(opportunities[0].netEdge).toBeCloseTo(5, 1);
    expect(opportunities[0].outcomeCount).toBe(5);
  });

  it('should detect sell arb in realistic scenario', async () => {
    const detector = new MultiOutcomeArbDetector(0.5, 500, 2);

    // Sell arb scenario: bid prices sum > 100%
    const market = createMultiOutcomeMarket({
      id: 'sell-arb-market',
      platform: 'kalshi',
      question: 'Which party will win Senate?',
      outcomes: ['Democrat', 'Republican', 'Other'],
      bidPrices: { Democrat: 0.40, Republican: 0.45, Other: 0.25 }, // 110% total
      askPrices: { Democrat: 0.42, Republican: 0.47, Other: 0.27 },
      liquidity: { Democrat: 5000, Republican: 5000, Other: 2000 },
    });

    insertMarketSnapshot(market);

    const opportunities = await detector.detect('kalshi');

    expect(opportunities.length).toBe(1);
    expect(opportunities[0].type).toBe('sell');
    // 10% gross - 6% fees = 4% net
    expect(opportunities[0].grossEdge).toBeCloseTo(10, 1);
    expect(opportunities[0].netEdge).toBeCloseTo(4, 1);
  });
});
