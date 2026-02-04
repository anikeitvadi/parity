/**
 * Opportunity Aggregator
 *
 * Combines outputs from all detectors and normalizes to UnifiedOpportunity format.
 * Enforces feature flag checks for gated detectors (cross-platform arb).
 *
 * @module aggregator/opportunity-aggregator
 */

import { createHash } from 'crypto';
import { UnifiedOpportunity, Platform, OpportunityType } from '../scoring/types.js';
import { MultiOutcomeArbDetector, ArbOpportunity } from '../detectors/multi-outcome-arb.js';
import { CorrelatedMarketsDetector, CorrelatedOpportunity } from '../detectors/correlated-markets.js';
import { CrossPlatformArbDetector, CrossPlatformOpportunity } from '../detectors/cross-platform-arb.js';
import { MetaculusDivergenceDetector } from '../detectors/metaculus-divergence.js';
import type { MetaculusDivergenceOpportunity } from '../types/metaculus.js';
import { featureFlags } from '../config/feature-flags.js';
import { logger } from '../utils/logger.js';

const aggregatorLogger = logger.child({ component: 'opportunity-aggregator' });

/**
 * Result of aggregation including opportunities and any errors
 */
export interface AggregationResult {
  /** Normalized opportunities from all active detectors */
  opportunities: UnifiedOpportunity[];
  /** Errors encountered (detector failures don't crash aggregation) */
  errors: AggregationError[];
  /** Timestamp of aggregation */
  timestamp: number;
  /** Stats about which detectors ran */
  stats: AggregationStats;
}

/**
 * Error from a detector that didn't crash the aggregation
 */
export interface AggregationError {
  /** Which detector failed */
  detector: string;
  /** Error message */
  message: string;
  /** Error timestamp */
  timestamp: number;
}

/**
 * Statistics about the aggregation run
 */
export interface AggregationStats {
  /** Counts per detector */
  detectorCounts: {
    multiOutcomePolymarket: number;
    multiOutcomeKalshi: number;
    correlatedMarkets: number;
    crossPlatform: number;
    metaculusDivergence: number;
  };
  /** Total opportunities before any deduplication */
  totalRaw: number;
  /** Which detectors were skipped (and why) */
  skipped: { detector: string; reason: string }[];
}

/**
 * Configuration for the aggregator
 */
export interface AggregatorConfig {
  /** Multi-outcome detector config */
  multiOutcome?: {
    minNetEdge?: number;
    minLiquidityPerOutcome?: number;
    feePercent?: number;
  };
  /** Correlated markets detector config */
  correlated?: {
    minEdgePercent?: number;
    minLiquidity?: number;
  };
  /** Cross-platform detector config */
  crossPlatform?: {
    minNetEdge?: number;
    minLiquidity?: number;
  };
  /** Metaculus divergence detector config */
  metaculus?: {
    minDivergence?: number;
    matcherConfidence?: number;
  };
}

/**
 * Default fees per platform (used for net edge calculation)
 */
const DEFAULT_FEES: Record<Platform | 'cross', number> = {
  polymarket: 0.02,
  kalshi: 0.07,
  cross: 0.09, // Combined fees for cross-platform
};

/**
 * Opportunity Aggregator
 *
 * Aggregates opportunities from all active detectors, normalizes to
 * UnifiedOpportunity format, and handles errors gracefully.
 *
 * Safety:
 * - Cross-platform detector is ONLY called when featureFlags.crossPlatformArb is true
 * - Individual detector failures don't crash the aggregation
 *
 * @example
 * ```typescript
 * const aggregator = new OpportunityAggregator();
 * const result = await aggregator.aggregate(polyMarkets, kalshiMarkets);
 *
 * // result.opportunities: UnifiedOpportunity[]
 * // result.errors: any detector failures
 * // result.stats: counts per detector
 * ```
 */
export class OpportunityAggregator {
  private multiOutcomeDetector: MultiOutcomeArbDetector;
  private correlatedDetector: CorrelatedMarketsDetector;
  private crossPlatformDetector: CrossPlatformArbDetector;
  private metaculusDetector: MetaculusDivergenceDetector;

  /**
   * Create a new aggregator with optional detector configuration
   *
   * @param config - Configuration overrides for detectors
   */
  constructor(config: AggregatorConfig = {}) {
    this.multiOutcomeDetector = new MultiOutcomeArbDetector(
      config.multiOutcome?.minNetEdge,
      config.multiOutcome?.minLiquidityPerOutcome,
      config.multiOutcome?.feePercent
    );

    this.correlatedDetector = new CorrelatedMarketsDetector(
      config.correlated?.minEdgePercent,
      config.correlated?.minLiquidity
    );

    this.crossPlatformDetector = new CrossPlatformArbDetector(
      config.crossPlatform?.minNetEdge,
      config.crossPlatform?.minLiquidity
    );

    this.metaculusDetector = new MetaculusDivergenceDetector(
      process.env.METACULUS_TOKEN,
      config.metaculus?.minDivergence,
      config.metaculus?.matcherConfidence
    );
  }

  /**
   * Aggregate opportunities from all active detectors
   *
   * Runs each detector, normalizes outputs, and collects errors without crashing.
   *
   * @param polymarketMarkets - Markets from Polymarket (for correlated detector)
   * @param kalshiMarkets - Markets from Kalshi (for correlated detector)
   * @returns Aggregation result with opportunities, errors, and stats
   */
  async aggregate(
    polymarketMarkets: import('../types/market.js').Market[] = [],
    kalshiMarkets: import('../types/market.js').Market[] = []
  ): Promise<AggregationResult> {
    const opportunities: UnifiedOpportunity[] = [];
    const errors: AggregationError[] = [];
    const skipped: { detector: string; reason: string }[] = [];
    const timestamp = Date.now();

    const stats: AggregationStats = {
      detectorCounts: {
        multiOutcomePolymarket: 0,
        multiOutcomeKalshi: 0,
        correlatedMarkets: 0,
        crossPlatform: 0,
        metaculusDivergence: 0,
      },
      totalRaw: 0,
      skipped: [],
    };

    // 1. Multi-outcome arb detector for Polymarket
    try {
      const polyMultiOutcome = await this.multiOutcomeDetector.detect('polymarket');
      const normalized = polyMultiOutcome.map((opp) =>
        this.normalizeMultiOutcome(opp, 'polymarket')
      );
      opportunities.push(...normalized);
      stats.detectorCounts.multiOutcomePolymarket = normalized.length;
      aggregatorLogger.debug(
        { count: normalized.length },
        'Multi-outcome Polymarket complete'
      );
    } catch (error) {
      errors.push({
        detector: 'multi-outcome-polymarket',
        message: error instanceof Error ? error.message : String(error),
        timestamp,
      });
      aggregatorLogger.error({ error }, 'Multi-outcome Polymarket detector failed');
    }

    // 2. Multi-outcome arb detector for Kalshi
    try {
      const kalshiMultiOutcome = await this.multiOutcomeDetector.detect('kalshi');
      const normalized = kalshiMultiOutcome.map((opp) =>
        this.normalizeMultiOutcome(opp, 'kalshi')
      );
      opportunities.push(...normalized);
      stats.detectorCounts.multiOutcomeKalshi = normalized.length;
      aggregatorLogger.debug(
        { count: normalized.length },
        'Multi-outcome Kalshi complete'
      );
    } catch (error) {
      errors.push({
        detector: 'multi-outcome-kalshi',
        message: error instanceof Error ? error.message : String(error),
        timestamp,
      });
      aggregatorLogger.error({ error }, 'Multi-outcome Kalshi detector failed');
    }

    // 3. Correlated markets detector (runs on provided markets)
    try {
      const allMarkets = [...polymarketMarkets, ...kalshiMarkets];
      const correlatedOpps = this.correlatedDetector.detectFromMarkets(allMarkets);
      const normalized = correlatedOpps.map((opp) =>
        this.normalizeCorrelated(opp)
      );
      opportunities.push(...normalized);
      stats.detectorCounts.correlatedMarkets = normalized.length;
      aggregatorLogger.debug(
        { count: normalized.length },
        'Correlated markets detector complete'
      );
    } catch (error) {
      errors.push({
        detector: 'correlated-markets',
        message: error instanceof Error ? error.message : String(error),
        timestamp,
      });
      aggregatorLogger.error({ error }, 'Correlated markets detector failed');
    }

    // 4. Cross-platform arb detector
    // CRITICAL: Double-check feature flag before calling
    // Even if detector has its own check, aggregator must also verify
    if (!featureFlags.crossPlatformArb) {
      skipped.push({
        detector: 'cross-platform',
        reason: 'Feature flag crossPlatformArb is disabled (requires Phase 3)',
      });
      aggregatorLogger.debug('Cross-platform detector skipped (feature flag disabled)');
    } else {
      try {
        const crossPlatformOpps = await this.crossPlatformDetector.detect();
        const normalized = crossPlatformOpps.map((opp) =>
          this.normalizeCrossPlatform(opp)
        );
        opportunities.push(...normalized);
        stats.detectorCounts.crossPlatform = normalized.length;
        aggregatorLogger.debug(
          { count: normalized.length },
          'Cross-platform detector complete'
        );
      } catch (error) {
        errors.push({
          detector: 'cross-platform',
          message: error instanceof Error ? error.message : String(error),
          timestamp,
        });
        aggregatorLogger.error({ error }, 'Cross-platform detector failed');
      }
    }

    // 5. Metaculus divergence detector
    // CRITICAL: Double-check feature flag before calling
    if (!featureFlags.metaculusDivergence) {
      skipped.push({
        detector: 'metaculus-divergence',
        reason: 'Feature flag metaculusDivergence is disabled (requires Phase 4)',
      });
      aggregatorLogger.debug('Metaculus divergence detector skipped (feature flag disabled)');
    } else {
      try {
        const allMarkets = [...polymarketMarkets, ...kalshiMarkets];
        const metaculusOpps = await this.metaculusDetector.detect(allMarkets);
        const normalized = metaculusOpps.map((opp) =>
          this.normalizeMetaculusDivergence(opp)
        );
        opportunities.push(...normalized);
        stats.detectorCounts.metaculusDivergence = normalized.length;
        aggregatorLogger.debug(
          { count: normalized.length },
          'Metaculus divergence detector complete'
        );
      } catch (error) {
        errors.push({
          detector: 'metaculus-divergence',
          message: error instanceof Error ? error.message : String(error),
          timestamp,
        });
        aggregatorLogger.error({ error }, 'Metaculus divergence detector failed');
      }
    }

    stats.skipped = skipped;
    stats.totalRaw = opportunities.length;

    aggregatorLogger.info(
      {
        totalOpportunities: opportunities.length,
        errorCount: errors.length,
        skippedDetectors: skipped.length,
        detectorCounts: stats.detectorCounts,
      },
      'Aggregation complete'
    );

    return {
      opportunities,
      errors,
      timestamp,
      stats,
    };
  }

  /**
   * Generate unique ID for an opportunity
   *
   * @param type - Opportunity type
   * @param platform - Platform
   * @param marketId - Market ID
   * @returns Unique hash ID
   */
  private generateId(
    type: OpportunityType,
    platform: Platform | 'cross',
    marketId: string
  ): string {
    const key = `${type}:${platform}:${marketId}`;
    return createHash('md5').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Normalize multi-outcome arb detector output to UnifiedOpportunity
   *
   * @param opp - Multi-outcome arb opportunity
   * @param platform - Platform (polymarket or kalshi)
   * @returns Normalized UnifiedOpportunity
   */
  private normalizeMultiOutcome(
    opp: ArbOpportunity,
    platform: Platform
  ): UnifiedOpportunity {
    // Multi-outcome detector uses percentage (e.g., 5 = 5%)
    // UnifiedOpportunity uses 0-1 scale (e.g., 0.05 = 5%)
    const grossEdge = opp.grossEdge / 100;
    const netEdge = opp.netEdge / 100;
    const platformFee = DEFAULT_FEES[platform];

    return {
      id: this.generateId('multi_outcome', platform, opp.marketId),
      type: 'multi_outcome',
      platform,
      marketId: opp.marketId,
      marketQuestion: opp.question,
      grossEdge,
      netEdge,
      detectorConfidence: opp.confidence,
      minLiquidity: opp.minLiquidity,
      liquidityDepth: opp.outcomeCount,
      detectedAt: opp.timestamp * 1000, // Convert seconds to ms
      raw: opp,
    };
  }

  /**
   * Normalize correlated markets detector output to UnifiedOpportunity
   *
   * @param opp - Correlated opportunity
   * @returns Normalized UnifiedOpportunity
   */
  private normalizeCorrelated(opp: CorrelatedOpportunity): UnifiedOpportunity {
    // Correlated detector uses percentage (e.g., 5 = 5%)
    // UnifiedOpportunity uses 0-1 scale (e.g., 0.05 = 5%)
    const grossEdge = opp.edgeSize / 100;
    const platform = opp.market.platform as Platform;
    const platformFee = DEFAULT_FEES[platform];
    const netEdge = Math.max(0, grossEdge - platformFee * opp.market.outcomes.length);

    return {
      id: this.generateId('correlated', platform, opp.market.id),
      type: 'correlated',
      platform,
      marketId: opp.market.id,
      marketQuestion: opp.market.question,
      grossEdge,
      netEdge,
      detectorConfidence: opp.confidence,
      minLiquidity: opp.market.liquidity ?? 0,
      liquidityDepth: opp.market.outcomes.length,
      detectedAt: opp.timestamp,
      closeDate: opp.market.closeDate,
      raw: opp,
    };
  }

  /**
   * Normalize cross-platform arb detector output to UnifiedOpportunity
   *
   * @param opp - Cross-platform opportunity
   * @returns Normalized UnifiedOpportunity
   */
  private normalizeCrossPlatform(opp: CrossPlatformOpportunity): UnifiedOpportunity {
    // Cross-platform detector already uses 0-1 scale
    // Use polymarket ID as the primary market ID (it's the primary platform)
    const minLiquidity = Math.min(opp.polymarketLiquidity, opp.kalshiLiquidity);

    return {
      id: this.generateId('cross_platform', 'cross', opp.polymarketId),
      type: 'cross_platform',
      platform: 'cross',
      marketId: opp.polymarketId,
      marketQuestion: `Cross-platform: ${opp.polymarketId} <-> ${opp.kalshiTicker}`,
      grossEdge: opp.grossEdge,
      netEdge: opp.netEdge,
      detectorConfidence: opp.opportunityConfidence,
      matchConfidence: opp.matchConfidence,
      minLiquidity,
      liquidityDepth: 2, // Two platforms
      detectedAt: opp.detectedAt,
      raw: opp,
    };
  }

  /**
   * Normalize Metaculus divergence detector output to UnifiedOpportunity
   *
   * @param opp - Metaculus divergence opportunity
   * @returns Normalized UnifiedOpportunity
   */
  private normalizeMetaculusDivergence(opp: MetaculusDivergenceOpportunity): UnifiedOpportunity {
    return {
      id: this.generateId('metaculus_divergence', opp.marketPlatform, opp.marketId),
      type: 'metaculus_divergence',
      platform: opp.marketPlatform,
      marketId: opp.marketId,
      marketQuestion: opp.marketQuestion,
      grossEdge: opp.divergencePercent / 100,
      netEdge: opp.divergencePercent / 100, // No fees for divergence signal
      detectorConfidence: opp.isFresh ? 0.9 : 0.6, // Lower confidence for stale forecasts
      matchConfidence: opp.matchConfidence,
      minLiquidity: 0, // Not applicable for divergence
      liquidityDepth: 1,
      detectedAt: opp.detectedAt,
      raw: opp,
    };
  }
}
