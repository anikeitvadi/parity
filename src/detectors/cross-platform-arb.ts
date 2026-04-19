/**
 * Cross-Platform Arbitrage Detector
 *
 * Detects arbitrage opportunities across Polymarket and Kalshi for matched
 * markets. Gated by feature flag and guarded by settlement rule comparison
 * to prevent losses from resolution divergence.
 *
 * @module detectors/cross-platform-arb
 */

import { featureFlags } from '../config/feature-flags.js';
import { getRecentMatches, getLatestSnapshot, MarketSnapshot, saveSettlementComparison, getSettlementComparison } from '../database/queries.js';
import { logger } from '../utils/logger.js';
import { SettlementComparator } from '../services/settlement-comparator.js';
import { PolymarketSettlementParser, type PolymarketMarketData } from '../parsers/polymarket-parser.js';
import { KalshiSettlementParser, type KalshiMarketData } from '../parsers/kalshi-parser.js';
import type { SettlementComparison } from '../types/settlement.js';

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
  /** Settlement comparison details (for display) */
  settlementComparison?: {
    overall: number;
    criteria: number;
    riskFactors: string[];
  };
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
 * Gated by feature flag; uses settlement rule comparison before flagging opportunities.
 */
export class CrossPlatformArbDetector {
  private minNetEdge: number;
  private minLiquidity: number;
  private polymarketFee: number;
  private kalshiFee: number;
  private settlementComparator = new SettlementComparator();
  private polyParser = new PolymarketSettlementParser();
  private kalshiParser = new KalshiSettlementParser();

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

        // Assess settlement risk using comparator
        const { risk: settlementRisk, comparison } = await this.assessSettlementRisk(
          polySnapshot!,
          kalshiSnapshot!
        );

        // Skip if settlement verification failed or unsafe
        if (settlementRisk === 'HIGH') {
          detectorLogger.debug(
            {
              polymarketId: match.polymarket_id,
              kalshiTicker: match.kalshi_ticker,
              settlementRisk,
              riskFactors: comparison?.riskFactors,
            },
            'Skipping match - settlement risk too high'
          );
          continue;
        }

        // Apply score penalty for MEDIUM risk (different settlement mechanisms)
        // Deduct 2-3 points based on severity of mechanism differences
        let scorePenalty = 0;
        if (settlementRisk === 'MEDIUM' && comparison) {
          // 2 points if minor differences, 3 points if mechanism type differs
          const hasMechanismDifference = comparison.riskFactors.some(
            rf => rf.includes('mechanism') || rf.includes('UMA') || rf.includes('centralized')
          );
          scorePenalty = hasMechanismDifference ? 3 : 2;
        }

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
          settlementComparison: comparison ? {
            overall: comparison.similarity.overall,
            criteria: comparison.similarity.criteria,
            riskFactors: comparison.riskFactors,
          } : undefined,
        };

        opportunities.push(opportunity);

        detectorLogger.info(
          {
            polymarketId: opportunity.polymarketId,
            kalshiTicker: opportunity.kalshiTicker,
            grossEdge: (grossEdge * 100).toFixed(2) + '%',
            netEdge: (netEdge * 100).toFixed(2) + '%',
            settlementRisk,
            scorePenalty,
            settlementSimilarity: comparison ? {
              overall: comparison.similarity.overall.toFixed(2),
              criteria: comparison.similarity.criteria.toFixed(2),
            } : undefined,
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
   * Assess settlement risk using settlement comparator.
   *
   * Phase 3+: Uses actual settlement rule comparison.
   *
   * @param polySnapshot - Polymarket market snapshot
   * @param kalshiSnapshot - Kalshi market snapshot
   * @returns Settlement risk level and comparison result
   */
  private async assessSettlementRisk(
    polySnapshot: MarketSnapshot,
    kalshiSnapshot: MarketSnapshot
  ): Promise<{ risk: SettlementRisk; comparison: SettlementComparison | null }> {
    try {
      // Check for existing comparison first (cached)
      const existing = getSettlementComparison(
        polySnapshot.marketId,
        kalshiSnapshot.marketId
      );

      if (existing) {
        // Use cached comparison
        const risk = this.comparisonToRisk(existing);
        return { risk, comparison: existing };
      }

      // Parse market data into settlement criteria
      const polyData = this.snapshotToPolymarketData(polySnapshot);
      const kalshiData = this.snapshotToKalshiData(kalshiSnapshot);

      const polyCriteria = this.polyParser.parse(polyData);
      const kalshiCriteria = this.kalshiParser.parse(kalshiData);

      // Run comparison
      const comparison = this.settlementComparator.compare(polyCriteria, kalshiCriteria);

      // Cache the comparison
      saveSettlementComparison(comparison);

      const risk = this.comparisonToRisk(comparison);
      return { risk, comparison };
    } catch (error) {
      detectorLogger.warn(
        { error, polyId: polySnapshot.marketId, kalshiId: kalshiSnapshot.marketId },
        'Failed to assess settlement risk, defaulting to HIGH'
      );
      return { risk: 'HIGH', comparison: null };
    }
  }

  /**
   * Convert settlement comparison to risk level.
   *
   * Score penalties:
   * - MEDIUM risk (different settlement mechanisms like UMA vs centralized): 2-3 point penalty
   * - HIGH risk (unsafe for arbitrage): skip entirely
   */
  private comparisonToRisk(comparison: SettlementComparison): SettlementRisk {
    if (comparison.safeForArbitrage) {
      // Even if safe, check for risk factors
      if (comparison.riskFactors.length === 0) {
        return 'LOW';
      }
      return 'MEDIUM';
    }

    return 'HIGH';
  }

  /**
   * Convert snapshot to Polymarket market data for parsing.
   *
   * Note: Uses available fields from MarketSnapshot.data. If settlement-specific
   * fields (description, resolution_source) are not stored by fetch job, falls back
   * to question-only parsing with reduced confidence.
   */
  private snapshotToPolymarketData(snapshot: MarketSnapshot): PolymarketMarketData {
    const data = snapshot.data as Record<string, unknown>;
    return {
      id: snapshot.marketId,
      question: data.question as string,
      // Optional fields - may not be present in current snapshot schema
      description: (data.description as string | undefined) || undefined,
      outcomes: data.outcomes as string[],
      end_date_iso: data.closeDate as string | undefined,
      resolution_source: (data.resolution_source as string | undefined) || undefined,
    };
  }

  /**
   * Convert snapshot to Kalshi market data for parsing.
   *
   * Note: Uses available fields from MarketSnapshot.data. If settlement-specific
   * fields (rules_primary, rules_secondary, settlement_source_url) are not stored
   * by fetch job, falls back to question-only parsing with reduced confidence.
   */
  private snapshotToKalshiData(snapshot: MarketSnapshot): KalshiMarketData {
    const data = snapshot.data as Record<string, unknown>;
    return {
      ticker: snapshot.marketId,
      title: data.question as string,
      // Primary rule: use rules_primary if available, else fall back to question
      rules_primary: (data.rules_primary as string) || data.question as string,
      // Optional fields - may not be present in current snapshot schema
      rules_secondary: (data.rules_secondary as string | undefined) || undefined,
      expiration_time: data.closeDate as string | undefined,
      settlement_source_url: (data.settlement_source_url as string | undefined) || undefined,
    };
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
