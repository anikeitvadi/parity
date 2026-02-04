/**
 * Bree worker job: Fetch Polymarket data
 *
 * Runs every 15 minutes to collect market data and order book snapshots
 * from Polymarket. Stores data in SQLite for historical analysis.
 *
 * Collects bid/ask prices from order books for arbitrage detection.
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

// Token metadata type
interface TokenInfo {
  token_id: string;
  outcome: string;
}

async function run(): Promise<void> {
  const startTime = Date.now();
  let marketsCount = 0;
  let snapshotsStored = 0;
  let orderBooksCollected = 0;

  try {
    // Initialize database
    initDatabase();

    // Create Polymarket client and initialize CLOB
    const client = new PolymarketClient();
    await client.initialize();

    // Fetch active markets
    logger.info('Fetching active markets from Polymarket');
    const markets = await client.getActiveMarkets();
    marketsCount = markets.length;
    logger.info({ marketsCount }, 'Fetched markets');

    // Prepare snapshots
    const timestamp = Date.now();
    const snapshots: MarketSnapshot[] = [];

    for (const market of markets) {
      // Initialize bid/ask prices from mid-market prices (fallback)
      const askPrices: Record<string, number> = { ...market.prices };
      const bidPrices: Record<string, number> = { ...market.prices };
      const liquidity: Record<string, number> = {};
      let hasOrderBook = false;

      // Fetch order books for liquid markets
      if (market.liquidity && market.liquidity >= MIN_LIQUIDITY_THRESHOLD) {
        // Get token IDs from CLOB API (Gamma API doesn't include them)
        const clobMarket = await client.getMarketDetails(market.id);
        const tokens = clobMarket?.tokens;

        if (tokens && tokens.length > 0) {
          for (const token of tokens) {
            if (!token.token_id) continue;

            try {
              const orderBook = await client.getOrderBook(token.token_id);

              // Best ask = lowest ask price (what you pay to buy)
              if (orderBook.asks.length > 0) {
                askPrices[token.outcome] = orderBook.asks[0].price;
              }

              // Best bid = highest bid price (what you get when selling)
              if (orderBook.bids.length > 0) {
                bidPrices[token.outcome] = orderBook.bids[0].price;
              }

              // Calculate liquidity at best price (top of book)
              const askLiq = orderBook.asks.slice(0, 3).reduce((sum, a) => sum + a.size * a.price, 0);
              const bidLiq = orderBook.bids.slice(0, 3).reduce((sum, b) => sum + b.size * b.price, 0);
              liquidity[token.outcome] = Math.min(askLiq, bidLiq);

              hasOrderBook = true;
            } catch (error) {
              logger.debug({ marketId: market.id, outcome: token.outcome, error }, 'Order book fetch failed');
            }
          }

          if (hasOrderBook) {
            orderBooksCollected++;
          }
        }
      }

      // If no order book data, use market liquidity distributed evenly
      if (!hasOrderBook && market.liquidity) {
        const perOutcome = market.liquidity / market.outcomes.length;
        for (const outcome of market.outcomes) {
          liquidity[outcome] = perOutcome;
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
          askPrices,
          bidPrices,
          liquidity,
          volume: market.volume,
          totalLiquidity: market.liquidity,
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
      { job: 'fetch-polymarket', marketsCount, snapshotsStored, orderBooksCollected, durationMs },
      'Job completed successfully'
    );

    // Report completion to Bree
    if (parentPort) {
      parentPort.postMessage({
        success: true,
        marketsCount,
        snapshotsStored,
        orderBooksCollected,
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
