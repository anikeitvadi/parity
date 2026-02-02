/**
 * Scoring Engine Tests
 *
 * TDD tests for the scoring engine following requirements:
 * - RATE-01: Composite scoring 1-10 scale
 * - RATE-02: Edge size factor (35% weight)
 * - RATE-03: Confidence factor (25% weight)
 * - RATE-04: Liquidity factor (20% weight)
 * - RATE-05: Time to resolution factor (10% weight)
 * - RATE-06: Fee-adjusted profit factor (10% weight), $0.05 min threshold
 *
 * @module tests/scoring
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedOpportunity,
  ScoredOpportunity,
  ScoringWeights,
  ScoreBreakdown,
} from '../src/scoring/types.js';
import { calculateEdgeScore } from '../src/scoring/factors/edge-factor.js';
import { calculateConfidenceScore } from '../src/scoring/factors/confidence-factor.js';
import { calculateLiquidityScore } from '../src/scoring/factors/liquidity-factor.js';
import { calculateTimeScore } from '../src/scoring/factors/time-factor.js';
import { calculateProfitScore } from '../src/scoring/factors/fee-factor.js';
import {
  CompositeScorer,
  scoreOpportunity,
  DEFAULT_WEIGHTS,
  meetsMinimumThreshold,
} from '../src/scoring/composite-scorer.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestOpportunity(overrides: Partial<UnifiedOpportunity> = {}): UnifiedOpportunity {
  return {
    id: 'test-opp-1',
    type: 'multi_outcome',
    platform: 'polymarket',
    marketId: 'market-123',
    marketQuestion: 'Will X happen by Y date?',
    grossEdge: 0.12, // 12% gross
    netEdge: 0.10, // 10% net
    detectorConfidence: 0.85,
    minLiquidity: 5000,
    liquidityDepth: 3,
    detectedAt: Date.now(),
    closeDate: undefined,
    raw: {},
    ...overrides,
  };
}

// =============================================================================
// Edge Factor Tests (RATE-02)
// =============================================================================

describe('Edge Factor (RATE-02)', () => {
  it('should return 1-2 for net edge < 5%', () => {
    const score = calculateEdgeScore(0.03); // 3% net edge
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThanOrEqual(2);
  });

  it('should return 3-4 for net edge 5-7% (marginal)', () => {
    const score5 = calculateEdgeScore(0.05);
    const score6 = calculateEdgeScore(0.06);
    const score7 = calculateEdgeScore(0.069);

    expect(score5).toBeGreaterThanOrEqual(3);
    expect(score5).toBeLessThanOrEqual(4);
    expect(score6).toBeGreaterThanOrEqual(3);
    expect(score7).toBeLessThanOrEqual(4);
  });

  it('should return 5-6 for net edge 7-10% (decent)', () => {
    const score = calculateEdgeScore(0.08);
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(6);
  });

  it('should return 7-8 for net edge 10-15% (good)', () => {
    const score = calculateEdgeScore(0.12);
    expect(score).toBeGreaterThanOrEqual(7);
    expect(score).toBeLessThanOrEqual(8);
  });

  it('should return 9 for net edge 15-20% (excellent)', () => {
    const score = calculateEdgeScore(0.17);
    expect(score).toBe(9);
  });

  it('should return 10 for net edge > 20% (exceptional)', () => {
    const score = calculateEdgeScore(0.25);
    expect(score).toBe(10);
  });

  it('should handle zero edge', () => {
    const score = calculateEdgeScore(0);
    expect(score).toBe(1);
  });

  it('should handle negative edge', () => {
    const score = calculateEdgeScore(-0.05);
    expect(score).toBe(1);
  });

  it('should be a pure function (same input = same output)', () => {
    const score1 = calculateEdgeScore(0.10);
    const score2 = calculateEdgeScore(0.10);
    expect(score1).toBe(score2);
  });
});

// =============================================================================
// Confidence Factor Tests (RATE-03)
// =============================================================================

describe('Confidence Factor (RATE-03)', () => {
  it('should return detector confidence * 10 for single-platform', () => {
    const score = calculateConfidenceScore(0.9); // 90% confidence
    expect(score).toBe(9);
  });

  it('should return (detector * match) * 10 for cross-platform', () => {
    const score = calculateConfidenceScore(0.8, 0.9); // 80% detector, 90% match
    expect(score).toBeCloseTo(7.2, 1); // 0.8 * 0.9 * 10 = 7.2
  });

  it('should handle zero confidence', () => {
    const score = calculateConfidenceScore(0);
    expect(score).toBe(0);
  });

  it('should handle max confidence', () => {
    const score = calculateConfidenceScore(1.0);
    expect(score).toBe(10);
  });

  it('should handle confidence > 1 by capping at 10', () => {
    const score = calculateConfidenceScore(1.1);
    expect(score).toBeLessThanOrEqual(10);
  });

  it('should be a pure function', () => {
    const score1 = calculateConfidenceScore(0.85);
    const score2 = calculateConfidenceScore(0.85);
    expect(score1).toBe(score2);
  });
});

// =============================================================================
// Liquidity Factor Tests (RATE-04)
// =============================================================================

describe('Liquidity Factor (RATE-04)', () => {
  it('should return 0 for liquidity < $500', () => {
    const score = calculateLiquidityScore(400);
    expect(score).toBe(0);
  });

  it('should return 3 for liquidity $500-1000', () => {
    const score500 = calculateLiquidityScore(500);
    const score999 = calculateLiquidityScore(999);
    expect(score500).toBe(3);
    expect(score999).toBe(3);
  });

  it('should return 5 for liquidity $1000-5000', () => {
    const score1000 = calculateLiquidityScore(1000);
    const score4999 = calculateLiquidityScore(4999);
    expect(score1000).toBe(5);
    expect(score4999).toBe(5);
  });

  it('should return 7 for liquidity $5000-10000', () => {
    const score = calculateLiquidityScore(7500);
    expect(score).toBe(7);
  });

  it('should return 9 for liquidity $10000-50000', () => {
    const score = calculateLiquidityScore(25000);
    expect(score).toBe(9);
  });

  it('should return 10 for liquidity > $50000', () => {
    const score = calculateLiquidityScore(100000);
    expect(score).toBe(10);
  });

  it('should handle zero liquidity', () => {
    const score = calculateLiquidityScore(0);
    expect(score).toBe(0);
  });

  it('should handle negative liquidity', () => {
    const score = calculateLiquidityScore(-100);
    expect(score).toBe(0);
  });

  it('should be a pure function', () => {
    const score1 = calculateLiquidityScore(5000);
    const score2 = calculateLiquidityScore(5000);
    expect(score1).toBe(score2);
  });
});

// =============================================================================
// Time Factor Tests (RATE-05)
// =============================================================================

describe('Time Factor (RATE-05)', () => {
  const now = Date.now();
  const hoursMs = (h: number) => h * 60 * 60 * 1000;
  const daysMs = (d: number) => d * 24 * 60 * 60 * 1000;

  it('should return 10 for close date < 1 day (urgent)', () => {
    const closeDate = new Date(now + hoursMs(12)).toISOString();
    const score = calculateTimeScore(closeDate, now);
    expect(score).toBe(10);
  });

  it('should return 8 for close date 1-3 days', () => {
    const closeDate = new Date(now + daysMs(2)).toISOString();
    const score = calculateTimeScore(closeDate, now);
    expect(score).toBe(8);
  });

  it('should return 6 for close date 3-7 days', () => {
    const closeDate = new Date(now + daysMs(5)).toISOString();
    const score = calculateTimeScore(closeDate, now);
    expect(score).toBe(6);
  });

  it('should return 4 for close date 7-30 days', () => {
    const closeDate = new Date(now + daysMs(14)).toISOString();
    const score = calculateTimeScore(closeDate, now);
    expect(score).toBe(4);
  });

  it('should return 2 for close date > 30 days (long-term)', () => {
    const closeDate = new Date(now + daysMs(60)).toISOString();
    const score = calculateTimeScore(closeDate, now);
    expect(score).toBe(2);
  });

  it('should return 5 for missing close date (neutral)', () => {
    const score = calculateTimeScore(undefined, now);
    expect(score).toBe(5);
  });

  it('should return 5 for null close date (neutral)', () => {
    const score = calculateTimeScore(null as unknown as string | undefined, now);
    expect(score).toBe(5);
  });

  it('should handle past close dates (already closed)', () => {
    const closeDate = new Date(now - daysMs(1)).toISOString();
    const score = calculateTimeScore(closeDate, now);
    // Past dates should return 10 (most urgent - act now or never)
    expect(score).toBe(10);
  });

  it('should be a pure function', () => {
    const closeDate = new Date(now + daysMs(5)).toISOString();
    const score1 = calculateTimeScore(closeDate, now);
    const score2 = calculateTimeScore(closeDate, now);
    expect(score1).toBe(score2);
  });
});

// =============================================================================
// Fee-Adjusted Profit Factor Tests (RATE-06)
// =============================================================================

describe('Fee-Adjusted Profit Factor (RATE-06)', () => {
  it('should calculate score as min(netEdge * 100, 10)', () => {
    // 10% net edge = score of 10 (capped)
    expect(calculateProfitScore(0.10)).toBe(10);

    // 5% net edge = score of 5
    expect(calculateProfitScore(0.05)).toBe(5);

    // 15% net edge = score of 10 (capped)
    expect(calculateProfitScore(0.15)).toBe(10);
  });

  it('should return 0 for zero net edge', () => {
    expect(calculateProfitScore(0)).toBe(0);
  });

  it('should return 0 for negative net edge', () => {
    expect(calculateProfitScore(-0.05)).toBe(0);
  });

  it('should cap at 10', () => {
    expect(calculateProfitScore(0.25)).toBe(10);
    expect(calculateProfitScore(1.0)).toBe(10);
  });

  it('should be a pure function', () => {
    const score1 = calculateProfitScore(0.08);
    const score2 = calculateProfitScore(0.08);
    expect(score1).toBe(score2);
  });
});

// =============================================================================
// Minimum Threshold Tests (RATE-06)
// =============================================================================

describe('Minimum Threshold Enforcement (RATE-06)', () => {
  it('should return false for net edge < 5% ($0.05 on $100)', () => {
    // $0.05 min profit on $100 trade = 5% net edge minimum
    const opp = createTestOpportunity({ netEdge: 0.03 }); // 3% < 5%
    expect(meetsMinimumThreshold(opp)).toBe(false);
  });

  it('should return true for net edge >= 5%', () => {
    const opp5 = createTestOpportunity({ netEdge: 0.05 }); // exactly 5%
    const opp10 = createTestOpportunity({ netEdge: 0.10 }); // 10%
    expect(meetsMinimumThreshold(opp5)).toBe(true);
    expect(meetsMinimumThreshold(opp10)).toBe(true);
  });

  it('should handle edge case at exactly 5%', () => {
    const opp = createTestOpportunity({ netEdge: 0.05 });
    expect(meetsMinimumThreshold(opp)).toBe(true);
  });

  it('should handle zero net edge', () => {
    const opp = createTestOpportunity({ netEdge: 0 });
    expect(meetsMinimumThreshold(opp)).toBe(false);
  });

  it('should handle negative net edge', () => {
    const opp = createTestOpportunity({ netEdge: -0.02 });
    expect(meetsMinimumThreshold(opp)).toBe(false);
  });
});

// =============================================================================
// Composite Scoring Tests (RATE-01)
// =============================================================================

describe('Composite Scorer (RATE-01)', () => {
  describe('Default Weights', () => {
    it('should have weights that sum to 1.0', () => {
      const sum =
        DEFAULT_WEIGHTS.edgeSize +
        DEFAULT_WEIGHTS.confidence +
        DEFAULT_WEIGHTS.liquidity +
        DEFAULT_WEIGHTS.timeToResolution +
        DEFAULT_WEIGHTS.feeAdjustedProfit;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have correct default values', () => {
      expect(DEFAULT_WEIGHTS.edgeSize).toBe(0.35);
      expect(DEFAULT_WEIGHTS.confidence).toBe(0.25);
      expect(DEFAULT_WEIGHTS.liquidity).toBe(0.20);
      expect(DEFAULT_WEIGHTS.timeToResolution).toBe(0.10);
      expect(DEFAULT_WEIGHTS.feeAdjustedProfit).toBe(0.10);
    });
  });

  describe('scoreOpportunity function', () => {
    it('should return null for opportunities below threshold', () => {
      const opp = createTestOpportunity({ netEdge: 0.03 }); // 3% < 5%
      const result = scoreOpportunity(opp);
      expect(result).toBeNull();
    });

    it('should return ScoredOpportunity for valid opportunities', () => {
      const opp = createTestOpportunity({ netEdge: 0.10 }); // 10% > 5%
      const result = scoreOpportunity(opp);
      expect(result).not.toBeNull();
      expect(result?.score).toBeGreaterThanOrEqual(1);
      expect(result?.score).toBeLessThanOrEqual(10);
    });

    it('should include score breakdown', () => {
      const opp = createTestOpportunity({ netEdge: 0.10 });
      const result = scoreOpportunity(opp);
      expect(result?.scoreBreakdown).toBeDefined();
      expect(result?.scoreBreakdown.edgeScore).toBeDefined();
      expect(result?.scoreBreakdown.confidenceScore).toBeDefined();
      expect(result?.scoreBreakdown.liquidityScore).toBeDefined();
      expect(result?.scoreBreakdown.timeScore).toBeDefined();
      expect(result?.scoreBreakdown.profitScore).toBeDefined();
      expect(result?.scoreBreakdown.weights).toBeDefined();
    });

    it('should calculate weighted average correctly', () => {
      // Create an opportunity with known values to verify calculation
      const opp = createTestOpportunity({
        netEdge: 0.10, // 10% -> edge score ~7-8
        detectorConfidence: 1.0, // 100% -> confidence score 10
        minLiquidity: 50001, // > $50k -> liquidity score 10
      });
      // No close date -> time score 5
      const result = scoreOpportunity(opp);

      // Manual calculation with default weights:
      // edgeScore (7-8) * 0.35 + 10 * 0.25 + 10 * 0.20 + 5 * 0.10 + 10 * 0.10
      // = 2.8 + 2.5 + 2.0 + 0.5 + 1.0 = 8.8 (approximately)
      expect(result?.score).toBeGreaterThan(7);
      expect(result?.score).toBeLessThan(10);
    });
  });

  describe('CompositeScorer class', () => {
    let scorer: CompositeScorer;

    beforeEach(() => {
      scorer = new CompositeScorer();
    });

    it('should score with default weights', () => {
      const opp = createTestOpportunity({ netEdge: 0.10 });
      const result = scorer.score(opp);
      expect(result).not.toBeNull();
    });

    it('should accept custom weights', () => {
      const customWeights: ScoringWeights = {
        edgeSize: 0.50, // More weight on edge
        confidence: 0.20,
        liquidity: 0.15,
        timeToResolution: 0.10,
        feeAdjustedProfit: 0.05,
      };
      const customScorer = new CompositeScorer(customWeights);

      const opp = createTestOpportunity({ netEdge: 0.10 });
      const defaultResult = scorer.score(opp);
      const customResult = customScorer.score(opp);

      // Results should be different with different weights
      expect(defaultResult?.score).not.toBe(customResult?.score);
    });

    it('should handle cross-platform opportunities with match confidence', () => {
      const opp = createTestOpportunity({
        type: 'cross_platform',
        platform: 'cross',
        detectorConfidence: 0.9,
        matchConfidence: 0.8,
        netEdge: 0.10,
      });
      const result = scorer.score(opp);
      expect(result).not.toBeNull();
      // Confidence score should be 0.9 * 0.8 * 10 = 7.2
      expect(result?.scoreBreakdown.confidenceScore).toBeCloseTo(7.2, 1);
    });

    it('should handle opportunities with close dates', () => {
      const now = Date.now();
      const closeDate = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days
      const opp = createTestOpportunity({ closeDate, netEdge: 0.10 });
      const result = scorer.score(opp);
      expect(result).not.toBeNull();
      expect(result?.scoreBreakdown.timeScore).toBe(8); // 1-3 days = 8
    });

    it('should preserve all original opportunity fields', () => {
      const opp = createTestOpportunity({
        id: 'preserve-test',
        marketQuestion: 'Test question',
        netEdge: 0.10,
      });
      const result = scorer.score(opp);
      expect(result?.id).toBe('preserve-test');
      expect(result?.marketQuestion).toBe('Test question');
    });
  });

  describe('Example scenarios from plan', () => {
    it('12% edge, 0.9 confidence, $5K liquidity, 3 days: ~7.5 score', () => {
      const now = Date.now();
      const closeDate = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
      const opp = createTestOpportunity({
        netEdge: 0.12, // 12%
        detectorConfidence: 0.9,
        minLiquidity: 5000,
        closeDate,
      });
      const result = scoreOpportunity(opp);
      expect(result).not.toBeNull();
      // Score should be approximately 7.5 (within 1.5)
      expect(result?.score).toBeGreaterThan(6);
      expect(result?.score).toBeLessThan(9);
    });

    it('6% edge, 0.8 confidence, $2K liquidity, 14 days: ~4.5 score', () => {
      const now = Date.now();
      const closeDate = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
      const opp = createTestOpportunity({
        netEdge: 0.06, // 6%
        detectorConfidence: 0.8,
        minLiquidity: 2000,
        closeDate,
      });
      const result = scoreOpportunity(opp);
      expect(result).not.toBeNull();
      // Score should be approximately 4.5 (within 1.5)
      expect(result?.score).toBeGreaterThan(3);
      expect(result?.score).toBeLessThan(6);
    });

    it('3% edge (below threshold): returns null', () => {
      const opp = createTestOpportunity({ netEdge: 0.03 });
      const result = scoreOpportunity(opp);
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle zero confidence', () => {
      const opp = createTestOpportunity({
        detectorConfidence: 0,
        netEdge: 0.10,
      });
      const result = scoreOpportunity(opp);
      expect(result).not.toBeNull();
      expect(result?.scoreBreakdown.confidenceScore).toBe(0);
    });

    it('should handle max liquidity', () => {
      const opp = createTestOpportunity({
        minLiquidity: 1000000, // $1M
        netEdge: 0.10,
      });
      const result = scoreOpportunity(opp);
      expect(result).not.toBeNull();
      expect(result?.scoreBreakdown.liquidityScore).toBe(10);
    });

    it('should handle missing close date', () => {
      const opp = createTestOpportunity({
        closeDate: undefined,
        netEdge: 0.10,
      });
      const result = scoreOpportunity(opp);
      expect(result).not.toBeNull();
      expect(result?.scoreBreakdown.timeScore).toBe(5); // Neutral
    });

    it('should produce scores in 1-10 range', () => {
      // Test with extreme values
      const oppMin = createTestOpportunity({
        netEdge: 0.05, // Minimum threshold
        detectorConfidence: 0.1,
        minLiquidity: 500,
      });
      const oppMax = createTestOpportunity({
        netEdge: 0.30,
        detectorConfidence: 1.0,
        minLiquidity: 100000,
      });

      const resultMin = scoreOpportunity(oppMin);
      const resultMax = scoreOpportunity(oppMax);

      expect(resultMin?.score).toBeGreaterThanOrEqual(1);
      expect(resultMin?.score).toBeLessThanOrEqual(10);
      expect(resultMax?.score).toBeGreaterThanOrEqual(1);
      expect(resultMax?.score).toBeLessThanOrEqual(10);
    });
  });
});

// =============================================================================
// Custom Weights Tests
// =============================================================================

describe('Custom Weights', () => {
  it('should produce different scores with edge-heavy weights', () => {
    const edgeHeavyWeights: ScoringWeights = {
      edgeSize: 0.70,
      confidence: 0.10,
      liquidity: 0.10,
      timeToResolution: 0.05,
      feeAdjustedProfit: 0.05,
    };

    const defaultScorer = new CompositeScorer();
    const edgeHeavyScorer = new CompositeScorer(edgeHeavyWeights);

    // High edge, low everything else
    const opp = createTestOpportunity({
      netEdge: 0.20, // Excellent edge
      detectorConfidence: 0.5, // Low confidence
      minLiquidity: 600, // Low liquidity
    });

    const defaultResult = defaultScorer.score(opp);
    const edgeResult = edgeHeavyScorer.score(opp);

    // Edge-heavy should score higher for high-edge opportunities
    expect(edgeResult?.score).toBeGreaterThan(defaultResult!.score);
  });

  it('should produce different scores with liquidity-heavy weights', () => {
    const liquidityHeavyWeights: ScoringWeights = {
      edgeSize: 0.20,
      confidence: 0.10,
      liquidity: 0.50,
      timeToResolution: 0.10,
      feeAdjustedProfit: 0.10,
    };

    const defaultScorer = new CompositeScorer();
    const liquidityScorer = new CompositeScorer(liquidityHeavyWeights);

    // Low edge, high liquidity
    const opp = createTestOpportunity({
      netEdge: 0.06, // Marginal edge
      detectorConfidence: 0.5,
      minLiquidity: 100000, // Max liquidity
    });

    const defaultResult = defaultScorer.score(opp);
    const liquidityResult = liquidityScorer.score(opp);

    // Liquidity-heavy should score higher for high-liquidity opportunities
    expect(liquidityResult?.score).toBeGreaterThan(defaultResult!.score);
  });
});

// =============================================================================
// Type Validation Tests
// =============================================================================

describe('Type Exports', () => {
  it('should export UnifiedOpportunity interface', () => {
    const opp: UnifiedOpportunity = createTestOpportunity();
    expect(opp.id).toBeDefined();
    expect(opp.type).toBeDefined();
    expect(opp.platform).toBeDefined();
  });

  it('should export ScoringWeights interface', () => {
    const weights: ScoringWeights = {
      edgeSize: 0.35,
      confidence: 0.25,
      liquidity: 0.20,
      timeToResolution: 0.10,
      feeAdjustedProfit: 0.10,
    };
    expect(weights.edgeSize).toBe(0.35);
  });

  it('should export ScoreBreakdown interface', () => {
    const opp = createTestOpportunity({ netEdge: 0.10 });
    const result = scoreOpportunity(opp);
    const breakdown: ScoreBreakdown = result!.scoreBreakdown;
    expect(breakdown.edgeScore).toBeDefined();
  });
});
