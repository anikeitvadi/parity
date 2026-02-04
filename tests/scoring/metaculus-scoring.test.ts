/**
 * Tests for Metaculus Divergence Scoring
 *
 * Verifies that the composite scorer handles metaculus_divergence
 * opportunities correctly with appropriate score ranges.
 */

import { describe, it, expect } from 'vitest';
import { scoreOpportunity, CompositeScorer } from '../../src/scoring/composite-scorer.js';
import type { UnifiedOpportunity } from '../../src/scoring/types.js';

describe('Metaculus Divergence Scoring', () => {
  it('scores fresh metaculus_divergence opportunities appropriately', () => {
    const freshDivergence: UnifiedOpportunity = {
      id: 'metaculus_div_1',
      type: 'metaculus_divergence',
      platform: 'polymarket',
      marketId: '0xabc123',
      marketQuestion: 'Will X happen by 2025?',
      grossEdge: 0.12, // 12% divergence
      netEdge: 0.12,
      detectorConfidence: 0.9, // Fresh forecast
      matchConfidence: 0.85,
      minLiquidity: 0,
      liquidityDepth: 1,
      detectedAt: Date.now(),
      raw: {},
    };

    const scored = scoreOpportunity(freshDivergence);

    // Fresh divergence with 12% edge should score in valid range
    // Note: Actual score depends on all factors (edge, confidence, liquidity, time, profit)
    // With minLiquidity: 0, liquidity score is low, so overall score is moderate
    expect(scored).not.toBeNull();
    expect(scored!.score).toBeGreaterThanOrEqual(5);
    expect(scored!.score).toBeLessThanOrEqual(10);
    // Verify type is preserved
    expect(scored!.type).toBe('metaculus_divergence');
  });

  it('scores stale metaculus_divergence opportunities lower', () => {
    const staleDivergence: UnifiedOpportunity = {
      id: 'metaculus_div_2',
      type: 'metaculus_divergence',
      platform: 'kalshi',
      marketId: 'STALE-123',
      marketQuestion: 'Will Y happen?',
      grossEdge: 0.10, // 10% divergence
      netEdge: 0.10,
      detectorConfidence: 0.6, // Stale forecast (lower confidence)
      matchConfidence: 0.85,
      minLiquidity: 0,
      liquidityDepth: 1,
      detectedAt: Date.now(),
      raw: {},
    };

    const scored = scoreOpportunity(staleDivergence);

    // Stale forecast should score lower due to reduced confidence
    expect(scored).not.toBeNull();
    // Still valid but lower score due to confidence penalty
    expect(scored!.score).toBeLessThan(8);
  });

  it('filters out metaculus opportunities below 5% threshold', () => {
    const lowDivergence: UnifiedOpportunity = {
      id: 'metaculus_div_3',
      type: 'metaculus_divergence',
      platform: 'polymarket',
      marketId: '0xlow',
      marketQuestion: 'Low divergence question',
      grossEdge: 0.03, // Only 3% divergence
      netEdge: 0.03,
      detectorConfidence: 0.9,
      matchConfidence: 0.85,
      minLiquidity: 0,
      liquidityDepth: 1,
      detectedAt: Date.now(),
      raw: {},
    };

    const scored = scoreOpportunity(lowDivergence);

    // Below 5% threshold - should be filtered out
    expect(scored).toBeNull();
  });

  it('produces high-quality alert for very strong divergence with good liquidity', () => {
    // To achieve 8+ rating, we need very high edge with good liquidity
    const highQualityOpp: UnifiedOpportunity = {
      id: 'metaculus_high_quality',
      type: 'metaculus_divergence',
      platform: 'polymarket',
      marketId: '0xhigh',
      marketQuestion: 'High-quality divergence opportunity',
      grossEdge: 0.25, // 25% divergence (very high)
      netEdge: 0.25,
      detectorConfidence: 0.95, // Fresh and high confidence
      matchConfidence: 0.95, // High match confidence
      minLiquidity: 5000, // High liquidity
      liquidityDepth: 3,
      detectedAt: Date.now(),
      raw: {},
    };

    const scored = scoreOpportunity(highQualityOpp);

    // With 25% edge, high confidence, and good liquidity, should score 8+
    expect(scored).not.toBeNull();
    expect(scored!.score).toBeGreaterThanOrEqual(8);
    expect(scored!.type).toBe('metaculus_divergence');
  });

  it('includes Kelly position sizing for metaculus opportunities', () => {
    const opportunity: UnifiedOpportunity = {
      id: 'metaculus_kelly',
      type: 'metaculus_divergence',
      platform: 'polymarket',
      marketId: '0xkelly',
      marketQuestion: 'Test Kelly sizing',
      grossEdge: 0.10,
      netEdge: 0.10,
      detectorConfidence: 0.8,
      matchConfidence: 0.85,
      minLiquidity: 500,
      liquidityDepth: 1,
      detectedAt: Date.now(),
      raw: {},
    };

    const bankroll = 500;
    const scored = scoreOpportunity(opportunity, bankroll);

    expect(scored).not.toBeNull();
    expect(scored!.positionSize).toBeGreaterThan(0);
    expect(scored!.positionPercent).toBeGreaterThan(0);
    // positionPercent is expressed as a percentage value (e.g., 4 = 4%)
    // so we check it's reasonable, not necessarily <= 1
    expect(scored!.positionPercent).toBeLessThanOrEqual(100);
  });

  it('handles metaculus opportunities in batch scoring', () => {
    const scorer = new CompositeScorer();

    const opportunities: UnifiedOpportunity[] = [
      {
        id: 'batch_1',
        type: 'metaculus_divergence',
        platform: 'polymarket',
        marketId: '0xbatch1',
        marketQuestion: 'Batch test 1',
        grossEdge: 0.12,
        netEdge: 0.12,
        detectorConfidence: 0.9,
        matchConfidence: 0.8,
        minLiquidity: 0,
        liquidityDepth: 1,
        detectedAt: Date.now(),
        raw: {},
      },
      {
        id: 'batch_2',
        type: 'metaculus_divergence',
        platform: 'kalshi',
        marketId: 'BATCH2',
        marketQuestion: 'Batch test 2',
        grossEdge: 0.08,
        netEdge: 0.08,
        detectorConfidence: 0.7,
        matchConfidence: 0.85,
        minLiquidity: 1000,
        liquidityDepth: 1,
        detectedAt: Date.now(),
        raw: {},
      },
      {
        id: 'batch_3_filtered',
        type: 'metaculus_divergence',
        platform: 'polymarket',
        marketId: '0xfiltered',
        marketQuestion: 'Should be filtered',
        grossEdge: 0.02,
        netEdge: 0.02, // Below threshold
        detectorConfidence: 0.9,
        matchConfidence: 0.9,
        minLiquidity: 0,
        liquidityDepth: 1,
        detectedAt: Date.now(),
        raw: {},
      },
    ];

    const scored = scorer.scoreAll(opportunities);

    // Should filter out the below-threshold opportunity
    expect(scored.length).toBe(2);
    // Should be sorted by score descending
    expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
    // All should have the correct type
    expect(scored.every(s => s.type === 'metaculus_divergence')).toBe(true);
  });

  it('provides score breakdown for metaculus opportunities', () => {
    const opportunity: UnifiedOpportunity = {
      id: 'breakdown_test',
      type: 'metaculus_divergence',
      platform: 'polymarket',
      marketId: '0xbreakdown',
      marketQuestion: 'Score breakdown test',
      grossEdge: 0.10,
      netEdge: 0.10,
      detectorConfidence: 0.85,
      matchConfidence: 0.9,
      minLiquidity: 500,
      liquidityDepth: 1,
      detectedAt: Date.now(),
      raw: {},
    };

    const scored = scoreOpportunity(opportunity);

    expect(scored).not.toBeNull();
    expect(scored!.scoreBreakdown).toBeDefined();
    expect(scored!.scoreBreakdown.edgeScore).toBeGreaterThan(0);
    expect(scored!.scoreBreakdown.confidenceScore).toBeGreaterThan(0);
    expect(scored!.scoreBreakdown.liquidityScore).toBeGreaterThan(0);
    expect(scored!.scoreBreakdown.profitScore).toBeGreaterThan(0);
    expect(scored!.scoreBreakdown.weights).toBeDefined();
  });
});
