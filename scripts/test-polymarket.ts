/**
 * Test script for Polymarket client
 *
 * Run with: npx ts-node scripts/test-polymarket.ts
 *
 * This script tests the Polymarket client functionality.
 * It requires POLYMARKET_PRIVATE_KEY to be set for order book tests.
 */

import { PolymarketClient } from '../src/services/polymarket.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  logger.info('Starting Polymarket client test');

  const client = new PolymarketClient();

  // Test 1: Fetch active markets
  logger.info('Test 1: Fetching active markets from Gamma API...');
  const startTime = Date.now();

  try {
    const markets = await client.getActiveMarkets();
    const duration = Date.now() - startTime;

    logger.info({
      marketCount: markets.length,
      durationMs: duration,
      firstMarket: markets[0]?.question?.substring(0, 50)
    }, 'Successfully fetched markets');

    if (markets.length === 0) {
      logger.warn('No markets returned');
    }

    // Test 2: Rate limiter stats
    const stats = client.getRateLimiterStats();
    logger.info({ stats }, 'Rate limiter stats');

    // Test 3: Fetch order book for first market (if it has tokens)
    const marketWithTokens = markets.find(m => m.metadata?.tokens && (m.metadata.tokens as any[]).length > 0);

    if (marketWithTokens) {
      const tokens = marketWithTokens.metadata?.tokens as { token_id: string; outcome: string }[];
      const tokenId = tokens[0].token_id;

      logger.info({ tokenId, market: marketWithTokens.question }, 'Test 3: Fetching order book...');

      try {
        const orderBook = await client.getOrderBook(tokenId);
        logger.info({
          bidLevels: orderBook.bids.length,
          askLevels: orderBook.asks.length,
          depth: orderBook.depth,
          topBid: orderBook.bids[0],
          topAsk: orderBook.asks[0]
        }, 'Successfully fetched order book');
      } catch (error) {
        logger.error({ error }, 'Failed to fetch order book');
      }
    } else {
      logger.warn('No market with tokens found for order book test');
    }

    logger.info('All tests completed');
  } catch (error) {
    logger.error({ error }, 'Test failed');
    process.exit(1);
  }
}

main();
