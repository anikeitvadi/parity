/**
 * Correlated Markets Consistency Detector
 *
 * Detects pricing inconsistencies in correlated markets on the same platform.
 * EDGE-04 requirement: identifies opportunities where related markets are mispriced.
 *
 * Detection patterns:
 * - Binary markets where YES + NO != 100% (buy/sell both outcomes)
 * - Multi-outcome markets where sum of prices != 100%
 *
 * Note: This detector operates within a single platform only.
 * Cross-platform arbitrage (EDGE-02) is handled separately and disabled until Phase 3.
 *
 * @module detectors/correlated-markets
 */

import type { Market } from '../types/market.js';
import { logger } from '../utils/logger.js';

// Configuration constants
/** Default minimum edge percentage to flag an opportunity */
const DEFAULT_MIN_EDGE_PERCENT = 2;

/** Default minimum liquidity threshold in USD */
const DEFAULT_MIN_LIQUIDITY = 500;

/** Edge threshold for high confidence (>5% = 0.9+ confidence) */
const HIGH_CONFIDENCE_EDGE_THRESHOLD = 5;

/** Maximum edge for confidence scaling (10% = 1.0 confidence) */
const MAX_EDGE_FOR_CONFIDENCE = 10;

/** Minimum confidence for moderate edge (2-5%) */
const MIN_CONFIDENCE = 0.7;

/** Confidence at threshold (5% edge) */
const THRESHOLD_CONFIDENCE = 0.9;

/** Maximum confidence (>10% edge) */
const MAX_CONFIDENCE = 1.0;

/**
 * Opportunity type for correlated market mispricing
 */
export type OpportunityType =
  | 'binary_overpriced'   // YES + NO > 102% - sell both
  | 'binary_underpriced'  // YES + NO < 98% - buy both
  | 'multi_overpriced'    // Sum of outcomes > 102% - sell all
  | 'multi_underpriced';  // Sum of outcomes < 98% - buy all

/**
 * Detected opportunity from correlated market analysis
 */
export interface CorrelatedOpportunity {
  /** The market with pricing inconsistency */
  market: Market;
  /** Type of opportunity detected */
  type: OpportunityType;
  /** Edge size in percentage points (e.g., 5 = 5%) */
  edgeSize: number;
  /** Confidence score (0.7-1.0) */
  confidence: number;
  /** Sum of all outcome prices (should be ~1.0) */
  priceSum: number;
  /** Expected value as decimal (e.g., 0.05 = 5% EV) */
  expectedValue: number;
  /** Timestamp of detection */
  timestamp: number;
}

/**
 * Correlated Markets Detector
 *
 * Identifies pricing inconsistencies within the same platform:
 * - Binary markets where YES + NO != 100%
 * - Multi-outcome markets where sum of prices != 100%
 *
 * @example
 * ```typescript
 * const detector = new CorrelatedMarketsDetector(2, 500);
 * const opportunities = detector.detectFromMarkets(markets);
 * ```
 */
export class CorrelatedMarketsDetector {
  private readonly detectorLogger = logger.child({ component: 'correlated-detector' });
  private readonly minEdgePercent: number;
  private readonly minLiquidity: number;

  constructor(
    minEdgePercent: number = DEFAULT_MIN_EDGE_PERCENT,
    minLiquidity: number = DEFAULT_MIN_LIQUIDITY
  ) {
    this.minEdgePercent = minEdgePercent;
    this.minLiquidity = minLiquidity;
  }

  /**
   * Detect opportunities from a list of markets
   *
   * @param markets - Array of markets to analyze
   * @returns Array of opportunities sorted by edge size (descending)
   */
  detectFromMarkets(markets: Market[]): CorrelatedOpportunity[] {
    const opportunities: CorrelatedOpportunity[] = [];
    let skippedCount = 0;

    for (const market of markets) {
      const opportunity = this.analyzeMarket(market);
      if (opportunity) {
        opportunities.push(opportunity);
      } else {
        skippedCount++;
      }
    }

    // Sort by edge size descending (best opportunities first)
    opportunities.sort((a, b) => b.edgeSize - a.edgeSize);

    // Log results
    if (opportunities.length > 0) {
      this.detectorLogger.info(
        {
          marketCount: markets.length,
          opportunityCount: opportunities.length,
          skippedCount,
          topEdge: opportunities[0]?.edgeSize,
          topType: opportunities[0]?.type,
        },
        'Correlated market analysis complete'
      );
    } else if (markets.length > 0) {
      this.detectorLogger.debug(
        {
          marketCount: markets.length,
          skippedCount,
          minEdgePercent: this.minEdgePercent,
          minLiquidity: this.minLiquidity,
        },
        'No correlated market opportunities found'
      );
    }

    return opportunities;
  }

  /**
   * Analyze a single market for pricing inconsistency
   */
  private analyzeMarket(market: Market): CorrelatedOpportunity | null {
    // Skip single outcome markets (no correlation check possible)
    if (market.outcomes.length < 2) {
      this.detectorLogger.debug(
        { marketId: market.id, outcomeCount: market.outcomes.length },
        'Skipping single-outcome market'
      );
      return null;
    }

    // Check liquidity threshold
    if (!this.meetsLiquidityThreshold(market)) {
      return null;
    }

    // Validate price data
    if (!this.hasValidPrices(market)) {
      this.detectorLogger.debug(
        { marketId: market.id, prices: market.prices },
        'Skipping market with invalid prices'
      );
      return null;
    }

    // Calculate price sum
    const priceSum = this.calculatePriceSum(market);
    if (priceSum === null) {
      return null;
    }

    // Calculate edge size (deviation from 100%)
    const edgeSize = Math.abs((priceSum - 1) * 100);

    // Check minimum edge threshold
    if (edgeSize < this.minEdgePercent) {
      return null;
    }

    // Determine opportunity type
    const type = this.determineOpportunityType(market, priceSum);

    // Calculate confidence
    const confidence = this.calculateConfidence(edgeSize);

    // Calculate expected value
    const expectedValue = this.calculateExpectedValue(priceSum, type);

    return {
      market,
      type,
      edgeSize,
      confidence,
      priceSum,
      expectedValue,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if market meets minimum liquidity threshold
   */
  private meetsLiquidityThreshold(market: Market): boolean {
    if (market.liquidity === undefined || market.liquidity === null) {
      return false;
    }
    return market.liquidity >= this.minLiquidity;
  }

  /**
   * Validate that market has valid price data for all outcomes
   */
  private hasValidPrices(market: Market): boolean {
    // Check each outcome has a valid price
    for (const outcome of market.outcomes) {
      const price = market.prices[outcome];
      if (price === undefined || price === null || typeof price !== 'number') {
        return false;
      }
    }

    // Check at least one price is non-zero
    const hasNonZero = Object.values(market.prices).some((p) => p > 0);
    return hasNonZero;
  }

  /**
   * Calculate sum of all outcome prices
   */
  private calculatePriceSum(market: Market): number | null {
    let sum = 0;
    for (const outcome of market.outcomes) {
      const price = market.prices[outcome];
      if (typeof price !== 'number') {
        return null;
      }
      sum += price;
    }
    return sum;
  }

  /**
   * Determine the opportunity type based on market structure and price sum
   */
  private determineOpportunityType(market: Market, priceSum: number): OpportunityType {
    const isBinary = market.outcomes.length === 2;
    const isOverpriced = priceSum > 1;

    if (isBinary) {
      return isOverpriced ? 'binary_overpriced' : 'binary_underpriced';
    } else {
      return isOverpriced ? 'multi_overpriced' : 'multi_underpriced';
    }
  }

  /**
   * Calculate confidence score based on edge size
   *
   * Confidence scaling:
   * - 2-5% edge: 0.7-0.9 confidence (linear interpolation)
   * - 5-10% edge: 0.9-1.0 confidence (linear interpolation)
   * - >10% edge: 1.0 confidence (capped)
   */
  private calculateConfidence(edgeSize: number): number {
    if (edgeSize > HIGH_CONFIDENCE_EDGE_THRESHOLD) {
      // High confidence range: 5-10% edge -> 0.9-1.0 confidence
      const scaledEdge = Math.min(edgeSize, MAX_EDGE_FOR_CONFIDENCE);
      const range = MAX_EDGE_FOR_CONFIDENCE - HIGH_CONFIDENCE_EDGE_THRESHOLD;
      const progress = (scaledEdge - HIGH_CONFIDENCE_EDGE_THRESHOLD) / range;
      return THRESHOLD_CONFIDENCE + progress * (MAX_CONFIDENCE - THRESHOLD_CONFIDENCE);
    } else {
      // Moderate confidence range: 2-5% edge -> 0.7-0.9 confidence
      const range = HIGH_CONFIDENCE_EDGE_THRESHOLD - this.minEdgePercent;
      const progress = (edgeSize - this.minEdgePercent) / range;
      return MIN_CONFIDENCE + progress * (THRESHOLD_CONFIDENCE - MIN_CONFIDENCE);
    }
  }

  /**
   * Calculate expected value from the opportunity
   *
   * For overpriced markets: EV = (sum - 1) since selling all outcomes yields sum but costs 1
   * For underpriced markets: EV = (1 - sum) since buying all outcomes costs sum but yields 1
   */
  private calculateExpectedValue(priceSum: number, type: OpportunityType): number {
    const isOverpriced = type === 'binary_overpriced' || type === 'multi_overpriced';
    return isOverpriced ? priceSum - 1 : 1 - priceSum;
  }
}
