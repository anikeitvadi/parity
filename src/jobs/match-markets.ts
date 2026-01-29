/**
 * Bree worker job: Match markets across platforms
 *
 * Runs every 30 minutes to identify equivalent markets between
 * Polymarket and Kalshi. Stores matches in SQLite for arbitrage detection.
 *
 * @module jobs/match-markets
 */

import { parentPort } from 'worker_threads';
import { MarketMatcher } from '../services/market-matcher.js';
import { initDatabase } from '../database/schema.js';
import { getRecentSnapshots, insertMatch, getRecentMatches } from '../database/queries.js';
import { matcherLogger as logger } from '../utils/logger.js';
import type { Market } from '../types/market.js';

// Time window for recent snapshots (1 hour in milliseconds)
const SNAPSHOT_WINDOW_MS = 60 * 60 * 1000;

// Minimum confidence for high-confidence matches
const HIGH_CONFIDENCE_THRESHOLD = 0.9;

async function run(): Promise<void> {
  const startTime = Date.now();
  let polyCount = 0;
  let kalshiCount = 0;
  let matchesFound = 0;
  let highConfidenceCount = 0;

  try {
    // Initialize database (creates matched_markets table if not exists)
    initDatabase();

    // Get recent snapshots from both platforms
    const cutoffTime = Date.now() - SNAPSHOT_WINDOW_MS;

    // Get Polymarket snapshots
    const polySnapshots = getRecentSnapshots('polymarket', 500);
    const recentPolySnapshots = polySnapshots.filter((s) => s.timestamp >= cutoffTime);

    // Get Kalshi snapshots
    const kalshiSnapshots = getRecentSnapshots('kalshi', 500);
    const recentKalshiSnapshots = kalshiSnapshots.filter((s) => s.timestamp >= cutoffTime);

    logger.info(
      { polyCount: recentPolySnapshots.length, kalshiCount: recentKalshiSnapshots.length },
      'Loaded recent snapshots'
    );

    // Convert snapshots to Market objects
    const polymarkets: Market[] = recentPolySnapshots.map((snapshot) => ({
      id: snapshot.marketId,
      platform: 'polymarket' as const,
      question: snapshot.data.question as string,
      outcomes: snapshot.data.outcomes as string[],
      prices: snapshot.data.prices as Record<string, number>,
      closeDate: '', // Not stored in snapshot data
      volume: snapshot.data.volume as number | undefined,
      liquidity: snapshot.data.liquidity as number | undefined,
    }));

    const kalshiMarkets: Market[] = recentKalshiSnapshots.map((snapshot) => ({
      id: snapshot.marketId,
      platform: 'kalshi' as const,
      question: snapshot.data.question as string,
      outcomes: snapshot.data.outcomes as string[],
      prices: snapshot.data.prices as Record<string, number>,
      closeDate: '', // Not stored in snapshot data
      volume: snapshot.data.volume as number | undefined,
      liquidity: snapshot.data.liquidity as number | undefined,
    }));

    // Deduplicate markets by ID (keep most recent)
    const uniquePolymarkets = deduplicateMarkets(polymarkets);
    const uniqueKalshiMarkets = deduplicateMarkets(kalshiMarkets);

    polyCount = uniquePolymarkets.length;
    kalshiCount = uniqueKalshiMarkets.length;

    logger.info(
      { polyCount, kalshiCount },
      'Deduplicated markets'
    );

    // Match markets
    const matcher = new MarketMatcher();
    const matches = matcher.matchMarkets(uniquePolymarkets, uniqueKalshiMarkets);
    matchesFound = matches.length;

    // Store matches in database
    for (const match of matches) {
      insertMatch(
        match.polymarket.id,
        match.kalshi.id,
        match.confidence,
        match.method
      );

      if (match.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        highConfidenceCount++;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        job: 'match-markets',
        polyCount,
        kalshiCount,
        matchesFound,
        highConfidenceCount,
        durationMs,
      },
      'Job completed successfully'
    );

    // Report completion to Bree
    if (parentPort) {
      parentPort.postMessage({
        success: true,
        polyCount,
        kalshiCount,
        matchesFound,
        highConfidenceCount,
        durationMs,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      {
        job: 'match-markets',
        error,
        polyCount,
        kalshiCount,
        matchesFound,
        durationMs,
      },
      'Job failed'
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

/**
 * Deduplicate markets by ID, keeping the first occurrence (most recent due to sort order)
 */
function deduplicateMarkets(markets: Market[]): Market[] {
  const seen = new Set<string>();
  const unique: Market[] = [];

  for (const market of markets) {
    if (!seen.has(market.id)) {
      seen.add(market.id);
      unique.push(market);
    }
  }

  return unique;
}

// Run the job
run();
