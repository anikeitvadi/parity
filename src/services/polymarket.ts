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
 * Updated to match actual API response (camelCase fields)
 */
const PolymarketMarketSchema = z.object({
  id: z.string().optional(),
  conditionId: z.string().optional(),  // camelCase in API
  questionId: z.string().optional(),
  question: z.string(),
  slug: z.string().optional(),
  endDate: z.string().optional(),      // camelCase in API
  startDate: z.string().optional(),
  outcomes: z.union([z.array(z.string()), z.string()]).optional(), // Can be array or comma-separated string
  outcomePrices: z.union([z.array(z.string()), z.string()]).optional(),
  tokens: z
    .array(
      z.object({
        token_id: z.string().optional(),
        outcome: z.string(),
        price: z.union([z.string(), z.number()]).optional(),
      })
    )
    .optional(),
  volume: z.union([z.string(), z.number()]).optional(),
  liquidity: z.union([z.string(), z.number()]).optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  acceptingOrders: z.boolean().optional(),  // camelCase
  category: z.string().optional(),
}).passthrough();  // Allow additional fields

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
 * Zod schema for CLOB API market response (includes token IDs)
 */
const ClobMarketSchema = z.object({
  condition_id: z.string(),
  question_id: z.string().optional().nullable(),
  question: z.string(),
  market_slug: z.string().optional().nullable(),
  end_date_iso: z.string().optional().nullable(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  accepting_orders: z.boolean().optional(),
  tokens: z.array(
    z.object({
      token_id: z.string(),
      outcome: z.string(),
      price: z.number().optional(),
      winner: z.boolean().optional(),
    })
  ),
}).passthrough();

type ClobMarketResponse = z.infer<typeof ClobMarketSchema>;

/**
 * Polymarket client for fetching market data and order books.
 * Uses the official @polymarket/clob-client for CLOB operations
 * and the Gamma API for market data.
 *
 * In demo mode (no private key), only public Gamma API data is available.
 * Order book methods will throw an error without credentials.
 */
export class PolymarketClient {
  private clobClient: ClobClient | null = null;
  private wallet: Wallet | null = null;
  private rateLimiter: RateLimiter;
  private initialized = false;
  private demoMode: boolean;

  constructor() {
    this.demoMode = !env.POLYMARKET_PRIVATE_KEY;

    // Create wallet from private key (if available)
    if (env.POLYMARKET_PRIVATE_KEY) {
      const privateKey = env.POLYMARKET_PRIVATE_KEY.startsWith('0x')
        ? env.POLYMARKET_PRIVATE_KEY
        : `0x${env.POLYMARKET_PRIVATE_KEY}`;
      this.wallet = new Wallet(privateKey);
      logger.info(
        { address: this.wallet.address },
        'PolymarketClient created with wallet'
      );
    } else {
      logger.info('PolymarketClient running in demo mode (public data only)');
    }

    // Initialize rate limiter
    this.rateLimiter = createPolymarketLimiter();
  }

  /**
   * Initialize the CLOB client with authentication.
   * Must be called before using order book methods.
   * In demo mode, this is a no-op.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.demoMode || !this.wallet) {
      logger.info('CLOB client not initialized (demo mode)');
      this.initialized = true;
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
   * Fetch active markets from Gamma API.
   * Use getMarketDetails() separately to get token IDs for order book fetching.
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
        { marketCount: markets.length, durationMs: duration, source: 'gamma' },
        'Fetched active markets from Gamma API'
      );

      return markets;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch active markets');
      throw error;
    }
  }

  /**
   * Fetch market details from CLOB API by condition ID (includes token IDs)
   */
  async getMarketDetails(conditionId: string): Promise<ClobMarketResponse | null> {
    try {
      const response = await this.rateLimiter.execute(async () => {
        const res = await fetch(`${CLOB_HOST}/markets/${conditionId}`);
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`CLOB API error: ${res.status}`);
        }
        return res.json();
      });

      if (!response) return null;

      const parseResult = ClobMarketSchema.safeParse(response);
      if (!parseResult.success) {
        logger.debug({ conditionId }, 'CLOB market validation failed');
        return null;
      }

      return parseResult.data;
    } catch (error) {
      logger.debug({ conditionId, error }, 'Failed to fetch CLOB market details');
      return null;
    }
  }

  /**
   * Transform CLOB API market to normalized Market format
   */
  private transformClobMarket(raw: ClobMarketResponse): Market {
    const outcomes = raw.tokens.map((t) => t.outcome);
    const prices: Record<string, number> = {};

    for (const token of raw.tokens) {
      prices[token.outcome] = token.price ?? 0.5;
    }

    return {
      id: raw.condition_id,
      platform: 'polymarket',
      question: raw.question,
      outcomes,
      prices,
      closeDate: raw.end_date_iso || '',
      metadata: {
        slug: raw.market_slug,
        tokens: raw.tokens.map((t) => ({
          token_id: t.token_id,
          outcome: t.outcome,
          price: t.price,
        })),
        acceptingOrders: raw.accepting_orders,
      },
    };
  }

  /**
   * Get order book for a specific market token.
   * Returns order book with bid/ask levels and total depth.
   *
   * @param tokenId - The token ID (not market ID) for the outcome
   * @throws Error if running in demo mode (no CLOB access)
   */
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    if (!this.clobClient) {
      await this.initialize();
    }

    if (this.demoMode || !this.clobClient) {
      logger.warn({ tokenId }, 'Order book unavailable in demo mode');
      // Return empty order book in demo mode
      return {
        bids: [],
        asks: [],
        depth: 0,
        timestamp: Date.now(),
      };
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

      // Transform to normalized OrderBook format and sort for best prices
      const bids: OrderBookLevel[] = (response.bids || [])
        .map((b: { price: string; size: string }) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        }))
        .sort((a, b) => b.price - a.price); // Highest bid first

      const asks: OrderBookLevel[] = (response.asks || [])
        .map((a: { price: string; size: string }) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        }))
        .sort((a, b) => a.price - b.price); // Lowest ask first

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
    // Parse outcomes from tokens or outcomes field
    let outcomes: string[];
    if (raw.tokens && raw.tokens.length > 0) {
      outcomes = raw.tokens.map((t) => t.outcome);
    } else if (Array.isArray(raw.outcomes)) {
      outcomes = raw.outcomes;
    } else if (typeof raw.outcomes === 'string') {
      // Handle JSON array string or comma-separated format
      try {
        const parsed = JSON.parse(raw.outcomes);
        outcomes = Array.isArray(parsed) ? parsed : [raw.outcomes];
      } catch {
        // Fallback to comma-separated
        outcomes = raw.outcomes.split(',').map(s => s.trim());
      }
    } else {
      outcomes = ['Yes', 'No'];
    }

    // Parse prices from tokens or outcomePrices
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
        const priceStr = typeof raw.outcomePrices === 'string' ? raw.outcomePrices : JSON.stringify(raw.outcomePrices);
        const priceArray = JSON.parse(priceStr) as string[];
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
      id: raw.conditionId || raw.id || '',  // Use camelCase field
      platform: 'polymarket',
      question: raw.question,
      outcomes,
      prices,
      closeDate: raw.endDate || raw.startDate || '',  // Use camelCase field
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
        slug: raw.slug,
        tokens: raw.tokens,
        acceptingOrders: raw.acceptingOrders,
        category: raw.category,
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
