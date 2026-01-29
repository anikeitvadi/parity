/**
 * Correlated Markets Consistency Detector
 *
 * Detects pricing inconsistencies in correlated markets on the same platform.
 * EDGE-04 requirement: identifies opportunities where related markets are mispriced.
 *
 * @module detectors/correlated-markets
 */

import type { Market } from '../types/market.js';
import { logger } from '../utils/logger.js';

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
  /** Timestamp of detection */
  timestamp: number;
}

/**
 * Correlated Markets Detector
 *
 * Identifies pricing inconsistencies within the same platform:
 * - Binary markets where YES + NO != 100%
 * - Multi-outcome markets where sum of prices != 100%
 */
export class CorrelatedMarketsDetector {
  private readonly detectorLogger = logger.child({ component: 'correlated-detector' });

  constructor(
    private minEdgePercent: number = 2,
    private minLiquidity: number = 500
  ) {}

  /**
   * Detect opportunities from a list of markets
   */
  detectFromMarkets(markets: Market[]): CorrelatedOpportunity[] {
    const opportunities: CorrelatedOpportunity[] = [];

    for (const market of markets) {
      const opportunity = this.analyzeMarket(market);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Sort by edge size descending (best opportunities first)
    opportunities.sort((a, b) => b.edgeSize - a.edgeSize);

    if (opportunities.length > 0) {
      this.detectorLogger.info(
        {
          marketCount: markets.length,
          opportunityCount: opportunities.length,
          topEdge: opportunities[0]?.edgeSize,
        },
        'Correlated market analysis complete'
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
      return null;
    }

    // Check liquidity threshold
    if (!this.meetsLiquidityThreshold(market)) {
      return null;
    }

    // Validate price data
    if (!this.hasValidPrices(market)) {
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

    return {
      market,
      type,
      edgeSize,
      confidence,
      priceSum,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if market meets minimum liquidity threshold
   */
  private meetsLiquidityThreshold(market: Market): boolean {
    // Skip markets without liquidity data
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
   * - 2-5% edge: 0.7-0.9 confidence (proportional)
   * - >5% edge: 0.9-1.0 confidence (proportional, capped at 1.0)
   */
  private calculateConfidence(edgeSize: number): number {
    if (edgeSize > 5) {
      // 0.9 at 5%, scales toward 1.0 (cap at 10% edge for max confidence)
      const scaledEdge = Math.min(edgeSize, 10);
      return 0.9 + ((scaledEdge - 5) / 5) * 0.1;
    } else {
      // 0.7 at 2%, 0.9 at 5%
      return 0.7 + ((edgeSize - 2) / 3) * 0.2;
    }
  }
}
