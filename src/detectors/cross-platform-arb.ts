/**
 * Cross-Platform Arbitrage Detector
 *
 * CRITICAL: This detector is DISABLED until Phase 3 when settlement
 * verification is operational. Settlement divergence causes DOUBLE LOSSES.
 *
 * Detects arbitrage opportunities across Polymarket and Kalshi for matched markets.
 *
 * @module detectors/cross-platform-arb
 */

import { featureFlags } from '../config/feature-flags.js';
import { getRecentMatches, getLatestSnapshot, MarketSnapshot } from '../database/queries.js';
import { logger } from '../utils/logger.js';

const detectorLogger = logger.child({ component: 'cross-platform-arb' });

/**
 * Settlement risk level.
 * Phase 1: Always HIGH (no settlement parser yet)
 * Phase 3+: Uses settlement rule comparison
 */
export type SettlementRisk = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Arbitrage opportunity type
 */
export type ArbitrageType = 'price_divergence' | 'inverse_arbitrage';

/**
 * Cross-platform arbitrage opportunity
 */
export interface CrossPlatformOpportunity {
  /** Polymarket market ID */
  polymarketId: string;
  /** Kalshi ticker */
  kalshiTicker: string;
  /** Type of arbitrage */
  type: ArbitrageType;
  /** Gross edge before fees (0-1 scale) */
  grossEdge: number;
  /** Net edge after fees (0-1 scale) */
  netEdge: number;
  /** Settlement risk level */
  settlementRisk: SettlementRisk;
  /** Match confidence from market matcher (0-1) */
  matchConfidence: number;
  /** Opportunity confidence for alerting (0-1) */
  opportunityConfidence: number;
  /** Polymarket YES price */
  polymarketPrice: number;
  /** Kalshi YES price */
  kalshiPrice: number;
  /** Polymarket order book liquidity */
  polymarketLiquidity: number;
  /** Kalshi order book liquidity */
  kalshiLiquidity: number;
  /** When the opportunity was detected */
  detectedAt: number;
}

/**
 * Matched market row from database
 */
interface MatchedMarketRow {
  id: number;
  polymarket_id: string;
  kalshi_ticker: string;
  confidence: number;
  method: string;
  timestamp: number;
}

/** Default Polymarket fee percentage */
const DEFAULT_POLYMARKET_FEE = 2;

/** Default Kalshi fee percentage (taker) */
const DEFAULT_KALSHI_FEE = 7;

/** Default minimum net edge threshold (percentage) */
const DEFAULT_MIN_NET_EDGE = 10;

/** Default minimum liquidity per side ($) */
const DEFAULT_MIN_LIQUIDITY = 500;

/** Maximum snapshot age before considered stale (30 minutes in ms) */
const MAX_SNAPSHOT_AGE_MS = 30 * 60 * 1000;

/** Minimum match confidence to consider */
const MIN_MATCH_CONFIDENCE = 0.5;

/**
 * Cross-Platform Arbitrage Detector
 *
 * Detects price divergence arbitrage opportunities across Polymarket and Kalshi.
 *
 * CRITICAL SAFETY: Disabled by feature flag until Phase 3 settlement verification.
 */
export class CrossPlatformArbDetector {
  private minNetEdge: number;
  private minLiquidity: number;
  private polymarketFee: number;
  private kalshiFee: number;

  /**
   * Create a new detector instance.
   *
   * @param minNetEdge - Minimum net edge percentage after fees (default: 10)
   * @param minLiquidity - Minimum liquidity per side in USD (default: 500)
   * @param polymarketFee - Polymarket fee percentage (default: 2)
   * @param kalshiFee - Kalshi fee percentage (default: 7)
   */
  constructor(
    minNetEdge: number = DEFAULT_MIN_NET_EDGE,
    minLiquidity: number = DEFAULT_MIN_LIQUIDITY,
    polymarketFee: number = DEFAULT_POLYMARKET_FEE,
    kalshiFee: number = DEFAULT_KALSHI_FEE
  ) {
    this.minNetEdge = minNetEdge;
    this.minLiquidity = minLiquidity;
    this.polymarketFee = polymarketFee;
    this.kalshiFee = kalshiFee;
  }

  /**
   * Detect cross-platform arbitrage opportunities.
   *
   * @returns Array of opportunities sorted by net edge descending
   */
  async detect(): Promise<CrossPlatformOpportunity[]> {
    // Check feature flag FIRST
    if (!featureFlags.crossPlatformArb) {
      detectorLogger.warn(
        'Cross-platform arb detector disabled until Phase 3 (settlement verification)'
      );
      return [];
    }

    try {
      // Query matched markets with sufficient confidence
      const matches = getRecentMatches(MIN_MATCH_CONFIDENCE, 100) as MatchedMarketRow[];

      if (matches.length === 0) {
        detectorLogger.debug('No matched markets found');
        return [];
      }

      const opportunities: CrossPlatformOpportunity[] = [];

      for (const match of matches) {
        // Skip low-confidence matches
        if (!this.meetsConfidenceThreshold(match)) {
          continue;
        }

        // Get latest snapshots for both platforms
        const polySnapshot = getLatestSnapshot('polymarket', match.polymarket_id);
        const kalshiSnapshot = getLatestSnapshot('kalshi', match.kalshi_ticker);

        // Skip if data is missing or stale
        if (!this.isValidSnapshot(polySnapshot) || !this.isValidSnapshot(kalshiSnapshot)) {
          detectorLogger.debug(
            { polymarketId: match.polymarket_id, kalshiTicker: match.kalshi_ticker },
            'Skipping match due to missing or stale data'
          );
          continue;
        }

        // Validate liquidity on both platforms
        if (!this.validateLiquidity(polySnapshot!, kalshiSnapshot!)) {
          detectorLogger.debug(
            { polymarketId: match.polymarket_id, kalshiTicker: match.kalshi_ticker },
            'Skipping match due to insufficient liquidity'
          );
          continue;
        }

        // Calculate price divergence
        const polyPrice = this.extractYesPrice(polySnapshot!);
        const kalshiPrice = this.extractYesPrice(kalshiSnapshot!);

        if (polyPrice === null || kalshiPrice === null) {
          continue;
        }

        const grossEdge = this.calculatePriceDivergence(polyPrice, kalshiPrice);
        const netEdge = this.adjustForFees(grossEdge);

        // Skip if net edge below threshold
        if (netEdge < this.minNetEdge / 100) {
          detectorLogger.debug(
            {
              polymarketId: match.polymarket_id,
              kalshiTicker: match.kalshi_ticker,
              grossEdge: (grossEdge * 100).toFixed(2) + '%',
              netEdge: (netEdge * 100).toFixed(2) + '%',
            },
            'Skipping match - net edge below threshold'
          );
          continue;
        }

        // Assess settlement risk (always HIGH in Phase 1)
        const settlementRisk = this.assessSettlementRisk();

        // Calculate opportunity confidence
        const opportunityConfidence = this.calculateOpportunityConfidence(
          netEdge,
          polySnapshot!,
          kalshiSnapshot!
        );

        const opportunity: CrossPlatformOpportunity = {
          polymarketId: match.polymarket_id,
          kalshiTicker: match.kalshi_ticker,
          type: 'price_divergence',
          grossEdge,
          netEdge,
          settlementRisk,
          matchConfidence: match.confidence,
          opportunityConfidence,
          polymarketPrice: polyPrice,
          kalshiPrice: kalshiPrice,
          polymarketLiquidity: this.extractLiquidity(polySnapshot!),
          kalshiLiquidity: this.extractLiquidity(kalshiSnapshot!),
          detectedAt: Date.now(),
        };

        opportunities.push(opportunity);

        detectorLogger.info(
          {
            polymarketId: opportunity.polymarketId,
            kalshiTicker: opportunity.kalshiTicker,
            grossEdge: (grossEdge * 100).toFixed(2) + '%',
            netEdge: (netEdge * 100).toFixed(2) + '%',
            settlementRisk,
          },
          'Detected cross-platform arbitrage opportunity'
        );
      }

      // Sort by net edge descending
      opportunities.sort((a, b) => b.netEdge - a.netEdge);

      detectorLogger.info(
        { opportunityCount: opportunities.length, matchesChecked: matches.length },
        'Cross-platform arb detection complete'
      );

      return opportunities;
    } catch (error) {
      detectorLogger.error({ error }, 'Error during cross-platform arb detection');
      return [];
    }
  }

  /**
   * Calculate price divergence between platforms.
   *
   * @param polyPrice - Polymarket YES price (0-1)
   * @param kalshiPrice - Kalshi YES price (0-1)
   * @returns Absolute price divergence (0-1)
   */
  private calculatePriceDivergence(polyPrice: number, kalshiPrice: number): number {
    return Math.abs(polyPrice - kalshiPrice);
  }

  /**
   * Adjust gross edge for platform fees.
   *
   * @param grossEdge - Gross edge before fees (0-1)
   * @returns Net edge after fees (0-1)
   */
  private adjustForFees(grossEdge: number): number {
    const totalFeesPercent = this.polymarketFee + this.kalshiFee;
    const totalFees = totalFeesPercent / 100;
    return Math.max(0, grossEdge - totalFees);
  }

  /**
   * Validate liquidity on both platforms meets minimum threshold.
   *
   * @param polySnapshot - Polymarket snapshot
   * @param kalshiSnapshot - Kalshi snapshot
   * @returns true if both platforms have sufficient liquidity
   */
  private validateLiquidity(polySnapshot: MarketSnapshot, kalshiSnapshot: MarketSnapshot): boolean {
    const polyLiquidity = this.extractLiquidity(polySnapshot);
    const kalshiLiquidity = this.extractLiquidity(kalshiSnapshot);

    return polyLiquidity >= this.minLiquidity && kalshiLiquidity >= this.minLiquidity;
  }

  /**
   * Assess settlement risk for cross-platform arbitrage.
   *
   * Phase 1: Always returns HIGH (no settlement parser yet)
   * Phase 3+: Will use settlement rule comparison
   *
   * @returns Settlement risk level
   */
  private assessSettlementRisk(): SettlementRisk {
    // Phase 1: Always HIGH risk - no settlement parser yet
    // Phase 3 will implement settlement rule comparison
    return 'HIGH';
  }

  /**
   * Check if match confidence meets minimum threshold.
   *
   * @param match - Matched market row
   * @returns true if confidence meets threshold
   */
  private meetsConfidenceThreshold(match: MatchedMarketRow): boolean {
    return match.confidence >= MIN_MATCH_CONFIDENCE;
  }

  /**
   * Check if snapshot is valid (exists and not stale).
   *
   * @param snapshot - Market snapshot or null
   * @returns true if snapshot is valid and fresh
   */
  private isValidSnapshot(snapshot: MarketSnapshot | null): boolean {
    if (!snapshot) {
      return false;
    }

    const age = Date.now() - snapshot.timestamp;
    return age <= MAX_SNAPSHOT_AGE_MS;
  }

  /**
   * Extract YES price from snapshot data.
   *
   * @param snapshot - Market snapshot
   * @returns YES price (0-1) or null if not found
   */
  private extractYesPrice(snapshot: MarketSnapshot): number | null {
    const data = snapshot.data as Record<string, unknown>;
    const prices = data.prices as Record<string, number> | undefined;

    if (!prices) {
      return null;
    }

    // Look for YES price (case-insensitive)
    for (const [key, value] of Object.entries(prices)) {
      if (key.toLowerCase() === 'yes') {
        return value;
      }
    }

    return null;
  }

  /**
   * Extract liquidity from snapshot data.
   *
   * @param snapshot - Market snapshot
   * @returns Liquidity value or 0 if not found
   */
  private extractLiquidity(snapshot: MarketSnapshot): number {
    const data = snapshot.data as Record<string, unknown>;
    const liquidity = data.liquidity as number | undefined;
    return liquidity ?? 0;
  }

  /**
   * Calculate opportunity confidence based on edge size and liquidity.
   *
   * - 0.9-1.0: Large edge (>15% net) with deep liquidity
   * - 0.7-0.9: Moderate edge (10-15% net)
   * - <0.7: Low confidence (shouldn't reach here due to filters)
   *
   * @param netEdge - Net edge after fees (0-1)
   * @param polySnapshot - Polymarket snapshot
   * @param kalshiSnapshot - Kalshi snapshot
   * @returns Opportunity confidence (0-1)
   */
  private calculateOpportunityConfidence(
    netEdge: number,
    polySnapshot: MarketSnapshot,
    kalshiSnapshot: MarketSnapshot
  ): number {
    const polyLiquidity = this.extractLiquidity(polySnapshot);
    const kalshiLiquidity = this.extractLiquidity(kalshiSnapshot);
    const minLiquidity = Math.min(polyLiquidity, kalshiLiquidity);

    // Base confidence from net edge
    // 10% -> 0.7, 15% -> 0.85, 20%+ -> 0.95+
    let confidence = 0.7 + (netEdge - 0.10) * 2.5;

    // Liquidity bonus (up to 0.05)
    // Deep liquidity ($10k+) gives full bonus
    const liquidityBonus = Math.min(0.05, (minLiquidity / 10000) * 0.05);
    confidence += liquidityBonus;

    // Cap at 1.0
    return Math.min(1.0, Math.max(0.5, confidence));
  }
}
