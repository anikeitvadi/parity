import { Hono } from 'hono';
import { PolymarketClient } from '../../../src/services/polymarket.js';
import { KalshiClient } from '../../../src/services/kalshi.js';
import { getLatestSnapshot, getRecentMatches, getMarketHistory } from '../../../src/database/queries.js';
import { getSettlementComparison } from '../../../src/database/queries.js';
import { SimpleCache } from '../cache.js';
import { readCachedSources, slugify } from '../../../src/services/source-collector.js';
import type { Market } from '../../../src/types/market.js';

const metaculusCache = new SimpleCache<MetaculusResult | null>(300); // 5 min

export interface MetaculusResult {
  title: string;
  prediction: number;
  marketPrice: number;
  divergence: number;
  confidence: number;
}

/** Simple word-overlap similarity between two strings. */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}

const MIN_METACULUS_SIMILARITY = 0.3;

export async function findMetaculusMatch(market: Market): Promise<MetaculusResult | null> {
  const cacheKey = `${market.platform}-${market.id}`;
  const cached = metaculusCache.get(cacheKey);
  if (cached !== null) return cached;

  const keywords = market.question
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(' ');

  if (!keywords) return null;

  try {
    const res = await fetch(
      `https://www.metaculus.com/api/posts/?search=${encodeURIComponent(keywords)}&forecast_type=binary&statuses=open&limit=5`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return null;

    const data = await res.json() as { results?: { question?: { title?: string; aggregations?: { recency_weighted?: { latest?: { centers?: number[] } } } } }[] };
    const results = data.results || [];

    // Score all candidates by title similarity, pick the best
    let bestResult: MetaculusResult | null = null;
    let bestSim = 0;

    for (const post of results) {
      const q = post.question;
      if (!q?.title || !q?.aggregations?.recency_weighted?.latest?.centers?.[0]) continue;

      const sim = titleSimilarity(market.question, q.title);
      if (sim < MIN_METACULUS_SIMILARITY) continue;
      if (sim <= bestSim) continue;

      const prediction = q.aggregations.recency_weighted.latest.centers[0];
      const marketPrice = market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;

      bestSim = sim;
      bestResult = {
        title: q.title,
        prediction,
        marketPrice,
        divergence: Math.abs(prediction - marketPrice),
        confidence: sim,
      };
    }

    metaculusCache.set(cacheKey, bestResult);
    return bestResult;
  } catch {
    // Timeout or network error — skip
  }

  metaculusCache.set(cacheKey, null);
  return null;
}

const polyClient = new PolymarketClient();
const kalshiClient = new KalshiClient();
const marketCache = new SimpleCache<Market[]>(60);

/** Get cached market counts without fetching. Used by /api/status. */
export function getMarketCounts(): { polymarket: number; kalshi: number } {
  const poly = marketCache.get('polymarket');
  const kalshi = marketCache.get('kalshi');
  return {
    polymarket: poly?.length || 0,
    kalshi: kalshi?.length || 0,
  };
}

export const marketRoutes = new Hono();

// GET /api/markets — List markets from both platforms
marketRoutes.get('/', async (c) => {
  const platform = c.req.query('platform') || 'all';
  const search = c.req.query('search')?.toLowerCase() || '';
  const category = c.req.query('category')?.toLowerCase() || '';
  const limit = parseInt(c.req.query('limit') || '200', 10);

  let markets: Market[] = [];

  // Fetch from Polymarket
  if (platform === 'all' || platform === 'polymarket') {
    let polyMarkets = marketCache.get('polymarket');
    if (!polyMarkets) {
      try {
        polyMarkets = await polyClient.getActiveMarkets();
        marketCache.set('polymarket', polyMarkets);
      } catch {
        polyMarkets = [];
      }
    }
    markets.push(...polyMarkets);
  }

  // Fetch from Kalshi
  if (platform === 'all' || platform === 'kalshi') {
    let kalshiMarkets = marketCache.get('kalshi');
    if (!kalshiMarkets) {
      try {
        kalshiMarkets = await kalshiClient.getActiveMarkets();
        marketCache.set('kalshi', kalshiMarkets);
      } catch {
        kalshiMarkets = [];
      }
    }
    markets.push(...kalshiMarkets);
  }

  // Enrich Polymarket markets with inferred categories
  for (const m of markets) {
    if (m.platform === 'polymarket' && !(m.metadata as Record<string, unknown>)?.category) {
      (m.metadata as Record<string, unknown>) = {
        ...(m.metadata as Record<string, unknown>),
        category: inferCategory(m.question),
      };
    }
  }

  // Filter out low-quality / meme / derivative markets
  markets = markets.filter((m) => !isMemeMarket(m));

  // Filter by search term
  if (search) {
    markets = markets.filter((m) =>
      m.question.toLowerCase().includes(search)
    );
  }

  // Filter by category
  if (category) {
    markets = markets.filter((m) => {
      const cat = ((m.metadata as Record<string, unknown>)?.category as string || '').toLowerCase();
      return cat.includes(category);
    });
  }

  // Extract unique categories for filtering UI
  const categories = new Set<string>();
  for (const m of markets) {
    const cat = (m.metadata as Record<string, unknown>)?.category as string;
    if (cat) categories.add(cat);
  }

  // Sort by quality score (not just raw volume)
  markets.sort((a, b) => qualityScore(b) - qualityScore(a));

  return c.json({
    markets: markets.slice(0, limit),
    total: markets.length,
    categories: [...categories].sort(),
  });
});

// GET /api/markets/:id — Market detail with enrichments
marketRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const platform = c.req.query('platform');

  if (!platform) {
    return c.json({ error: 'platform query param required' }, 400);
  }

  // Find market in cache or fetch fresh
  let market: Market | null = null;

  const cached = marketCache.get(platform);
  if (cached) {
    market = cached.find((m) => m.id === id) || null;
  }

  if (!market) {
    // Try fetching fresh
    try {
      const client = platform === 'polymarket' ? polyClient : kalshiClient;
      const markets = await client.getActiveMarkets();
      marketCache.set(platform, markets);
      market = markets.find((m) => m.id === id) || null;
    } catch {
      // fall through
    }
  }

  if (!market) {
    return c.json({ error: 'Market not found' }, 404);
  }

  // Enrichments
  const enrichments: Record<string, unknown> = {};

  // Cross-platform match
  const matches = getRecentMatches(0.5, 200);
  const match = matches.find(
    (m) =>
      (platform === 'polymarket' && m.polymarket_id === id) ||
      (platform === 'kalshi' && m.kalshi_ticker === id)
  );

  if (match) {
    // Get the other platform's market data
    const otherPlatform = platform === 'polymarket' ? 'kalshi' : 'polymarket';
    const otherId = platform === 'polymarket' ? match.kalshi_ticker : match.polymarket_id;
    const otherSnapshot = getLatestSnapshot(otherPlatform, otherId);

    enrichments.crossPlatform = {
      matchedId: otherId,
      matchedPlatform: otherPlatform,
      confidence: match.confidence,
      method: match.method,
      matchedMarket: otherSnapshot?.data || null,
    };

    // Settlement comparison
    const settlement = getSettlementComparison(match.polymarket_id, match.kalshi_ticker);
    if (settlement) {
      enrichments.settlement = settlement;
    }
  }

  // Price history (last 7 days). DB snapshots are sparse, so for Polymarket fall back to the
  // platform's own CLOB price-history — real data the platform tracks but we don't persist.
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  let history = getMarketHistory(id, weekAgo, now);
  if (history.length < 2 && market.platform === 'polymarket') {
    const live = await polyClient.getPriceHistory(id).catch(() => []);
    if (live.length >= 2) history = live as unknown as typeof history;
  }
  enrichments.priceHistory = history;

  // Metaculus superforecaster data (best-effort, non-blocking)
  try {
    const metaculusData = await findMetaculusMatch(market);
    if (metaculusData) {
      enrichments.metaculus = metaculusData;
    }
  } catch {
    // Metaculus enrichment is optional
  }

  // Cached research sources (populated by `npm run collect:context`). Read-only —
  // a market view never triggers a live scrape.
  const cachedSources = readCachedSources(slugify(market.question));
  if (cachedSources && cachedSources.sources.length > 0) {
    enrichments.sources = cachedSources.sources;
  }

  return c.json({ market, ...enrichments });
});

// --- Market quality helpers ---

/** Meme / derivative market patterns to filter out */
const MEME_PATTERNS = [
  /before gta/i,
  /before gta vi/i,
  /before.*gta/i,
  /gta.*before/i,
  /jesus christ.*return/i,
  /will.*return before/i,
  /before.*release/i,
  /bitcoin hit \$1m before/i,
  /invades?.*before/i,
  /^will.*win.*season \d+ of/i,
];

/** Markets with these patterns are deprioritized but not hidden */
const LOW_QUALITY_PATTERNS = [
  /daily.*temperature/i,
  /\d+[hH]our/i,
  /tonight/i,
  /today's/i,
];

function isMemeMarket(market: Market): boolean {
  const q = market.question;
  // Filter obvious meme/derivative markets
  if (MEME_PATTERNS.some((p) => p.test(q))) return true;
  // Filter markets with zero volume AND zero liquidity (dead markets)
  if ((market.volume || 0) === 0 && (market.liquidity || 0) === 0) return true;
  return false;
}

function qualityScore(market: Market): number {
  const q = market.question;
  let score = 0;

  // Volume score (log scale — $1K = 1, $100K = 2, $10M = 3)
  const vol = market.volume || 0;
  if (vol > 0) score += Math.log10(vol) / 3;

  // Liquidity score
  const liq = market.liquidity || 0;
  if (liq > 0) score += Math.min(2, Math.log10(liq) / 3);

  // Penalize low-quality patterns
  if (LOW_QUALITY_PATTERNS.some((p) => p.test(q))) score -= 2;

  // Boost markets closing soon (within 30 days) — more urgent = more interesting
  if (market.closeDate) {
    const daysLeft = (new Date(market.closeDate).getTime() - Date.now()) / 86400000;
    if (daysLeft > 0 && daysLeft < 30) score += 1;
    if (daysLeft > 0 && daysLeft < 7) score += 1;
  }

  // Boost markets with interesting odds (not 0% or 100%)
  const yesPrice = market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;
  if (yesPrice > 0.05 && yesPrice < 0.95) score += 0.5;
  if (yesPrice > 0.2 && yesPrice < 0.8) score += 0.5;

  return score;
}

/** Infer a category for Polymarket markets (which don't have native categories) */
function inferCategory(question: string): string {
  const q = question.toLowerCase();

  const rules: [RegExp, string][] = [
    [/president|election|congress|senate|governor|democrat|republican|trump|biden|vote|political|party|gop|dnc/i, 'Politics'],
    [/fed\b|inflation|gdp|recession|interest rate|unemployment|tariff|trade war|economic|economy|treasury/i, 'Economics'],
    [/nba|nfl|mlb|nhl|soccer|football|tennis|golf|championship|playoff|super bowl|world cup|stanley cup|masters|finals/i, 'Sports'],
    [/ai\b|artificial intelligence|gpt|openai|google|apple|microsoft|meta\b|tesla|spacex|startup|tech/i, 'Technology'],
    [/bitcoin|btc|ethereum|eth|crypto|defi|blockchain|token/i, 'Crypto'],
    [/climate|temperature|hurricane|earthquake|weather|warming|carbon/i, 'Climate'],
    [/oscar|grammy|emmy|movie|film|album|music|artist|celebrity|james bond|netflix|disney/i, 'Entertainment'],
    [/war|ceasefire|nato|invasion|military|peace|conflict|sanctions|ukraine|russia|china|taiwan|iran|israel/i, 'Geopolitics'],
    [/covid|vaccine|fda|drug|health|pandemic|disease|virus|who\b/i, 'Health'],
    [/pope|religion|church|elon musk|resign|pardon|supreme court|scotus|regulation|law\b/i, 'World'],
  ];

  for (const [pattern, cat] of rules) {
    if (pattern.test(q)) return cat;
  }

  return 'Other';
}
