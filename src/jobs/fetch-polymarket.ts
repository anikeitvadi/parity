/**
 * Bree worker job: Fetch Polymarket data
 *
 * Runs every 15 minutes to collect market data and order book snapshots
 * from Polymarket. Stores data in SQLite for historical analysis.
 *
 * @module jobs/fetch-polymarket
 */

import { parentPort } from 'worker_threads';
import { PolymarketClient } from '../services/polymarket.js';
import { initDatabase } from '../database/schema.js';
import { insertMany, type MarketSnapshot } from '../database/queries.js';
import { polymarketLogger as logger } from '../utils/logger.js';

// Minimum liquidity threshold for order book fetching (in USD)
const MIN_LIQUIDITY_THRESHOLD = 500;

async function run(): Promise<void> {
  const startTime = Date.now();
  let marketsCount = 0;
  let snapshotsStored = 0;

  try {
    // Initialize database
    initDatabase();

    // Create Polymarket client
    const client = new PolymarketClient();

    // Fetch active markets
    logger.info('Fetching active markets from Polymarket');
    const markets = await client.getActiveMarkets();
    marketsCount = markets.length;
    logger.info({ marketsCount }, 'Fetched markets');

    // Prepare snapshots
    const timestamp = Date.now();
    const snapshots: MarketSnapshot[] = [];

    for (const market of markets) {
      // Only fetch order book for liquid markets
      let orderBookDepth: number | undefined;

      if (market.liquidity && market.liquidity >= MIN_LIQUIDITY_THRESHOLD) {
        try {
          // Get first token ID for order book (typically the "Yes" outcome)
          const tokens = market.metadata?.tokens as Array<{ token_id: string }> | undefined;
          if (tokens && tokens.length > 0) {
            const orderBook = await client.getOrderBook(tokens[0].token_id);
            orderBookDepth = orderBook.depth;
          }
        } catch (error) {
          logger.warn({ marketId: market.id, error }, 'Failed to fetch order book');
        }
      }

      snapshots.push({
        platform: 'polymarket',
        marketId: market.id,
        timestamp,
        data: {
          question: market.question,
          outcomes: market.outcomes,
          prices: market.prices,
          volume: market.volume,
          liquidity: market.liquidity,
          orderBookDepth,
        },
      });
    }

    // Store snapshots in transaction
    if (snapshots.length > 0) {
      insertMany(snapshots);
      snapshotsStored = snapshots.length;
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      { job: 'fetch-polymarket', marketsCount, snapshotsStored, durationMs },
      'Job completed successfully'
    );

    // Report completion to Bree
    if (parentPort) {
      parentPort.postMessage({
        success: true,
        marketsCount,
        snapshotsStored,
        durationMs,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { job: 'fetch-polymarket', error, marketsCount, snapshotsStored, durationMs },
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

// Run the job
run();
