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
import { calculateKelly } from './kelly.js';

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
 * Weight Tuning Guide:
 * ---------------------
 * - Increase edgeSize (0.35-0.50) if you want to prioritize raw profitability
 * - Increase confidence (0.25-0.40) if you want to prioritize signal reliability
 * - Increase liquidity (0.20-0.35) if you have larger position sizes
 * - Increase timeToResolution (0.10-0.20) if you prefer faster turnover
 * - feeAdjustedProfit overlaps with edgeSize; keep low (0.05-0.15)
 *
 * Backtesting Tips:
 * - Track win rate by score bracket (7+, 5-7, <5)
 * - If high-scoring opportunities underperform, reduce edge weight
 * - If execution slippage is high, increase liquidity weight
 *
 * @remarks
 * Weights must sum to 1.0 for proper weighted average.
 * Use validateWeights() to ensure valid configuration.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  edgeSize: 0.35,
  confidence: 0.25,
  liquidity: 0.20,
  timeToResolution: 0.10,
  feeAdjustedProfit: 0.10,
};

/**
 * Validate that weights sum to 1.0 (within floating point tolerance)
 *
 * @param weights - Weights to validate
 * @returns true if weights are valid, false otherwise
 *
 * @example
 * ```typescript
 * const customWeights = { edgeSize: 0.50, ... };
 * if (!validateWeights(customWeights)) {
 *   throw new Error('Weights must sum to 1.0');
 * }
 * ```
 */
export function validateWeights(weights: ScoringWeights): boolean {
  const sum =
    weights.edgeSize +
    weights.confidence +
    weights.liquidity +
    weights.timeToResolution +
    weights.feeAdjustedProfit;

  // Allow for floating point tolerance
  return Math.abs(sum - 1.0) < 0.0001;
}

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
 * Score an opportunity with position sizing
 *
 * Convenience function that creates a scorer and scores in one call,
 * including Kelly criterion position sizing.
 *
 * @param opportunity - Opportunity to score
 * @param bankroll - Total bankroll for position sizing (default: 500)
 * @param weights - Optional custom weights (defaults to DEFAULT_WEIGHTS)
 * @returns ScoredOpportunity if above threshold, null otherwise
 *
 * @example
 * ```typescript
 * const opp = { netEdge: 0.10, ... };
 * const scored = scoreOpportunity(opp, 500);
 * if (scored) {
 *   console.log(`Score: ${scored.score}`);
 *   console.log(`Position: $${scored.positionSize}`);
 * }
 * ```
 */
export function scoreOpportunity(
  opportunity: UnifiedOpportunity,
  bankroll: number = 500,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredOpportunity | null {
  const scorer = new CompositeScorer(weights, bankroll);
  return scorer.score(opportunity);
}

/**
 * Composite Scorer
 *
 * Calculates weighted composite scores for opportunities.
 * Enforces minimum threshold and provides score breakdown.
 * Includes Kelly criterion position sizing.
 *
 * @example
 * ```typescript
 * const scorer = new CompositeScorer(DEFAULT_WEIGHTS, 500);
 * const opportunities = [...];
 * const scored = opportunities
 *   .map(opp => scorer.score(opp))
 *   .filter((s): s is ScoredOpportunity => s !== null)
 *   .sort((a, b) => b.score - a.score);
 * ```
 */
export class CompositeScorer {
  private readonly weights: ScoringWeights;
  private readonly bankroll: number;

  /**
   * Create a new CompositeScorer
   *
   * @param weights - Scoring weights (defaults to DEFAULT_WEIGHTS)
   * @param bankroll - Total bankroll for position sizing (default: 500)
   */
  constructor(weights: ScoringWeights = DEFAULT_WEIGHTS, bankroll: number = 500) {
    this.weights = weights;
    this.bankroll = bankroll;
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

    // Calculate position sizing using Kelly criterion
    const kellyResult = calculateKelly({
      edge: opportunity.netEdge,
      confidence: opportunity.detectorConfidence,
      bankroll: this.bankroll,
    });

    // Create scored opportunity with position sizing
    return {
      ...opportunity,
      score: finalScore,
      scoreBreakdown,
      positionSize: kellyResult.positionSize,
      positionPercent: kellyResult.positionPercent,
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
