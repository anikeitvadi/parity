/**
 * Kalshi REST API client with rate limiting and authentication
 *
 * @module services/kalshi
 */

import { z } from 'zod';
import crypto from 'crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
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
 * A "standalone market" is a single forecastable proposition with its own price
 * and settlement criteria. Kalshi's `/markets` endpoint is dominated by MULTI-LEG
 * combination contracts (MVE — "multi-variate event" parlays: `yes Brazil advances,
 * yes Germany advances, ...`) which require several unrelated legs to all resolve a
 * given way. Those are NOT directly comparable cross-platform forecast propositions,
 * so they are excluded structurally (not by category). Single-outcome markets and the
 * individual priced children of a mutually-exclusive event (each candidate's binary)
 * are standalone and kept.
 */
function isCompositeMarket(m: KalshiMarket): boolean {
  const raw = m as KalshiMarket & {
    mve_collection_ticker?: string;
    mve_selected_legs?: unknown[];
  };
  return (
    /KXMVE/i.test(m.ticker) || // MVE parlay families, e.g. KXMVESPORTSMULTIGAMEEXTENDED
    !!raw.mve_collection_ticker ||
    (Array.isArray(raw.mve_selected_legs) && raw.mve_selected_legs.length > 0)
  );
}

/** One example row for the methodology output (included or excluded, with reason). */
export interface IngestSample {
  id: string;
  title: string;
  reason?: string;
}

/**
 * Counts + samples describing how raw Kalshi API rows were reduced to the
 * standalone-market universe. Filled in by `getAllActiveMarkets` for the
 * efficiency study's methodology artifact.
 */
export interface KalshiIngestStats {
  eventCount: number; // open events walked via /events
  rawChildCount: number; // child markets seen across all events (pre-filter)
  standaloneMarketCount: number; // children kept as standalone markets
  excludedCompositeCount: number; // children dropped as MVE/multi-leg
  excludedUnpricedCount: number; // children dropped for having no usable price
  cachedEvents: number; // events served from the on-disk checkpoint
  includedSamples: IngestSample[];
  excludedSamples: IngestSample[];
}

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
  private publicLimiter: RateLimiter;
  private hasAuth: boolean;

  constructor() {
    this.hasAuth = !!(env.KALSHI_API_KEY && env.KALSHI_API_SECRET);
    this.baseUrl = env.KALSHI_USE_DEMO ? KALSHI_DEMO_API : KALSHI_PUBLIC_API;
    this.publicUrl = KALSHI_PUBLIC_API;
    this.apiKey = env.KALSHI_API_KEY;
    this.apiSecret = env.KALSHI_API_SECRET;
    this.rateLimiter = createKalshiLimiter();
    // Public reads (events/markets/orderbook) are unauthenticated and 429 easily.
    // Throttle to 5 req/s with a 200ms floor; backoff handles bursts. A separate
    // limiter so bulk study walks can't starve the authenticated request budget.
    this.publicLimiter = new RateLimiter(5, 1_000, 200, 'kalshi-public');

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
    // Every public read goes through the rate limiter, which also retries with
    // exponential backoff on 429. The thrown error carries `.status` so the
    // limiter's retry predicate recognizes a rate-limit response.
    return this.publicLimiter.execute(async () => {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw Object.assign(
          new Error(`Kalshi API error: ${response.status} ${errorBody}`),
          { status: response.status }
        );
      }
      return response.json() as Promise<T>;
    });
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
    kalshiLogger.debug('Fetching active events');

    // Step 1: Get the first page of open events (clean titles + categories).
    const eventsResponse = await this.publicRequest<unknown>(
      '/events?status=open&limit=100'
    );

    const eventsResult = KalshiEventsResponseSchema.safeParse(eventsResponse);
    if (!eventsResult.success) {
      kalshiLogger.error({ error: eventsResult.error.message }, 'Invalid Kalshi events response');
      throw new Error('Invalid Kalshi events response');
    }

    // Step 2: Expand each event to its standalone child markets.
    const events = eventsResult.data.events;
    const markets = await this.expandEventsToMarkets(events);

    kalshiLogger.info(
      { events: events.length, markets: markets.length, durationMs: Date.now() - startTime },
      'Fetched Kalshi events and markets'
    );
    return markets;
  }

  /**
   * Fetch the full active **standalone-market** universe.
   *
   * Walks every open event via `/events` (cursor-paginated), then expands each
   * to its child markets, keeping only standalone propositions and dropping
   * multi-leg / composite (MVE) contracts — see {@link isCompositeMarket}. Used
   * by the efficiency study; the live feed uses {@link getActiveMarkets}.
   *
   * Each event costs one detail request, so the expansion is the slow part. It
   * is checkpointed to `opts.cacheDir` (one JSON per event) so an interrupted
   * run resumes instead of re-fetching, and every request is rate-limited.
   */
  async getAllActiveMarkets(
    opts: {
      maxEvents?: number;
      cacheDir?: string;
      cacheTtlMs?: number;
      onProgress?: (done: number, total: number) => void;
      stats?: KalshiIngestStats;
    } = {}
  ): Promise<Market[]> {
    const maxEvents = opts.maxEvents ?? 8000;

    // 1. Walk every open event (cheap: ~36 requests for ~7k events).
    const events: z.infer<typeof KalshiEventsResponseSchema>['events'] = [];
    let cursor: string | undefined;
    do {
      const query = `/events?status=open&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
      const response = await this.publicRequest<unknown>(query);
      const parsed = KalshiEventsResponseSchema.safeParse(response);
      if (!parsed.success) {
        kalshiLogger.error({ error: parsed.error.message }, 'Invalid Kalshi events response');
        throw new Error('Invalid Kalshi events response');
      }
      events.push(...parsed.data.events);
      cursor = parsed.data.cursor;
    } while (cursor && events.length < maxEvents);

    // 2. Expand to standalone child markets (checkpointed, rate-limited).
    const markets = await this.expandEventsToMarkets(events, opts);
    kalshiLogger.info(
      { events: events.length, standaloneMarkets: markets.length, paginated: true },
      'Fetched full Kalshi standalone-market universe'
    );
    return markets;
  }

  /**
   * Fetch one event's detail (event + its markets), via the on-disk checkpoint
   * when present and fresh. Returns null if the request fails (the caller skips
   * that event rather than aborting the whole run).
   */
  private async fetchEventDetail(
    ticker: string,
    opts: { cacheDir?: string; cacheTtlMs?: number; stats?: KalshiIngestStats }
  ): Promise<unknown | null> {
    const ttl = opts.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    let cacheFile: string | undefined;
    if (opts.cacheDir) {
      cacheFile = join(opts.cacheDir, `${ticker.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
      try {
        if (existsSync(cacheFile) && Date.now() - statSync(cacheFile).mtimeMs < ttl) {
          if (opts.stats) opts.stats.cachedEvents++;
          return JSON.parse(readFileSync(cacheFile, 'utf8'));
        }
      } catch {
        // Unreadable/expired cache — fall through to a live fetch.
      }
    }

    let detail: unknown;
    try {
      detail = await this.publicRequest<unknown>(`/events/${ticker}`);
    } catch (err) {
      kalshiLogger.warn({ ticker, err: (err as Error).message }, 'event detail fetch failed');
      return null;
    }

    if (cacheFile && opts.cacheDir) {
      try {
        mkdirSync(opts.cacheDir, { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(detail));
      } catch (err) {
        kalshiLogger.debug({ ticker, err: (err as Error).message }, 'event detail cache write failed');
      }
    }
    return detail;
  }

  /**
   * Expand events to their normalized standalone child markets. Drops multi-leg
   * (MVE) and unpriced children, and (when `opts.stats` is provided) tallies the
   * raw→standalone reduction with included/excluded samples for the methodology.
   */
  private async expandEventsToMarkets(
    events: z.infer<typeof KalshiEventsResponseSchema>['events'],
    opts: {
      cacheDir?: string;
      cacheTtlMs?: number;
      onProgress?: (done: number, total: number) => void;
      stats?: KalshiIngestStats;
    } = {}
  ): Promise<Market[]> {
    const markets: Market[] = [];
    const stats = opts.stats;
    if (stats) stats.eventCount = events.length;
    const batchSize = 8;
    let done = 0;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map((event) => this.fetchEventDetail(event.event_ticker, opts))
      );

      for (const detail of details) {
        done++;
        if (!detail) continue;

        const detailResult = KalshiEventDetailSchema.safeParse(detail);
        if (!detailResult.success) continue;

        const { event, markets: eventMarkets } = detailResult.data;

        // Single-market events → the one market. Multi-outcome events (e.g.
        // "Who will win?") → each option as its own standalone binary.
        for (const market of eventMarkets) {
          if (market.status !== 'active' && market.status !== 'open') continue;
          if (stats) stats.rawChildCount++;

          // Structural exclusion: multi-leg / composite (MVE) contracts are not
          // directly comparable cross-platform forecast propositions.
          if (isCompositeMarket(market)) {
            if (stats) {
              stats.excludedCompositeCount++;
              if (stats.excludedSamples.length < 8) {
                stats.excludedSamples.push({ id: market.ticker, title: market.title, reason: 'multi-leg / composite (MVE) contract' });
              }
            }
            continue;
          }

          // A standalone market has its own price.
          const hasPrice = !!(market.yes_ask_dollars || market.last_price_dollars || market.yes_bid_dollars);
          if (!hasPrice) {
            if (stats) {
              stats.excludedUnpricedCount++;
              if (stats.excludedSamples.length < 8) {
                stats.excludedSamples.push({ id: market.ticker, title: market.title, reason: 'no own price' });
              }
            }
            continue;
          }

          const normalized = this.normalizeMarket(market);
          // Use event title + category for cleaner display. For multi-outcome
          // events each market.title just repeats the event question, so the
          // actual option lives in yes_sub_title (e.g. the candidate name).
          normalized.question = event.mutually_exclusive && eventMarkets.length > 1
            ? `${event.title} — ${market.yes_sub_title || market.title}`
            : event.title + (event.sub_title ? ` (${event.sub_title})` : '');
          normalized.metadata = {
            ...normalized.metadata,
            category: event.category,
            eventTicker: event.event_ticker,
          };
          markets.push(normalized);

          if (stats) {
            stats.standaloneMarketCount++;
            if (stats.includedSamples.length < 8) {
              stats.includedSamples.push({ id: normalized.id, title: normalized.question });
            }
          }
        }
      }
      opts.onProgress?.(Math.min(done, events.length), events.length);
    }

    return markets;
  }

  /**
   * Sample the raw `/markets` endpoint to quantify how much of it is multi-leg
   * (MVE) parlay noise. Documents why the standalone universe is sourced via
   * `/events` instead of `/markets`. Counts over the first `maxPages` of 1000.
   */
  async sampleMarketsEndpoint(
    maxPages: number = 5
  ): Promise<{ sampled: number; composite: number; cursorExhausted: boolean }> {
    let cursor: string | undefined;
    let sampled = 0;
    let composite = 0;
    let pages = 0;
    do {
      const r = await this.publicRequest<unknown>(
        `/markets?status=open&limit=1000${cursor ? `&cursor=${cursor}` : ''}`
      );
      const parsed = KalshiMarketsResponseSchema.safeParse(r);
      if (!parsed.success) break;
      for (const m of parsed.data.markets) {
        sampled++;
        if (isCompositeMarket(m)) composite++;
      }
      cursor = parsed.data.cursor;
      pages++;
    } while (cursor && pages < maxPages);
    return { sampled, composite, cursorExhausted: !cursor };
  }

  /**
   * Live single-market fetch by ticker — for the dossier's on-demand price refresh. Returns the
   * current YES price (dollars), dollar volume, and whether the market is still trading; null if the
   * market is delisted / unfetchable. Prices use the same *_dollars fields the events path parses.
   */
  async getMarket(ticker: string): Promise<{ yes: number; volume: number; active: boolean; hasBook: boolean } | null> {
    try {
      const response = await this.publicRequest<{ market?: unknown }>(`/markets/${ticker}`);
      const parsed = KalshiMarketSchema.safeParse(response?.market);
      if (!parsed.success) return null;
      const m = parsed.data as {
        yes_ask_dollars?: string;
        last_price_dollars?: string;
        volume_fp?: string;
        status?: string;
      };
      const num = (s?: string): number => (s ? parseFloat(s) : NaN);
      const ask = num(m.yes_ask_dollars);
      const last = num(m.last_price_dollars);
      const price = Number.isFinite(ask) && ask > 0 ? ask : last;
      if (!Number.isFinite(price)) return null;
      const contracts = num(m.volume_fp);
      return {
        yes: price,
        volume: Number.isFinite(contracts) ? contracts * price : 0,
        active: m.status === 'active' || m.status === 'open',
        // A live ask means a real order book; falling back to last_price means the quote is stale.
        hasBook: Number.isFinite(ask) && ask > 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Daily YES-price history for a market via the candlesticks endpoint. The series ticker is the
   * first segment of the market ticker (e.g. KXHORMUZNORM-26MAR17-B270101 → KXHORMUZNORM). Returns
   * ascending {timestamp(ms), yes(0..1)} points, or [] if unavailable (illiquid / no series).
   */
  async getPriceHistory(ticker: string, days = 30): Promise<{ timestamp: number; yes: number }[]> {
    try {
      const series = ticker.split('-')[0];
      if (!series) return [];
      const end = Math.floor(Date.now() / 1000);
      const start = end - days * 86400;
      const resp = await this.publicRequest<{
        candlesticks?: { end_period_ts?: number; price?: { close_dollars?: string; mean_dollars?: string } }[];
      }>(`/series/${series}/markets/${ticker}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=1440`);
      return (resp?.candlesticks ?? [])
        .map((c) => {
          const px = c.price?.close_dollars ?? c.price?.mean_dollars;
          return { timestamp: (c.end_period_ts ?? 0) * 1000, yes: px ? parseFloat(px) : NaN };
        })
        .filter((p) => p.timestamp > 0 && Number.isFinite(p.yes) && p.yes > 0 && p.yes < 1)
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
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

    // Kalshi reports volume/open-interest in *contracts*, not dollars, while
    // Polymarket reports dollar volume. Convert to approximate USD turnover
    // (contracts × price) so the two platforms sort on the same scale. Use
    // lifetime volume_fp — volume_24h_fp is usually 0 for established markets.
    const volumeContracts = parsePrice(market.volume_fp) || 0;
    const volume = volumeContracts * yesPrice;
    const oiContracts = parsePrice(market.open_interest_fp) || 0;
    const liquidity = (parsePrice(market.liquidity_dollars) || 0) || oiContracts * yesPrice;

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
      volume,
      liquidity,
      metadata: {
        eventTicker: market.event_ticker,
        // Resolution text + outcome label — used by the rules-aware matcher.
        rules: (market as { rules_primary?: string }).rules_primary ?? undefined,
        subtitle: market.yes_sub_title ?? (market as { subtitle?: string }).subtitle ?? undefined,
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
