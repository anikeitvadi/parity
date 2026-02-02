/**
 * Composite Scoring Engine
 *
 * Combines individual scoring factors into a weighted composite score.
 *
 * Requirements:
 * - RATE-01: Composite scoring 1-10 scale
 * - RATE-06: Minimum $0.05 net profit threshold (5% net edge)
 *
 * Default weights (research-backed):
 * - Edge size: 35%
 * - Confidence: 25%
 * - Liquidity: 20%
 * - Time to resolution: 10%
 * - Fee-adjusted profit: 10%
 *
 * @module scoring/composite-scorer
 */

import type {
  UnifiedOpportunity,
  ScoredOpportunity,
  ScoringWeights,
  ScoreBreakdown,
} from './types.js';
import { calculateEdgeScore } from './factors/edge-factor.js';
import { calculateConfidenceScore } from './factors/confidence-factor.js';
import { calculateLiquidityScore } from './factors/liquidity-factor.js';
import { calculateTimeScore } from './factors/time-factor.js';
import { calculateProfitScore } from './factors/fee-factor.js';

/**
 * Minimum net edge threshold
 *
 * Based on research: $0.05 minimum profit on $100 trade = 5% net edge
 * Opportunities below this threshold are not worth the execution overhead.
 */
export const MIN_NET_EDGE_THRESHOLD = 0.05;

/**
 * Default scoring weights (research-backed)
 *
 * These weights prioritize edge and confidence as they are the primary
 * determinants of expected value. Liquidity ensures executability.
 * Time and profit factors provide secondary signals.
 *
 * @remarks
 * Weights can be tuned based on backtesting results.
 * Sum should equal 1.0 for proper weighted average.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  edgeSize: 0.35,
  confidence: 0.25,
  liquidity: 0.20,
  timeToResolution: 0.10,
  feeAdjustedProfit: 0.10,
};

/**
 * Check if opportunity meets minimum threshold
 *
 * @param opportunity - Opportunity to check
 * @returns true if net edge >= 5% (minimum threshold)
 */
export function meetsMinimumThreshold(opportunity: UnifiedOpportunity): boolean {
  return opportunity.netEdge >= MIN_NET_EDGE_THRESHOLD;
}

/**
 * Score an opportunity using default weights
 *
 * Convenience function that creates a scorer and scores in one call.
 *
 * @param opportunity - Opportunity to score
 * @param weights - Optional custom weights (defaults to DEFAULT_WEIGHTS)
 * @returns ScoredOpportunity if above threshold, null otherwise
 *
 * @example
 * ```typescript
 * const opp = { netEdge: 0.10, ... };
 * const scored = scoreOpportunity(opp);
 * if (scored) {
 *   console.log(`Score: ${scored.score}`);
 * }
 * ```
 */
export function scoreOpportunity(
  opportunity: UnifiedOpportunity,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredOpportunity | null {
  const scorer = new CompositeScorer(weights);
  return scorer.score(opportunity);
}

/**
 * Composite Scorer
 *
 * Calculates weighted composite scores for opportunities.
 * Enforces minimum threshold and provides score breakdown.
 *
 * @example
 * ```typescript
 * const scorer = new CompositeScorer();
 * const opportunities = [...];
 * const scored = opportunities
 *   .map(opp => scorer.score(opp))
 *   .filter((s): s is ScoredOpportunity => s !== null)
 *   .sort((a, b) => b.score - a.score);
 * ```
 */
export class CompositeScorer {
  private readonly weights: ScoringWeights;

  /**
   * Create a new CompositeScorer
   *
   * @param weights - Scoring weights (defaults to DEFAULT_WEIGHTS)
   */
  constructor(weights: ScoringWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Score an opportunity
   *
   * @param opportunity - Opportunity to score
   * @returns ScoredOpportunity if above threshold, null otherwise
   */
  score(opportunity: UnifiedOpportunity): ScoredOpportunity | null {
    // Check minimum threshold
    if (!meetsMinimumThreshold(opportunity)) {
      return null;
    }

    // Calculate individual factor scores
    const edgeScore = calculateEdgeScore(opportunity.netEdge);
    const confidenceScore = calculateConfidenceScore(
      opportunity.detectorConfidence,
      opportunity.matchConfidence
    );
    const liquidityScore = calculateLiquidityScore(opportunity.minLiquidity);
    const timeScore = calculateTimeScore(opportunity.closeDate);
    const profitScore = calculateProfitScore(opportunity.netEdge);

    // Create score breakdown
    const scoreBreakdown: ScoreBreakdown = {
      edgeScore,
      confidenceScore,
      liquidityScore,
      timeScore,
      profitScore,
      weights: this.weights,
    };

    // Calculate weighted composite score
    const compositeScore = this.calculateWeightedAverage(scoreBreakdown);

    // Ensure score is in 1-10 range
    const finalScore = Math.max(1, Math.min(10, compositeScore));

    // Create scored opportunity (position sizing to be added in plan 02-02)
    return {
      ...opportunity,
      score: finalScore,
      scoreBreakdown,
      positionSize: 0, // Placeholder - implemented in 02-02
      positionPercent: 0, // Placeholder - implemented in 02-02
    };
  }

  /**
   * Calculate weighted average from score breakdown
   *
   * @param breakdown - Score breakdown with individual factor scores
   * @returns Weighted average score
   */
  private calculateWeightedAverage(breakdown: ScoreBreakdown): number {
    const {
      edgeScore,
      confidenceScore,
      liquidityScore,
      timeScore,
      profitScore,
    } = breakdown;

    const weights = this.weights;

    return (
      edgeScore * weights.edgeSize +
      confidenceScore * weights.confidence +
      liquidityScore * weights.liquidity +
      timeScore * weights.timeToResolution +
      profitScore * weights.feeAdjustedProfit
    );
  }

  /**
   * Get current weights
   *
   * @returns Copy of current scoring weights
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  /**
   * Score multiple opportunities
   *
   * Filters out below-threshold opportunities and sorts by score descending.
   *
   * @param opportunities - Array of opportunities to score
   * @returns Array of scored opportunities, sorted by score descending
   */
  scoreAll(opportunities: UnifiedOpportunity[]): ScoredOpportunity[] {
    return opportunities
      .map(opp => this.score(opp))
      .filter((scored): scored is ScoredOpportunity => scored !== null)
      .sort((a, b) => b.score - a.score);
  }
}
