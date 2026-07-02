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
 * Counts + samples describing the Polymarket standalone-market universe, for the
 * efficiency study's methodology artifact. Gamma's core feed already returns
 * individual standalone binaries (multi-candidate events arrive pre-split into
 * negRisk binaries), so standalone ≈ raw; the excluded bucket only catches
 * malformed rows with no id or price.
 */
export interface PolymarketIngestStats {
  rawMarketCount: number;
  standaloneMarketCount: number;
  excludedCount: number;
  includedSamples: { id: string; title: string }[];
  excludedSamples: { id: string; title: string; reason?: string }[];
  /** Distinct sort orders unioned during enumeration (provenance for the lower-bound count). */
  enumerationSorts?: string[];
}

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
        const res = await fetch(`${GAMMA_API_HOST}/markets?closed=false&active=true&limit=500`);
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
   * Fetch the full active-market universe by paginating the Gamma API.
   *
   * `getActiveMarkets` only sees the first page (Gamma caps `limit` at 100),
   * which under-samples the universe. This walks `offset` until a short page
   * signals the end (or `maxPages` is hit). Used by the efficiency study.
   *
   * @param opts.maxPages - Safety cap on pages fetched (default: 20 → up to 2000)
   * @param opts.stats - Optional methodology counters (raw vs standalone).
   */
  async getAllActiveMarkets(
    opts: { maxPages?: number; stats?: PolymarketIngestStats } = {}
  ): Promise<Market[]> {
    const maxPages = opts.maxPages ?? 20;
    const stats = opts.stats;
    const pageSize = 100;
    const all: Market[] = [];

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      const response = await this.rateLimiter.execute(async () => {
        const res = await fetch(
          // Order by volume desc: Gamma caps offset at ~2000, and the DEFAULT
          // ordering buries liquid markets past that ceiling (e.g. the Clarity Act
          // market). Volume-ordering surfaces the arbitrage-relevant universe.
          `${GAMMA_API_HOST}/markets?closed=false&active=true&order=volumeNum&ascending=false&limit=${pageSize}&offset=${offset}`
        );
        if (!res.ok) {
          throw new Error(`Gamma API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      });

      const parseResult = z.array(PolymarketMarketSchema).safeParse(response);
      if (!parseResult.success) {
        throw new Error('API validation failed');
      }

      const active = parseResult.data.filter((m) => m.active !== false && m.closed !== true);
      for (const raw of active) {
        const market = this.transformMarket(raw);
        if (stats) stats.rawMarketCount++;
        // Standalone = its own id and at least one price. Gamma's feed has no
        // parlay/composite rows, so this only screens out malformed entries.
        const isStandalone = !!market.id && Object.keys(market.prices).length > 0;
        if (!isStandalone) {
          if (stats) {
            stats.excludedCount++;
            if (stats.excludedSamples.length < 8) {
              stats.excludedSamples.push({ id: market.id, title: market.question, reason: 'no id or price' });
            }
          }
          continue;
        }
        all.push(market);
        if (stats) {
          stats.standaloneMarketCount++;
          if (stats.includedSamples.length < 8) {
            stats.includedSamples.push({ id: market.id, title: market.question });
          }
        }
      }

      // A short page means we've reached the end.
      if (parseResult.data.length < pageSize) break;
    }

    logger.info(
      { marketCount: all.length, source: 'gamma', paginated: true },
      'Fetched full active-market universe from Gamma API'
    );
    return all;
  }

  /**
   * Enumerate the full active **standalone-market** universe via Gamma `/events`.
   *
   * `getAllActiveMarkets` paginates `/markets`, but Gamma hard-caps offset at
   * ~2000 (offset 2100+ → HTTP 422), so it can only ever see the top ~2000
   * markets by a single sort. This instead walks `/events` under several sort
   * orders and unions the embedded child markets — each multi-candidate event
   * (e.g. "World Cup Winner") already arrives pre-split into individual negRisk
   * binaries, which are standalone. Because the offset cap applies per sort, the
   * union is a documented LOWER BOUND on the true universe, not a complete
   * enumeration (`stats.enumerationSorts` records the sorts used).
   */
  async getStandaloneUniverse(
    opts: { sorts?: string[]; maxOffset?: number; stats?: PolymarketIngestStats } = {}
  ): Promise<Market[]> {
    const sorts = opts.sorts ?? ['volume', 'liquidity', 'startDate'];
    const maxOffset = opts.maxOffset ?? 2000;
    const stats = opts.stats;
    const pageSize = 100;
    const byId = new Map<string, Market>();

    for (const order of sorts) {
      for (let offset = 0; offset <= maxOffset; offset += pageSize) {
        const response = await this.rateLimiter.execute(async () => {
          const res = await fetch(
            `${GAMMA_API_HOST}/events?closed=false&active=true&order=${order}&ascending=false&limit=${pageSize}&offset=${offset}`
          );
          if (res.status === 422) return null; // offset ceiling — stop this sort
          if (!res.ok) throw new Error(`Gamma events error: ${res.status} ${res.statusText}`);
          return res.json();
        });
        if (!response || !Array.isArray(response) || response.length === 0) break;

        for (const ev of response as { markets?: unknown[] }[]) {
          for (const rawMarket of ev.markets ?? []) {
            const parsed = PolymarketMarketSchema.safeParse(rawMarket);
            if (!parsed.success) continue;
            if (parsed.data.active === false || parsed.data.closed === true) continue;
            const market = this.transformMarket(parsed.data);
            if (stats) stats.rawMarketCount++;
            const isStandalone = !!market.id && Object.keys(market.prices).length > 0;
            if (!isStandalone) {
              if (stats) {
                stats.excludedCount++;
                if (stats.excludedSamples.length < 8) {
                  stats.excludedSamples.push({ id: market.id, title: market.question, reason: 'no id or price' });
                }
              }
              continue;
            }
            if (byId.has(market.id)) continue; // dedup across sorts
            byId.set(market.id, market);
            if (stats && stats.includedSamples.length < 8) {
              stats.includedSamples.push({ id: market.id, title: market.question });
            }
          }
        }
        if (response.length < pageSize) break;
      }
    }

    const all = [...byId.values()];
    if (stats) {
      stats.standaloneMarketCount = all.length;
      stats.enumerationSorts = sorts;
    }
    logger.info(
      { marketCount: all.length, sorts, source: 'gamma-events', lowerBound: true },
      'Enumerated Polymarket standalone universe (multi-sort /events union)'
    );
    return all;
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
   * Real price history for a binary market from the CLOB /prices-history endpoint — the data the
   * platform tracks but we don't persist. Resolves the YES token via getMarketDetails, then returns
   * the same `{ timestamp, data.prices }` shape as the DB-backed history so the detail route can swap
   * it in. Empty array on demo mode / failure (honest empty state — never fabricated).
   */
  async getPriceHistory(
    conditionId: string,
    days = 7
  ): Promise<{ timestamp: number; data: { prices: Record<string, number> } }[]> {
    // Resolve the YES token, then hit the PUBLIC /prices-history endpoint directly — no wallet /
    // authenticated CLOB client needed (this works in demo mode), matching getMarketDetails' pattern.
    const details = await this.getMarketDetails(conditionId);
    if (!details) return [];
    const yes = details.tokens.find((t) => t.outcome.toLowerCase() === 'yes') ?? details.tokens[0];
    const no = details.tokens.find((t) => t !== yes);
    if (!yes) return [];

    // The CLOB history endpoint returns nothing for a bare startTs/endTs window; the `interval` form
    // is what actually serves data. Map the requested days to the nearest supported interval.
    const interval = days <= 1 ? '1d' : days <= 7 ? '1w' : days <= 31 ? '1m' : 'max';
    try {
      const url = `${CLOB_HOST}/prices-history?market=${yes.token_id}&interval=${interval}&fidelity=1440`;
      const res = await this.rateLimiter.execute(() => fetch(url));
      if (!res.ok) return [];
      const json = (await res.json()) as { history?: { t: number; p: number }[] };
      return (json.history ?? []).map((pt) => {
        const p = Number(pt.p);
        return {
          timestamp: Number(pt.t) * 1000,
          data: { prices: { [yes.outcome]: p, ...(no ? { [no.outcome]: 1 - p } : {}) } },
        };
      });
    } catch (error) {
      logger.debug({ conditionId, error }, 'CLOB price history fetch failed');
      return [];
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
        // Resolution text — used by the rules-aware cross-platform matcher.
        description: (raw as { description?: string | null }).description ?? undefined,
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
