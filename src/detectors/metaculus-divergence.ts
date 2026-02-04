/**
 * Metaculus Divergence Detector
 *
 * Detects opportunities where superforecaster consensus significantly
 * diverges from prediction market prices.
 *
 * @module detectors/metaculus-divergence
 */

import { featureFlags } from '../config/feature-flags.js';
import { MetaculusClient } from '../services/metaculus-client.js';
import { MetaculusMatcher } from '../services/metaculus-matcher.js';
import type { Market } from '../types/market.js';
import type { MetaculusDivergenceOpportunity, ForecastStaleness } from '../types/metaculus.js';
import { logger } from '../utils/logger.js';

const detectorLogger = logger.child({ component: 'metaculus-divergence' });

/** Default minimum divergence percentage threshold */
const DEFAULT_MIN_DIVERGENCE = 5;

/** Staleness threshold in days (forecasts older than this are stale) */
const STALE_THRESHOLD_DAYS = 7;

/** Default matcher confidence threshold */
const DEFAULT_MATCHER_CONFIDENCE = 0.8;

/**
 * Metaculus Divergence Detector
 *
 * Identifies opportunities where superforecaster consensus diverges
 * significantly from prediction market prices, suggesting potential mispricing.
 *
 * Features:
 * - Configurable divergence threshold (default: 5%)
 * - Forecast staleness detection (>7 days triggers warning)
 * - Feature flag gating for safe rollout
 * - Multi-dimensional matching via MetaculusMatcher
 */
export class MetaculusDivergenceDetector {
  private client: MetaculusClient;
  private matcher: MetaculusMatcher;
  private minDivergence: number;

  /**
   * Create a new Metaculus divergence detector.
   *
   * @param token - Metaculus API token (defaults to METACULUS_TOKEN env var)
   * @param minDivergence - Minimum divergence percentage to flag (default: 5)
   * @param matcherConfidence - Minimum confidence for question-to-market matching (default: 0.8)
   *
   * @example
   * ```typescript
   * // Use defaults
   * const detector = new MetaculusDivergenceDetector();
   *
   * // Custom threshold
   * const detector = new MetaculusDivergenceDetector(undefined, 3, 0.9);
   * ```
   */
  constructor(
    token?: string,
    minDivergence: number = DEFAULT_MIN_DIVERGENCE,
    matcherConfidence: number = DEFAULT_MATCHER_CONFIDENCE
  ) {
    this.client = new MetaculusClient(token);
    this.matcher = new MetaculusMatcher(undefined, matcherConfidence);
    this.minDivergence = minDivergence;
  }

  /**
   * Detect divergence opportunities between Metaculus forecasts and market prices.
   *
   * @param markets - Active markets from Polymarket/Kalshi
   * @returns Array of divergence opportunities sorted by divergence percentage descending
   */
  async detect(markets: Market[]): Promise<MetaculusDivergenceOpportunity[]> {
    // Check feature flag FIRST
    if (!featureFlags.metaculusDivergence) {
      detectorLogger.warn('Metaculus divergence detector disabled by feature flag');
      return [];
    }

    try {
      // Fetch open binary questions from Metaculus
      const questions = await this.client.searchQuestions({
        status: 'open',
        forecast_type: 'binary',
        limit: 100,
      });

      if (questions.length === 0) {
        detectorLogger.debug('No Metaculus questions returned');
        return [];
      }

      // Match questions to markets
      const matches = this.matcher.matchToMarkets(questions, markets);

      if (matches.length === 0) {
        detectorLogger.debug('No matches found between Metaculus questions and markets');
        return [];
      }

      const opportunities: MetaculusDivergenceOpportunity[] = [];

      for (const match of matches) {
        const { metaculusQuestion, market, confidence } = match;

        // Skip if no community_prediction available
        if (!metaculusQuestion.community_prediction) {
          detectorLogger.debug(
            { metaculusId: metaculusQuestion.id },
            'Skipping question without community_prediction'
          );
          continue;
        }

        // Extract market price for Yes outcome
        const marketPrice = this.extractMarketPrice(market);
        if (marketPrice === null) {
          detectorLogger.debug(
            { marketId: market.id, platform: market.platform },
            'Skipping market - no Yes price found'
          );
          continue;
        }

        // Calculate divergence
        const metaculusPrediction = metaculusQuestion.community_prediction.q2;
        const { divergencePercent, hasDivergence } = this.calculateDivergence(
          metaculusPrediction,
          marketPrice
        );

        // Skip if divergence below threshold
        if (!hasDivergence) {
          detectorLogger.debug(
            {
              metaculusId: metaculusQuestion.id,
              marketId: market.id,
              divergencePercent,
              threshold: this.minDivergence,
            },
            'Divergence below threshold'
          );
          continue;
        }

        // Check forecast staleness
        const staleness = this.checkStaleness(metaculusQuestion.community_prediction.timestamp);

        // Build opportunity
        const opportunity: MetaculusDivergenceOpportunity = {
          type: 'metaculus_divergence',
          metaculusId: metaculusQuestion.id,
          metaculusTitle: metaculusQuestion.title,
          marketId: market.id,
          marketPlatform: market.platform,
          marketQuestion: market.question,
          metaculusPrediction,
          marketPrice,
          divergencePercent,
          matchConfidence: confidence,
          forecastTimestamp: metaculusQuestion.community_prediction.timestamp,
          forecastAge: staleness.daysOld,
          isFresh: staleness.isFresh,
          stalenessWarning: staleness.warning,
          detectedAt: Date.now(),
        };

        opportunities.push(opportunity);

        detectorLogger.info(
          {
            metaculusId: opportunity.metaculusId,
            marketId: opportunity.marketId,
            platform: opportunity.marketPlatform,
            divergencePercent: opportunity.divergencePercent,
            isFresh: opportunity.isFresh,
            forecastAge: opportunity.forecastAge,
          },
          'Detected Metaculus divergence opportunity'
        );
      }

      // Sort by divergence percentage descending
      opportunities.sort((a, b) => b.divergencePercent - a.divergencePercent);

      detectorLogger.info(
        {
          opportunityCount: opportunities.length,
          questionsChecked: questions.length,
          matchesFound: matches.length,
        },
        'Metaculus divergence detection complete'
      );

      return opportunities;
    } catch (error) {
      detectorLogger.error({ error }, 'Error during Metaculus divergence detection');
      return [];
    }
  }

  /**
   * Check forecast staleness based on timestamp.
   *
   * @param forecastTimestamp - ISO 8601 timestamp of forecast
   * @returns Staleness assessment with warnings
   */
  private checkStaleness(forecastTimestamp: string): ForecastStaleness {
    const lastUpdate = new Date(forecastTimestamp);
    const now = new Date();
    const daysOld = this.daysBetween(lastUpdate, now);

    const isFresh = daysOld <= STALE_THRESHOLD_DAYS;

    let warning: string | undefined;

    if (daysOld > STALE_THRESHOLD_DAYS) {
      if (daysOld <= 14) {
        warning = `Forecast is 7-14 days old - use with caution`;
      } else if (daysOld <= 28) {
        warning = `Forecast is 2-4 weeks old - may be outdated`;
      } else {
        warning = `Forecast is ${daysOld} days old - likely outdated`;
      }
    }

    return {
      isFresh,
      daysOld,
      lastUpdate,
      warning,
    };
  }

  /**
   * Calculate divergence between Metaculus prediction and market price.
   *
   * @param metaculusPrediction - Metaculus community prediction (0-1)
   * @param marketPrice - Market YES price (0-1)
   * @returns Divergence percentage and whether it meets threshold
   */
  private calculateDivergence(
    metaculusPrediction: number,
    marketPrice: number
  ): { divergencePercent: number; hasDivergence: boolean } {
    const divergence = Math.abs(metaculusPrediction - marketPrice);
    const divergencePercent = Math.round(divergence * 100);

    const hasDivergence = divergencePercent >= this.minDivergence;

    return { divergencePercent, hasDivergence };
  }

  /**
   * Extract YES price from market data.
   *
   * @param market - Market data
   * @returns YES price (0-1) or null if not found
   */
  private extractMarketPrice(market: Market): number | null {
    // Look for YES price (case-insensitive)
    for (const [key, value] of Object.entries(market.prices)) {
      if (key.toLowerCase() === 'yes') {
        return value;
      }
    }

    return null;
  }

  /**
   * Calculate the number of days between two dates.
   *
   * @param date1 - Earlier date
   * @param date2 - Later date
   * @returns Number of full days between dates
   */
  private daysBetween(date1: Date, date2: Date): number {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const diffMs = date2.getTime() - date1.getTime();
    return Math.floor(diffMs / MS_PER_DAY);
  }
}
