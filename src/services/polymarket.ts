import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import { z } from 'zod';
import { env } from '../config/env.js';
import { polymarketLogger as logger } from '../utils/logger.js';
import { createPolymarketLimiter, RateLimiter } from '../utils/rate-limiter.js';
import type { Market, OrderBook, OrderBookLevel } from '../types/market.js';

// Polygon mainnet chain ID
const POLYGON_CHAIN_ID = 137;
const CLOB_HOST = 'https://clob.polymarket.com';
const GAMMA_API_HOST = 'https://gamma-api.polymarket.com';

/**
 * Zod schema for Polymarket market response from Gamma API
 * Based on 01-RESEARCH.md lines 257-286
 */
const PolymarketMarketSchema = z.object({
  id: z.string().optional(),
  condition_id: z.string(),
  question_id: z.string().optional(),
  question: z.string(),
  end_date_iso: z.string().optional(),
  game_start_time: z.string().optional(),
  outcomes: z.array(z.string()).optional(),
  outcomePrices: z.string().optional(),
  tokens: z
    .array(
      z.object({
        token_id: z.string(),
        outcome: z.string(),
        price: z.union([z.string(), z.number()]).optional(),
      })
    )
    .optional(),
  volume: z.union([z.string(), z.number()]).optional(),
  liquidity: z.union([z.string(), z.number()]).optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  accepting_orders: z.boolean().optional(),
});

type PolymarketMarketResponse = z.infer<typeof PolymarketMarketSchema>;

/**
 * Zod schema for CLOB order book response
 */
const OrderBookResponseSchema = z.object({
  bids: z.array(
    z.object({
      price: z.string(),
      size: z.string(),
    })
  ),
  asks: z.array(
    z.object({
      price: z.string(),
      size: z.string(),
    })
  ),
  hash: z.string().optional(),
  timestamp: z.string().optional(),
});

/**
 * Polymarket client for fetching market data and order books.
 * Uses the official @polymarket/clob-client for CLOB operations
 * and the Gamma API for market data.
 */
export class PolymarketClient {
  private clobClient: ClobClient | null = null;
  private wallet: Wallet;
  private rateLimiter: RateLimiter;
  private initialized = false;

  constructor() {
    // Create wallet from private key
    const privateKey = env.POLYMARKET_PRIVATE_KEY.startsWith('0x')
      ? env.POLYMARKET_PRIVATE_KEY
      : `0x${env.POLYMARKET_PRIVATE_KEY}`;
    this.wallet = new Wallet(privateKey);

    // Initialize rate limiter
    this.rateLimiter = createPolymarketLimiter();

    logger.info(
      { address: this.wallet.address },
      'PolymarketClient created with wallet'
    );
  }

  /**
   * Initialize the CLOB client with authentication.
   * Must be called before using order book methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize CLOB client
      // The client handles API key derivation from the wallet signature
      this.clobClient = new ClobClient(
        CLOB_HOST,
        POLYGON_CHAIN_ID,
        this.wallet
      );

      this.initialized = true;
      logger.info('CLOB client initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize CLOB client');
      throw error;
    }
  }

  /**
   * Fetch active markets from the Gamma API.
   * Returns normalized Market[] array.
   */
  async getActiveMarkets(): Promise<Market[]> {
    const startTime = Date.now();

    try {
      const response = await this.rateLimiter.execute(async () => {
        const res = await fetch(`${GAMMA_API_HOST}/markets?closed=false&active=true`);
        if (!res.ok) {
          const error = new Error(`Gamma API error: ${res.status} ${res.statusText}`) as Error & { status?: number };
          error.status = res.status;
          throw error;
        }
        return res.json();
      });

      // Validate response with Zod
      const parseResult = z.array(PolymarketMarketSchema).safeParse(response);

      if (!parseResult.success) {
        logger.error(
          { error: parseResult.error.issues },
          'Invalid Gamma API response schema'
        );
        throw new Error('API validation failed');
      }

      // Transform to normalized Market format
      const markets = parseResult.data
        .filter((m) => m.active !== false && m.closed !== true)
        .map((m) => this.transformMarket(m));

      const duration = Date.now() - startTime;
      logger.info(
        { marketCount: markets.length, durationMs: duration },
        'Fetched active markets from Gamma API'
      );

      return markets;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch active markets');
      throw error;
    }
  }

  /**
   * Get order book for a specific market token.
   * Returns order book with bid/ask levels and total depth.
   *
   * @param tokenId - The token ID (not market ID) for the outcome
   */
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    if (!this.clobClient) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      const response = await this.rateLimiter.execute(async () => {
        const book = await this.clobClient!.getOrderBook(tokenId);
        return book;
      });

      // Validate response
      const parseResult = OrderBookResponseSchema.safeParse(response);

      if (!parseResult.success) {
        logger.warn(
          { error: parseResult.error.issues, tokenId },
          'Order book response validation failed, using raw data'
        );
      }

      // Transform to normalized OrderBook format
      const bids: OrderBookLevel[] = (response.bids || []).map((b: { price: string; size: string }) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      }));

      const asks: OrderBookLevel[] = (response.asks || []).map((a: { price: string; size: string }) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      }));

      // Calculate depth: sum of first 5 levels on each side
      const bidDepth = bids.slice(0, 5).reduce((sum, b) => sum + b.size * b.price, 0);
      const askDepth = asks.slice(0, 5).reduce((sum, a) => sum + a.size * (1 - a.price), 0);
      const totalDepth = bidDepth + askDepth;

      const duration = Date.now() - startTime;
      logger.debug(
        { tokenId, bidLevels: bids.length, askLevels: asks.length, depth: totalDepth, durationMs: duration },
        'Fetched order book'
      );

      return {
        bids,
        asks,
        depth: totalDepth,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error({ error, tokenId }, 'Failed to fetch order book');
      throw error;
    }
  }

  /**
   * Transform Gamma API market response to normalized Market format
   */
  private transformMarket(raw: PolymarketMarketResponse): Market {
    // Parse outcomes from tokens or outcomes array
    const outcomes = raw.outcomes || raw.tokens?.map((t) => t.outcome) || ['Yes', 'No'];

    // Parse prices from tokens or outcomePrices string
    const prices: Record<string, number> = {};
    if (raw.tokens) {
      for (const token of raw.tokens) {
        const price = token.price
          ? typeof token.price === 'string'
            ? parseFloat(token.price)
            : token.price
          : 0;
        prices[token.outcome] = price;
      }
    } else if (raw.outcomePrices) {
      try {
        const priceArray = JSON.parse(raw.outcomePrices) as string[];
        outcomes.forEach((outcome, i) => {
          prices[outcome] = parseFloat(priceArray[i] || '0');
        });
      } catch {
        // Default to 0.5 if parsing fails
        outcomes.forEach((outcome) => {
          prices[outcome] = 0.5;
        });
      }
    }

    return {
      id: raw.condition_id,
      platform: 'polymarket',
      question: raw.question,
      outcomes,
      prices,
      closeDate: raw.end_date_iso || raw.game_start_time || '',
      volume: raw.volume
        ? typeof raw.volume === 'string'
          ? parseFloat(raw.volume)
          : raw.volume
        : undefined,
      liquidity: raw.liquidity
        ? typeof raw.liquidity === 'string'
          ? parseFloat(raw.liquidity)
          : raw.liquidity
        : undefined,
      metadata: {
        tokens: raw.tokens,
        accepting_orders: raw.accepting_orders,
      },
    };
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return this.rateLimiter.getStats();
  }
}
