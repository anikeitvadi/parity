/**
 * Scoring Engine
 *
 * Modular scoring system for rating prediction market opportunities.
 *
 * Features:
 * - Composite scoring on 1-10 scale
 * - Configurable factor weights
 * - Minimum threshold enforcement ($0.05 / 5% net edge)
 * - Individual factor scoring for transparency
 *
 * Requirements covered:
 * - RATE-01: Composite scoring
 * - RATE-02: Edge size factor
 * - RATE-03: Confidence factor
 * - RATE-04: Liquidity factor
 * - RATE-05: Time to resolution factor
 * - RATE-06: Fee-adjusted profit factor and minimum threshold
 *
 * @example
 * ```typescript
 * import { scoreOpportunity, CompositeScorer } from './scoring';
 *
 * // Simple usage
 * const result = scoreOpportunity(opportunity);
 * if (result) {
 *   console.log(`Score: ${result.score}`);
 *   console.log(`Edge score: ${result.scoreBreakdown.edgeScore}`);
 * }
 *
 * // Custom weights
 * const customScorer = new CompositeScorer({
 *   edgeSize: 0.50,
 *   confidence: 0.20,
 *   liquidity: 0.15,
 *   timeToResolution: 0.10,
 *   feeAdjustedProfit: 0.05,
 * });
 * const customResult = customScorer.score(opportunity);
 * ```
 *
 * @module scoring
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  UnifiedOpportunity,
  ScoredOpportunity,
  ScoringWeights,
  ScoreBreakdown,
  ScoringConfig,
  ScoringFactor,
  OpportunityType,
  Platform,
} from './types.js';

// =============================================================================
// Composite Scorer Exports
// =============================================================================

export {
  CompositeScorer,
  scoreOpportunity,
  meetsMinimumThreshold,
  validateWeights,
  DEFAULT_WEIGHTS,
  MIN_NET_EDGE_THRESHOLD,
} from './composite-scorer.js';

// =============================================================================
// Individual Factor Exports (for advanced usage/testing)
// =============================================================================

export { calculateEdgeScore } from './factors/edge-factor.js';
export { calculateConfidenceScore } from './factors/confidence-factor.js';
export { calculateLiquidityScore } from './factors/liquidity-factor.js';
export { calculateTimeScore } from './factors/time-factor.js';
export { calculateProfitScore } from './factors/fee-factor.js';
