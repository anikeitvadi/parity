/**
 * Kalshi REST API client with rate limiting and authentication
 *
 * @module services/kalshi
 */

import { z } from 'zod';
import crypto from 'crypto';
import { createKalshiLimiter, RateLimiter } from '../utils/rate-limiter.js';
import { kalshiLogger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { Market, OrderBook, OrderBookLevel } from '../types/market.js';

/**
 * Kalshi API endpoints
 */
const KALSHI_PROD_API = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_DEMO_API = 'https://demo-api.kalshi.com/trade-api/v2';

/**
 * Zod schema for Kalshi market response
 */
const KalshiMarketSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  close_time: z.string(),
  yes_bid: z.number().nullable(),
  yes_ask: z.number().nullable(),
  no_bid: z.number().nullable(),
  no_ask: z.number().nullable(),
  last_price: z.number().nullable(),
  volume: z.number().optional(),
  volume_24h: z.number().optional(),
  open_interest: z.number().optional(),
  status: z.string(),
  result: z.string().nullable().optional(),
  category: z.string().optional(),
});

/**
 * Zod schema for Kalshi markets list response
 */
const KalshiMarketsResponseSchema = z.object({
  markets: z.array(KalshiMarketSchema),
  cursor: z.string().optional(),
});

/**
 * Zod schema for Kalshi order book response
 */
const KalshiOrderBookSchema = z.object({
  orderbook: z.object({
    yes: z.array(z.tuple([z.number(), z.number()])).optional(), // [price, size]
    no: z.array(z.tuple([z.number(), z.number()])).optional(),
  }),
});

/**
 * Type for Kalshi market
 */
type KalshiMarket = z.infer<typeof KalshiMarketSchema>;

/**
 * Kalshi REST API client
 *
 * Features:
 * - Rate limiting with exponential backoff
 * - API key/secret authentication via headers
 * - Automatic retry on 429 and network errors
 * - Zod validation of all API responses
 * - Demo mode: returns empty results if no credentials
 */
export class KalshiClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private rateLimiter: RateLimiter;
  private demoMode: boolean;

  constructor() {
    this.demoMode = !env.KALSHI_API_KEY || !env.KALSHI_API_SECRET;
    this.baseUrl = env.KALSHI_USE_DEMO ? KALSHI_DEMO_API : KALSHI_PROD_API;
    this.apiKey = env.KALSHI_API_KEY;
    this.apiSecret = env.KALSHI_API_SECRET;
    this.rateLimiter = createKalshiLimiter();

    if (this.demoMode) {
      kalshiLogger.info('Kalshi client running in demo mode (no API access)');
    } else {
      kalshiLogger.info(
        { baseUrl: this.baseUrl, demo: env.KALSHI_USE_DEMO },
        'Kalshi client initialized'
      );
    }
  }

  /**
   * Generate RSA-PSS signature for Kalshi API authentication
   *
   * @param timestamp - Unix timestamp in milliseconds
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - API endpoint path (e.g., /trade-api/v2/markets)
   * @returns Base64-encoded signature
   */
  private generateSignature(timestamp: string, method: string, path: string): string {
    if (!this.apiSecret) {
      throw new Error('API secret not configured');
    }

    // Message to sign: timestamp + method + path
    const message = timestamp + method.toUpperCase() + path;

    // Create signature using RSA-PSS with SHA-256
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    // Sign with RSA-PSS padding
    const signature = sign.sign({
      key: this.apiSecret,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    return signature.toString('base64');
  }

  /**
   * Make an authenticated request to the Kalshi API
   *
   * @param endpoint - API endpoint path
   * @param options - Fetch options
   * @returns Response data
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Kalshi API credentials not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;

    // Generate timestamp in milliseconds for auth
    const timestamp = Date.now().toString();

    // Extract the full path for signature (includes /trade-api/v2)
    const urlObj = new URL(url);
    const fullPath = urlObj.pathname + urlObj.search;

    // Get HTTP method (default to GET)
    const method = (options.method || 'GET').toUpperCase();

    // Generate RSA-PSS signature
    const signature = this.generateSignature(timestamp, method, fullPath);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'KALSHI-ACCESS-KEY': this.apiKey,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');

      // Handle specific error codes
      if (response.status === 401) {
        kalshiLogger.error(
          { status: 401, endpoint },
          'Authentication failed - check KALSHI_API_KEY and KALSHI_API_SECRET'
        );
        throw Object.assign(new Error('Kalshi authentication failed'), {
          status: 401,
        });
      }

      if (response.status === 429) {
        kalshiLogger.warn({ endpoint }, 'Rate limit hit, will retry');
        throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
      }

      kalshiLogger.error(
        { status: response.status, endpoint, error: errorBody },
        'Kalshi API error'
      );
      throw Object.assign(
        new Error(`Kalshi API error: ${response.status} ${errorBody}`),
        { status: response.status }
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch active markets from Kalshi
   *
   * @returns Array of normalized Market objects (empty if demo mode)
   */
  async getActiveMarkets(): Promise<Market[]> {
    if (this.demoMode) {
      kalshiLogger.debug('Skipping Kalshi fetch (demo mode)');
      return [];
    }

    const startTime = Date.now();

    return this.rateLimiter.execute(async () => {
      kalshiLogger.debug('Fetching active markets');

      // Fetch markets with active status filter
      const response = await this.request<unknown>(
        '/markets?status=open&limit=100'
      );

      // Validate response with Zod
      const parseResult = KalshiMarketsResponseSchema.safeParse(response);

      if (!parseResult.success) {
        kalshiLogger.error(
          { error: parseResult.error.message },
          'Invalid Kalshi markets response'
        );
        throw new Error('Invalid Kalshi API response');
      }

      const duration = Date.now() - startTime;
      kalshiLogger.info(
        { count: parseResult.data.markets.length, durationMs: duration },
        'Fetched Kalshi markets'
      );

      // Map to common Market type
      return parseResult.data.markets.map((market) =>
        this.normalizeMarket(market)
      );
    });
  }

  /**
   * Fetch order book for a specific market
   *
   * @param ticker - Market ticker
   * @returns OrderBook with bid/ask levels and depth (empty if demo mode)
   */
  async getOrderBook(ticker: string): Promise<OrderBook> {
    if (this.demoMode) {
      kalshiLogger.debug({ ticker }, 'Skipping order book fetch (demo mode)');
      return { bids: [], asks: [], depth: 0, timestamp: Date.now() };
    }

    const startTime = Date.now();

    return this.rateLimiter.execute(async () => {
      kalshiLogger.debug({ ticker }, 'Fetching order book');

      const response = await this.request<unknown>(
        `/markets/${ticker}/orderbook`
      );

      // Validate response with Zod
      const parseResult = KalshiOrderBookSchema.safeParse(response);

      if (!parseResult.success) {
        kalshiLogger.error(
          { ticker, error: parseResult.error.message },
          'Invalid Kalshi order book response'
        );
        throw new Error('Invalid Kalshi order book response');
      }

      const orderbook = parseResult.data.orderbook;

      // Convert to OrderBookLevel format
      // Kalshi prices are in cents (1-99), convert to 0-1 scale
      const bids: OrderBookLevel[] = (orderbook.yes || []).map(
        ([price, size]) => ({
          price: price / 100,
          size,
        })
      );

      const asks: OrderBookLevel[] = (orderbook.no || []).map(
        ([price, size]) => ({
          price: price / 100,
          size,
        })
      );

      // Calculate depth: sum of first 5 levels
      const bidDepth = bids.slice(0, 5).reduce((sum, l) => sum + l.size, 0);
      const askDepth = asks.slice(0, 5).reduce((sum, l) => sum + l.size, 0);
      const totalDepth = bidDepth + askDepth;

      const duration = Date.now() - startTime;
      kalshiLogger.debug(
        { ticker, depth: totalDepth, durationMs: duration },
        'Fetched order book'
      );

      return {
        bids,
        asks,
        depth: totalDepth,
        timestamp: Date.now(),
      };
    });
  }

  /**
   * Normalize Kalshi market to common Market format
   *
   * @param market - Kalshi market data
   * @returns Normalized Market object
   */
  private normalizeMarket(market: KalshiMarket): Market {
    // Extract prices (Kalshi uses cents 1-99, convert to 0-1)
    const yesPrice =
      market.yes_ask !== null
        ? market.yes_ask / 100
        : market.last_price !== null
          ? market.last_price / 100
          : 0.5;
    const noPrice =
      market.no_ask !== null
        ? market.no_ask / 100
        : market.last_price !== null
          ? 1 - market.last_price / 100
          : 0.5;

    return {
      id: market.ticker,
      platform: 'kalshi',
      question: market.title + (market.subtitle ? ` - ${market.subtitle}` : ''),
      outcomes: ['Yes', 'No'],
      prices: {
        Yes: yesPrice,
        No: noPrice,
      },
      closeDate: market.close_time,
      volume: market.volume_24h || market.volume,
      liquidity: market.open_interest,
      metadata: {
        category: market.category,
        status: market.status,
        result: market.result,
        yesBid: market.yes_bid,
        yesAsk: market.yes_ask,
        noBid: market.no_bid,
        noAsk: market.no_ask,
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

/**
 * Singleton instance of KalshiClient
 */
let kalshiClientInstance: KalshiClient | null = null;

/**
 * Get or create the Kalshi client singleton
 */
export function getKalshiClient(): KalshiClient {
  if (!kalshiClientInstance) {
    kalshiClientInstance = new KalshiClient();
  }
  return kalshiClientInstance;
}
