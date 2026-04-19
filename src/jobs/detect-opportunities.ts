/**
 * Bree worker job: Detect opportunities
 *
 * Runs every 30 minutes to aggregate opportunities from all detectors,
 * score them, and persist high-quality opportunities to the database.
 *
 * Environment variables:
 * - BANKROLL: Trading capital in USD (default: 500)
 * - MIN_SCORE: Minimum score threshold for persistence (default: 5)
 *
 * @module jobs/detect-opportunities
 */

import { parentPort } from 'worker_threads';
import { OpportunityAggregator } from '../aggregator/opportunity-aggregator.js';
import { scoreOpportunity } from '../scoring/index.js';
import { initDatabase } from '../database/schema.js';
import { insertOpportunities } from '../database/queries.js';
import { logger } from '../utils/logger.js';
import type { ScoredOpportunity } from '../scoring/types.js';

// Configuration from environment
const BANKROLL = Number(process.env.BANKROLL) || 500;
const MIN_SCORE = Number(process.env.MIN_SCORE) || 5;

const jobLogger = logger.child({ job: 'detect-opportunities' });

async function run(): Promise<void> {
  const startTime = Date.now();
  let detectedCount = 0;
  let scoredCount = 0;
  let persistedCount = 0;

  try {
    // Initialize database
    initDatabase();

    // Create aggregator and detect opportunities
    const aggregator = new OpportunityAggregator();
    jobLogger.info({ bankroll: BANKROLL, minScore: MIN_SCORE }, 'Starting opportunity detection');

    const result = await aggregator.aggregate();
    detectedCount = result.opportunities.length;

    // Log settlement verification results for cross-platform opportunities
    const crossPlatformOpps = result.opportunities.filter(o => o.type === 'cross_platform');
    if (crossPlatformOpps.length > 0) {
      const lowRisk = crossPlatformOpps.filter(o => {
        const raw = o.raw as any;
        return raw.settlementRisk === 'LOW';
      }).length;
      const mediumRisk = crossPlatformOpps.filter(o => {
        const raw = o.raw as any;
        return raw.settlementRisk === 'MEDIUM';
      }).length;

      jobLogger.info(
        {
          crossPlatformCount: crossPlatformOpps.length,
          withLowRisk: lowRisk,
          withMediumRisk: mediumRisk,
        },
        'Cross-platform detection complete with settlement verification'
      );
    }

    // Score opportunities that meet threshold
    const scoredOpportunities: ScoredOpportunity[] = [];

    for (const opp of result.opportunities) {
      const scored = scoreOpportunity(opp, BANKROLL);
      if (scored && scored.score >= MIN_SCORE) {
        scoredOpportunities.push(scored);
      }
    }

    scoredCount = scoredOpportunities.length;

    // Persist to database
    if (scoredOpportunities.length > 0) {
      insertOpportunities(scoredOpportunities);
      persistedCount = scoredOpportunities.length;
      jobLogger.info(
        { count: persistedCount, topScore: Math.max(...scoredOpportunities.map(o => o.score)) },
        'Persisted opportunities to database'
      );
    }

    const durationMs = Date.now() - startTime;

    // Log detector errors if any
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        jobLogger.warn({ detector: err.detector, error: err.message }, 'Detector error');
      }
    }

    jobLogger.info(
      {
        detected: detectedCount,
        scored: scoredCount,
        persisted: persistedCount,
        errors: result.errors.length,
        skipped: result.stats.skipped.length,
        durationMs,
      },
      'Opportunity detection complete'
    );

    // Report completion to Bree
    if (parentPort) {
      parentPort.postMessage({
        success: true,
        detected: detectedCount,
        scored: scoredCount,
        persisted: persistedCount,
        errors: result.errors.length,
        durationMs,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    jobLogger.error(
      { error, detected: detectedCount, scored: scoredCount, persisted: persistedCount, durationMs },
      'Opportunity detection failed'
    );

    // Report error to Bree
    if (parentPort) {
      parentPort.postMessage({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });
    }
  }
}

// Run the job
run();
