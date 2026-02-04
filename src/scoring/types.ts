/**
 * Scoring Engine Types
 *
 * Defines interfaces for the opportunity scoring system.
 *
 * Requirements:
 * - RATE-01: Composite scoring 1-10 scale
 * - RATE-02 through RATE-06: Individual factor scoring
 *
 * @module scoring/types
 */

/**
 * Opportunity types detected by the system
 */
export type OpportunityType = 'multi_outcome' | 'correlated' | 'cross_platform' | 'metaculus_divergence';

/**
 * Supported platforms
 */
export type Platform = 'polymarket' | 'kalshi';

/**
 * Unified opportunity interface that normalizes all detector outputs
 *
 * This interface provides a common structure for scoring regardless
 * of which detector produced the opportunity.
 */
export interface UnifiedOpportunity {
  /** Unique identifier for deduplication (hash of market+type+direction) */
  id: string;

  /** Type of opportunity detected */
  type: OpportunityType;

  /** Platform where opportunity exists, or 'cross' for cross-platform */
  platform: Platform | 'cross';

  /** Market identifier on the platform */
  marketId: string;

  /** Human-readable market question */
  marketQuestion: string;

  /** Gross edge before fees (0-1 scale, e.g., 0.12 = 12%) */
  grossEdge: number;

  /** Net edge after fees (0-1 scale, e.g., 0.10 = 10%) */
  netEdge: number;

  /** Detector confidence score (0-1 scale) */
  detectorConfidence: number;

  /** Match confidence for cross-platform opportunities (0-1 scale) */
  matchConfidence?: number;

  /** Minimum liquidity available in USD (bottleneck liquidity) */
  minLiquidity: number;

  /** Number of liquidity levels or outcomes */
  liquidityDepth: number;

  /** Detection timestamp in milliseconds */
  detectedAt: number;

  /** Market close/expiration date (ISO string) */
  closeDate?: string;

  /** Original detector output for detail view */
  raw: unknown;
}

/**
 * Scored opportunity with composite score and breakdown
 *
 * Extends UnifiedOpportunity with scoring results and position sizing.
 */
export interface ScoredOpportunity extends UnifiedOpportunity {
  /** Composite score (1-10 scale) */
  score: number;

  /** Breakdown of individual factor scores */
  scoreBreakdown: ScoreBreakdown;

  /** Suggested position size in USD (from Kelly criterion, added in plan 02-02) */
  positionSize: number;

  /** Position size as percentage of bankroll */
  positionPercent: number;
}

/**
 * Score breakdown showing individual factor contributions
 */
export interface ScoreBreakdown {
  /** Edge size factor score (1-10) */
  edgeScore: number;

  /** Confidence factor score (0-10) */
  confidenceScore: number;

  /** Liquidity factor score (0-10) */
  liquidityScore: number;

  /** Time to resolution factor score (2-10, 5 for neutral) */
  timeScore: number;

  /** Fee-adjusted profit factor score (0-10) */
  profitScore: number;

  /** Weights used for this scoring */
  weights: ScoringWeights;
}

/**
 * Configurable weights for scoring factors
 *
 * Weights should sum to 1.0 for proper weighted average.
 *
 * Default weights (research-backed):
 * - edgeSize: 35% - Primary signal for profitability
 * - confidence: 25% - Signal reliability
 * - liquidity: 20% - Execution feasibility
 * - timeToResolution: 10% - Urgency factor
 * - feeAdjustedProfit: 10% - Net profitability
 *
 * @remarks
 * These weights can be tuned based on backtesting results.
 * Edge and confidence are weighted highest as they're the primary
 * determinants of expected value.
 */
export interface ScoringWeights {
  /** Weight for edge size factor (default: 0.35) */
  edgeSize: number;

  /** Weight for confidence factor (default: 0.25) */
  confidence: number;

  /** Weight for liquidity factor (default: 0.20) */
  liquidity: number;

  /** Weight for time to resolution factor (default: 0.10) */
  timeToResolution: number;

  /** Weight for fee-adjusted profit factor (default: 0.10) */
  feeAdjustedProfit: number;
}

/**
 * Configuration for the scoring engine
 */
export interface ScoringConfig {
  /** Minimum net edge threshold (default: 0.05 = 5%) */
  minNetEdgeThreshold: number;

  /** Scoring weights */
  weights: ScoringWeights;
}

/**
 * Scoring factor interface for modular factor implementations
 */
export interface ScoringFactor {
  /** Factor name for logging/debugging */
  name: string;

  /** Calculate factor score (0-10 scale) */
  calculate: (opportunity: UnifiedOpportunity) => number;
}
