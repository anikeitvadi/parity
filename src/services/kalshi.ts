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
 * The elections API host serves market data publicly (no auth needed for reads).
 */
const KALSHI_PUBLIC_API = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_DEMO_API = 'https://demo-api.kalshi.com/trade-api/v2';

/**
 * Zod schema for Kalshi market response
 */
const KalshiMarketSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  yes_sub_title: z.string().optional(),
  no_sub_title: z.string().optional(),
  close_time: z.string(),
  yes_bid_dollars: z.string().optional(),
  yes_ask_dollars: z.string().optional(),
  no_bid_dollars: z.string().optional(),
  no_ask_dollars: z.string().optional(),
  last_price_dollars: z.string().optional(),
  volume_fp: z.string().optional(),
  volume_24h_fp: z.string().optional(),
  liquidity_dollars: z.string().optional(),
  open_interest_fp: z.string().optional(),
  status: z.string(),
  result: z.string().optional(),
  event_ticker: z.string().optional(),
  market_type: z.string().optional(),
}).passthrough();

/**
 * Zod schema for Kalshi markets list response
 */
const KalshiMarketsResponseSchema = z.object({
  markets: z.array(KalshiMarketSchema),
  cursor: z.string().optional(),
});

/**
 * Zod schema for Kalshi event
 */
const KalshiEventSchema = z.object({
  event_ticker: z.string(),
  title: z.string(),
  sub_title: z.string().optional(),
  category: z.string().optional(),
  mutually_exclusive: z.boolean().optional(),
}).passthrough();

/**
 * Zod schema for Kalshi events list response
 */
const KalshiEventsResponseSchema = z.object({
  events: z.array(KalshiEventSchema),
  cursor: z.string().optional(),
});

/**
 * Zod schema for single event detail (includes markets)
 */
const KalshiEventDetailSchema = z.object({
  event: KalshiEventSchema,
  markets: z.array(KalshiMarketSchema),
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
  private publicUrl: string;
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private rateLimiter: RateLimiter;
  private hasAuth: boolean;

  constructor() {
    this.hasAuth = !!(env.KALSHI_API_KEY && env.KALSHI_API_SECRET);
    this.baseUrl = env.KALSHI_USE_DEMO ? KALSHI_DEMO_API : KALSHI_PUBLIC_API;
    this.publicUrl = KALSHI_PUBLIC_API;
    this.apiKey = env.KALSHI_API_KEY;
    this.apiSecret = env.KALSHI_API_SECRET;
    this.rateLimiter = createKalshiLimiter();

    kalshiLogger.info(
      { baseUrl: this.baseUrl, authenticated: this.hasAuth },
      'Kalshi client initialized'
    );
  }

  /**
   * Make an unauthenticated public request (for market data reads)
   */
  private async publicRequest<T>(endpoint: string): Promise<T> {
    const url = `${this.publicUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`Kalshi API error: ${response.status} ${errorBody}`);
    }

    return response.json() as Promise<T>;
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
   * Fetch active markets from Kalshi via the events endpoint.
   * Uses events for clean titles/categories, then fetches each event's
   * markets for pricing data. Filters out multi-leg parlays.
   */
  async getActiveMarkets(): Promise<Market[]> {
    const startTime = Date.now();

    return this.rateLimiter.execute(async () => {
      kalshiLogger.debug('Fetching active events');

      // Step 1: Get all open events (clean titles + categories)
      const eventsResponse = await this.publicRequest<unknown>(
        '/events?status=open&limit=100'
      );

      const eventsResult = KalshiEventsResponseSchema.safeParse(eventsResponse);
      if (!eventsResult.success) {
        kalshiLogger.error({ error: eventsResult.error.message }, 'Invalid Kalshi events response');
        throw new Error('Invalid Kalshi events response');
      }

      // Step 2: Fetch market details for each event (batched)
      const markets: Market[] = [];

      // Fetch event details in parallel (max 10 concurrent)
      const events = eventsResult.data.events;
      const batchSize = 10;

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((event) =>
            this.publicRequest<unknown>(`/events/${event.event_ticker}`)
          )
        );

        for (const result of results) {
          if (result.status !== 'fulfilled') continue;

          const detailResult = KalshiEventDetailSchema.safeParse(result.value);
          if (!detailResult.success) continue;

          const { event, markets: eventMarkets } = detailResult.data;

          // For single-market events, use the one market
          // For multi-market events (e.g. "Who will win?"), include each option
          for (const market of eventMarkets) {
            // Skip inactive markets
            if (market.status !== 'active' && market.status !== 'open') continue;

            const normalized = this.normalizeMarket(market);
            // Use event title + category for cleaner display
            normalized.question = event.mutually_exclusive && eventMarkets.length > 1
              ? `${event.title} - ${market.title}`
              : event.title + (event.sub_title ? ` (${event.sub_title})` : '');
            normalized.metadata = {
              ...normalized.metadata,
              category: event.category,
              eventTicker: event.event_ticker,
            };
            markets.push(normalized);
          }
        }
      }

      const duration = Date.now() - startTime;
      kalshiLogger.info(
        { events: events.length, markets: markets.length, durationMs: duration },
        'Fetched Kalshi events and markets'
      );

      return markets;
    });
  }

  /**
   * Fetch order book for a specific market
   *
   * @param ticker - Market ticker
   * @returns OrderBook with bid/ask levels and depth (empty if demo mode)
   */
  async getOrderBook(ticker: string): Promise<OrderBook> {
    const startTime = Date.now();

    return this.rateLimiter.execute(async () => {
      kalshiLogger.debug({ ticker }, 'Fetching order book');

      // Public endpoint — no auth needed
      const response = await this.publicRequest<unknown>(
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
    // Prices are now dollar strings (e.g. "0.7500" = 75 cents = 75%)
    const parsePrice = (s?: string) => (s ? parseFloat(s) : null);

    const yesAsk = parsePrice(market.yes_ask_dollars);
    const lastPrice = parsePrice(market.last_price_dollars);
    const yesPrice = yesAsk && yesAsk > 0 ? yesAsk : lastPrice && lastPrice > 0 ? lastPrice : 0.5;
    const noPrice = 1 - yesPrice;

    const volume24h = parsePrice(market.volume_24h_fp) || parsePrice(market.volume_fp) || 0;
    const liquidity = parsePrice(market.liquidity_dollars) || parsePrice(market.open_interest_fp) || 0;

    return {
      id: market.ticker,
      platform: 'kalshi',
      question: market.title,
      outcomes: ['Yes', 'No'],
      prices: {
        Yes: yesPrice,
        No: noPrice,
      },
      closeDate: market.close_time,
      volume: volume24h,
      liquidity,
      metadata: {
        eventTicker: market.event_ticker,
        marketType: market.market_type,
        status: market.status,
        result: market.result,
        yesBid: market.yes_bid_dollars,
        yesAsk: market.yes_ask_dollars,
        noBid: market.no_bid_dollars,
        noAsk: market.no_ask_dollars,
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
