import { Hono } from 'hono';
import { getRecentOpportunities, getOpportunityStats } from '../../../src/database/queries.js';
import { getDatabase } from '../../../src/database/schema.js';
import { PolymarketClient } from '../../../src/services/polymarket.js';
import { KalshiClient } from '../../../src/services/kalshi.js';
import { initEmbeddingTable, embedMarkets, findSemanticMatches } from '../../../src/services/semantic-matcher.js';
import { loadVerifiedPairs, type VerifiedPair, type PairsVerification } from '../pairs-data.js';
import { SimpleCache } from '../cache.js';
import { logger } from '../../../src/utils/logger.js';
import type { Market } from '../../../src/types/market.js';

const matcherLogger = logger.child({ component: 'semantic-matcher' });

interface WatchlistItem {
  id: string;
  type: 'toss_up' | 'closing_soon' | 'high_conviction' | 'contrarian' | 'price_gap';
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  insight: string;
  category?: string;
}

interface FeedItem {
  id: string;
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  category?: string;
  type: WatchlistItem['type'] | null;
  signal: number | null;
  divergence: number | null;
  matchedPlatform?: string;
  matchConfidence?: number;
}

const polyClient = new PolymarketClient();
const kalshiClient = new KalshiClient();
const watchlistCache = new SimpleCache<WatchlistItem[]>(120);
const feedCache = new SimpleCache<FeedItem[]>(120);
const marketCache = new SimpleCache<Market[]>(60);
const pairsCache = new SimpleCache<PairRow[]>(60);
// Verifier provenance for the terminal footer — cached alongside the rows so it survives cache hits.
let cachedVerification: PairsVerification | null = null;

export const opportunityRoutes = new Hono();

// GET /api/opportunities — List scored opportunities from DB
opportunityRoutes.get('/', (c) => {
  const minScore = parseFloat(c.req.query('minScore') || '0');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const hoursBack = parseInt(c.req.query('hoursBack') || '24', 10);
  const type = c.req.query('type');

  let opportunities = getRecentOpportunities(minScore, limit, hoursBack);
  if (type) {
    opportunities = opportunities.filter((o) => o.type === type);
  }
  return c.json({ opportunities });
});

// GET /api/opportunities/scan — Build watchlist from live market data
opportunityRoutes.get('/scan', async (c) => {
  const typeFilter = c.req.query('type') || '';

  const cached = watchlistCache.get('latest');
  if (cached) {
    const filtered = typeFilter ? cached.filter((e) => e.type === typeFilter) : cached;
    return c.json({ opportunities: filtered, cached: true });
  }

  try {
    // Fetch markets
    let polyMarkets = marketCache.get('polymarket');
    if (!polyMarkets) {
      polyMarkets = await polyClient.getActiveMarkets();
      marketCache.set('polymarket', polyMarkets);
    }

    let kalshiMarkets = marketCache.get('kalshi');
    if (!kalshiMarkets) {
      kalshiMarkets = await kalshiClient.getActiveMarkets();
      marketCache.set('kalshi', kalshiMarkets);
    }

    const allMarkets = [...polyMarkets, ...kalshiMarkets];
    const items: WatchlistItem[] = [];

    // 1. TOSS-UPS — priced 40-60%, these are genuinely uncertain
    //    "The crowd can't decide. Worth researching to find your own edge."
    const tossUps = allMarkets
      .filter((m) => {
        const p = getYesPrice(m);
        return p >= 0.35 && p <= 0.65 && (m.volume || 0) > 500;
      })
      .sort((a, b) => {
        // Closest to 50% first, then by volume
        const aDist = Math.abs(getYesPrice(a) - 0.5);
        const bDist = Math.abs(getYesPrice(b) - 0.5);
        if (Math.abs(aDist - bDist) < 0.05) return (b.volume || 0) - (a.volume || 0);
        return aDist - bDist;
      })
      .slice(0, 10);

    for (const m of tossUps) {
      const p = getYesPrice(m);
      items.push({
        id: `toss-${m.platform}-${m.id}`,
        type: 'toss_up',
        platform: m.platform,
        marketId: m.id,
        marketQuestion: m.question,
        yesPrice: p,
        volume: m.volume || 0,
        liquidity: m.liquidity || 0,
        closeDate: m.closeDate,
        category: (m.metadata as Record<string, unknown>)?.category as string,
        insight: `The crowd is split — ${(p * 100).toFixed(0)}% say yes. Do your research and pick a side.`,
      });
    }

    // 2. CLOSING SOON — resolving within 7 days, with volume
    //    "Decision time. These resolve soon — last chance to get in."
    const now = Date.now();
    const closingSoon = allMarkets
      .filter((m) => {
        if (!m.closeDate) return false;
        const daysLeft = (new Date(m.closeDate).getTime() - now) / 86400000;
        return daysLeft > 0 && daysLeft <= 7 && (m.volume || 0) > 500;
      })
      .sort((a, b) => {
        const aClose = new Date(a.closeDate!).getTime();
        const bClose = new Date(b.closeDate!).getTime();
        return aClose - bClose; // Soonest first
      })
      .slice(0, 10);

    for (const m of closingSoon) {
      const p = getYesPrice(m);
      const daysLeft = Math.max(0, (new Date(m.closeDate!).getTime() - now) / 86400000);
      const timeStr = daysLeft < 1
        ? `${Math.round(daysLeft * 24)} hours`
        : `${Math.round(daysLeft)} days`;
      items.push({
        id: `closing-${m.platform}-${m.id}`,
        type: 'closing_soon',
        platform: m.platform,
        marketId: m.id,
        marketQuestion: m.question,
        yesPrice: p,
        volume: m.volume || 0,
        liquidity: m.liquidity || 0,
        closeDate: m.closeDate,
        category: (m.metadata as Record<string, unknown>)?.category as string,
        insight: `Resolves in ${timeStr}. Currently at ${(p * 100).toFixed(0)}% yes.`,
      });
    }

    // 3. HIGH CONVICTION — priced >85% or <15% with high volume
    //    "The crowd is very confident. Are they right?"
    const highConviction = allMarkets
      .filter((m) => {
        const p = getYesPrice(m);
        return ((p >= 0.85 && p < 1) || (p > 0 && p <= 0.15)) && (m.volume || 0) > 2000;
      })
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 10);

    for (const m of highConviction) {
      const p = getYesPrice(m);
      const isYes = p >= 0.85;
      items.push({
        id: `conviction-${m.platform}-${m.id}`,
        type: 'high_conviction',
        platform: m.platform,
        marketId: m.id,
        marketQuestion: m.question,
        yesPrice: p,
        volume: m.volume || 0,
        liquidity: m.liquidity || 0,
        closeDate: m.closeDate,
        category: (m.metadata as Record<string, unknown>)?.category as string,
        insight: isYes
          ? `${(p * 100).toFixed(0)}% say yes — the crowd is very confident. Easy money or a trap?`
          : `Only ${(p * 100).toFixed(0)}% say yes — almost everyone disagrees. Are they all wrong?`,
      });
    }

    // 4. CONTRARIAN — priced 10-25% or 75-90% with volume
    //    "Not a long shot, but the crowd thinks it's unlikely. Worth a deeper look."
    const contrarian = allMarkets
      .filter((m) => {
        const p = getYesPrice(m);
        return ((p >= 0.10 && p < 0.25) || (p > 0.75 && p <= 0.90)) && (m.volume || 0) > 1000;
      })
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 10);

    for (const m of contrarian) {
      const p = getYesPrice(m);
      const isUnderdog = p < 0.5;
      items.push({
        id: `contrarian-${m.platform}-${m.id}`,
        type: 'contrarian',
        platform: m.platform,
        marketId: m.id,
        marketQuestion: m.question,
        yesPrice: p,
        volume: m.volume || 0,
        liquidity: m.liquidity || 0,
        closeDate: m.closeDate,
        category: (m.metadata as Record<string, unknown>)?.category as string,
        insight: isUnderdog
          ? `${(p * 100).toFixed(0)}% odds — the crowd thinks it's unlikely. If you disagree, there's value.`
          : `${(p * 100).toFixed(0)}% odds — likely but not certain. Bet against the crowd or lock it in?`,
      });
    }

    // 5. PRICE GAPS — semantic cross-platform matching (requires OPENAI_API_KEY)
    let priceGapCount = 0;
    if (process.env.OPENAI_API_KEY && polyMarkets.length > 0 && kalshiMarkets.length > 0) {
      try {
        const db = getDatabase();
        initEmbeddingTable(db);

        // Embed all markets (skips already-fresh embeddings)
        await embedMarkets(db, [...polyMarkets, ...kalshiMarkets]);

        // Find semantic matches
        const semanticMatches = findSemanticMatches(db, polyMarkets, kalshiMarkets);

        for (const match of semanticMatches) {
          const polyYes = getYesPrice(match.polymarket);
          const kalshiYes = getYesPrice(match.kalshi);
          const gap = Math.abs(polyYes - kalshiYes);

          // Only surface gaps > 3% (after accounting for fees)
          if (gap < 0.03) continue;

          priceGapCount++;
          items.push({
            id: `gap-${match.polymarket.id}-${match.kalshi.id}`,
            type: 'price_gap',
            platform: 'polymarket',
            marketId: match.polymarket.id,
            marketQuestion: match.polymarket.question,
            yesPrice: polyYes,
            volume: Math.max(match.polymarket.volume || 0, match.kalshi.volume || 0),
            liquidity: Math.min(match.polymarket.liquidity || 0, match.kalshi.liquidity || 0),
            closeDate: match.polymarket.closeDate,
            category: (match.polymarket.metadata as Record<string, unknown>)?.category as string,
            insight: `Polymarket: ${(polyYes * 100).toFixed(0)}% vs Kalshi: ${(kalshiYes * 100).toFixed(0)}% — ${(gap * 100).toFixed(0)}pp gap on the same event. Match confidence: ${(match.similarity * 100).toFixed(0)}%.`,
          });
        }
      } catch (err) {
        // Semantic matching is best-effort — don't break the whole scan
        matcherLogger.warn({ err }, 'Semantic matching failed');
      }
    }

    watchlistCache.set('latest', items);

    const filtered = typeFilter ? items.filter((e) => e.type === typeFilter) : items;

    return c.json({
      opportunities: filtered,
      cached: false,
      stats: {
        tossUps: tossUps.length,
        closingSoon: closingSoon.length,
        highConviction: highConviction.length,
        contrarian: contrarian.length,
        priceGaps: priceGapCount,
      },
    });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Scan failed',
      opportunities: [],
    }, 500);
  }
});

// GET /api/opportunities/feed — Full market universe, each annotated with
// cross-platform divergence (computed server-side) and an opportunity tag.
// This is the data source for the research list: browse everything, sorted
// by how far the price sits from the cross-platform signal.
opportunityRoutes.get('/feed', async (c) => {
  const cached = feedCache.get('latest');
  if (cached) return c.json({ items: cached, cached: true });

  try {
    let polyMarkets = marketCache.get('polymarket');
    if (!polyMarkets) {
      polyMarkets = await polyClient.getActiveMarkets();
      marketCache.set('polymarket', polyMarkets);
    }
    let kalshiMarkets = marketCache.get('kalshi');
    if (!kalshiMarkets) {
      kalshiMarkets = await kalshiClient.getActiveMarkets();
      marketCache.set('kalshi', kalshiMarkets);
    }

    // Build a cross-platform divergence map keyed by `${platform}:${id}`.
    // Reuses the precomputed embeddings — findSemanticMatches is pure
    // in-memory cosine similarity, no API calls.
    const divergence = new Map<string, { signal: number; matchedPlatform: string; confidence: number }>();
    if (process.env.OPENAI_API_KEY && polyMarkets.length > 0 && kalshiMarkets.length > 0) {
      try {
        const db = getDatabase();
        initEmbeddingTable(db);
        await embedMarkets(db, [...polyMarkets, ...kalshiMarkets]);
        for (const match of findSemanticMatches(db, polyMarkets, kalshiMarkets)) {
          const polyYes = getYesPrice(match.polymarket);
          const kalshiYes = getYesPrice(match.kalshi);
          divergence.set(`polymarket:${match.polymarket.id}`, { signal: kalshiYes, matchedPlatform: 'kalshi', confidence: match.similarity });
          divergence.set(`kalshi:${match.kalshi.id}`, { signal: polyYes, matchedPlatform: 'polymarket', confidence: match.similarity });
        }
      } catch (err) {
        matcherLogger.warn({ err }, 'Feed divergence matching failed');
      }
    }

    const items: FeedItem[] = [...polyMarkets, ...kalshiMarkets].map((m) => {
      const yesPrice = getYesPrice(m);
      const div = divergence.get(`${m.platform}:${m.id}`);
      const signal = div ? div.signal : null;
      return {
        id: `${m.platform}:${m.id}`,
        platform: m.platform,
        marketId: m.id,
        marketQuestion: m.question,
        yesPrice,
        volume: m.volume || 0,
        liquidity: m.liquidity || 0,
        closeDate: m.closeDate,
        category: (m.metadata as Record<string, unknown>)?.category as string,
        type: classifyMarket(m, yesPrice, signal),
        signal,
        divergence: signal != null ? signal - yesPrice : null,
        matchedPlatform: div?.matchedPlatform,
        matchConfidence: div?.confidence,
      };
    });

    feedCache.set('latest', items);
    return c.json({ items, cached: false });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Feed failed', items: [] }, 500);
  }
});

/** One cross-platform PAIR row — the unit of the live terminal (not an individual market). */
interface PairRow {
  id: string;
  event: string;
  polymarket: { id: string; title: string; yes: number; volume: number; live: boolean };
  kalshi: { id: string; title: string; yes: number; volume: number; live: boolean };
  yesAligned: boolean;
  gap: number; // oriented, using live prices where available
  feeFloor: number;
  beatsFees: boolean;
  cosine: number;
  liquidity: number; // thinner-side volume
  status: 'survivor' | 'same_contract' | 'spec_mismatch' | 'topical' | 'stale';
  strictSurvivor: boolean; // passed the 7-point spec checklist (deepest tier)
  liquidityTier?: string;
  checklist?: Record<string, boolean | string>; // 7-point spec checklist (liquid survivors only)
  corrected: boolean; // a false-positive verdict reclassified by the correction overlay
  correctionReason?: string;
  correctionSource?: string;
  reason: string;
  category?: string;
  verifiedAt: string;
  pricesLive: boolean; // both sides refreshed against the live universe
}

// Map the study's triage label → the terminal's honest status. The verdict is the study's, not
// re-derived here — that's what keeps orientation/degenerate artifacts out of the queue.
function statusFor(triageLabel: string): PairRow['status'] {
  switch (triageLabel) {
    case 'dropped_degenerate': return 'stale';
    case 'scope_mismatch':
    case 'entity_mismatch_rejected':
    case 'spec_mismatch': return 'spec_mismatch'; // corrected verdicts use the canonical label
    case 'semantic_survivor': return 'survivor';
    case 'validated_same_contract': return 'same_contract';
    default: return 'topical'; // topical_overlap: same event, not the same contract
  }
}

const STATUS_RANK: Record<PairRow['status'], number> = {
  survivor: 0, same_contract: 1, spec_mismatch: 2, topical: 3, stale: 4,
};

// GET /api/opportunities/pairs — the live cross-platform pair terminal.
// Reads the FROZEN study verdicts (triaged, oriented) and refreshes prices against the live
// universe. Cached rigor + live prices; never recomputes the study here.
opportunityRoutes.get('/pairs', async (c) => {
  let rows = pairsCache.get('latest');
  if (!rows) {
    const loaded = loadVerifiedPairs();
    const verified: VerifiedPair[] = loaded?.pairs ?? [];
    cachedVerification = loaded?.verification ?? null;

    // Live price/volume map for the markets currently traded (so the live subset is current).
    const live = new Map<string, { yes: number; volume: number }>();
    try {
      let poly = marketCache.get('polymarket');
      if (!poly) { poly = await polyClient.getActiveMarkets(); marketCache.set('polymarket', poly); }
      let kalshi = marketCache.get('kalshi');
      if (!kalshi) { kalshi = await kalshiClient.getActiveMarkets(); marketCache.set('kalshi', kalshi); }
      for (const m of poly) live.set(`polymarket:${m.id}`, { yes: getYesPrice(m), volume: m.volume ?? 0 });
      for (const m of kalshi) live.set(`kalshi:${m.id}`, { yes: getYesPrice(m), volume: m.volume ?? 0 });
    } catch (err) {
      matcherLogger.warn({ err }, 'pairs: live price refresh failed — using study snapshot prices');
    }

    rows = verified.map((p) => {
      const polyLive = live.get(`polymarket:${p.polymarketId}`);
      const kalshiLive = live.get(`kalshi:${p.kalshiId}`);
      const polyYes = polyLive ? polyLive.yes : p.polymarketYes;
      // Re-orient the live Kalshi quote the same way the study did; otherwise keep the oriented snapshot.
      const kalshiYes = kalshiLive ? (p.yesAligned ? kalshiLive.yes : 1 - kalshiLive.yes) : p.kalshiYes;
      const gap = Math.abs(polyYes - kalshiYes);
      const polyVol = polyLive ? polyLive.volume : p.polyVolume;
      const kalshiVol = kalshiLive ? kalshiLive.volume : p.kalshiVolume;
      return {
        id: `${p.polymarketId}::${p.kalshiId}`,
        event: p.polymarketTitle,
        polymarket: { id: p.polymarketId, title: p.polymarketTitle, yes: polyYes, volume: polyVol, live: !!polyLive },
        kalshi: { id: p.kalshiId, title: p.kalshiTitle, yes: kalshiYes, volume: kalshiVol, live: !!kalshiLive },
        yesAligned: p.yesAligned,
        gap,
        feeFloor: p.feeFloor,
        beatsFees: gap > p.feeFloor,
        cosine: p.cosine,
        liquidity: Math.min(polyVol, kalshiVol),
        status: statusFor(p.triageLabel),
        strictSurvivor: !!p.strictSurvivor,
        liquidityTier: p.liquidityTier,
        checklist: p.checklist,
        corrected: !!p.corrected,
        correctionReason: p.correctionReason,
        correctionSource: p.correctionSource,
        reason: p.reason,
        category: p.category,
        verifiedAt: p.verifiedAt,
        pricesLive: !!(polyLive && kalshiLive),
      };
    });
    pairsCache.set('latest', rows);
  }

  // Filters (all optional query params) — applied per request over the cached rows.
  const q = c.req.query();
  const search = (q.search ?? '').toLowerCase();
  const minLiquidity = q.minLiquidity ? Number(q.minLiquidity) : 0;
  let out = rows;
  if (search) out = out.filter((r) => r.event.toLowerCase().includes(search) || r.kalshi.title.toLowerCase().includes(search));
  if (q.status) out = out.filter((r) => r.status === q.status);
  else {
    // Default view = the comparable contracts + their rejections; topical/stale noise behind a toggle.
    if (q.includeStale !== 'true') out = out.filter((r) => r.status !== 'stale');
    if (q.includeTopical !== 'true') out = out.filter((r) => r.status !== 'topical');
    if (q.includeMismatch === 'false') out = out.filter((r) => r.status !== 'spec_mismatch');
  }
  if (minLiquidity) out = out.filter((r) => r.liquidity >= minLiquidity);

  const sort = q.sort ?? 'opportunity';
  out = [...out].sort((a, b) => {
    if (sort === 'gap') return b.gap - a.gap;
    if (sort === 'liquidity') return b.liquidity - a.liquidity;
    if (sort === 'confidence') return b.cosine - a.cosine;
    // 'opportunity' (default): survivors first, and within each status the most CREDIBLE rows lead —
    // the 7/7 strict survivors, then deepest liquidity — so the queue opens on the real candidates,
    // not the thin near-settled extremes (those are found via the 'gap' sort).
    return (
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      Number(b.strictSurvivor) - Number(a.strictSurvivor) ||
      b.liquidity - a.liquidity
    );
  });

  const limit = q.limit ? Number(q.limit) : 400;
  const counts = { survivor: 0, same_contract: 0, spec_mismatch: 0, topical: 0, stale: 0 } as Record<PairRow['status'], number>;
  for (const r of rows) counts[r.status]++;
  return c.json({
    pairs: out.slice(0, limit),
    meta: {
      verifiedAt: rows[0]?.verifiedAt ?? null,
      feeFloor: rows[0]?.feeFloor ?? 0.09,
      total: rows.length,
      shown: Math.min(out.length, limit),
      live: rows.filter((r) => r.pricesLive).length,
      counts,
      verification: cachedVerification,
    },
  });
});

interface LiveSide { found: boolean; active: boolean; yes: number | null; volume: number | null; hasBook: boolean }

async function livePolySide(conditionId: string): Promise<LiveSide> {
  try {
    const d = await polyClient.getMarketDetails(conditionId);
    if (!d) return { found: false, active: false, yes: null, volume: null, hasBook: false };
    const yesTok = d.tokens?.find((t) => (t.outcome ?? '').toLowerCase() === 'yes');
    const active = d.active !== false && d.closed !== true;
    const yes = typeof yesTok?.price === 'number' ? yesTok.price : null;
    return { found: true, active, yes, volume: null, hasBook: active && yes != null };
  } catch {
    return { found: false, active: false, yes: null, volume: null, hasBook: false };
  }
}

async function liveKalshiSide(ticker: string): Promise<LiveSide> {
  try {
    const m = await kalshiClient.getMarket(ticker);
    if (!m) return { found: false, active: false, yes: null, volume: null, hasBook: false };
    return { found: true, active: m.active, yes: m.yes, volume: m.volume, hasBook: m.hasBook };
  } catch {
    return { found: false, active: false, yes: null, volume: null, hasBook: false };
  }
}

// GET /api/opportunities/pair-live?poly=<conditionId>&kalshi=<ticker>
// On-demand live price/liquidity for both sides of a pair. The dossier calls this on open so a
// study-backed row shows CURRENT prices where the markets still trade — and says so honestly when a
// side has gone inactive. The verifier verdict stays cached; only price/liquidity is refreshed.
opportunityRoutes.get('/pair-live', async (c) => {
  const poly = c.req.query('poly');
  const kalshi = c.req.query('kalshi');
  const [polymarket, kalshiSide] = await Promise.all([
    poly ? livePolySide(poly) : Promise.resolve(null),
    kalshi ? liveKalshiSide(kalshi) : Promise.resolve(null),
  ]);
  return c.json({ polymarket, kalshi: kalshiSide, fetchedAt: new Date().toISOString() });
});

async function polyHistory(conditionId: string, days: number): Promise<{ timestamp: number; yes: number }[]> {
  try {
    const raw = await polyClient.getPriceHistory(conditionId, days);
    return raw
      .map((pt) => {
        const prices = pt.data?.prices ?? {};
        const yes = prices['Yes'] ?? prices['yes'] ?? Object.values(prices)[0];
        return { timestamp: pt.timestamp, yes: typeof yes === 'number' ? yes : NaN };
      })
      .filter((p) => Number.isFinite(p.yes) && p.yes > 0 && p.yes < 1);
  } catch {
    return [];
  }
}

// GET /api/opportunities/pair-history?poly=<conditionId>&kalshi=<ticker>&days=30
// Daily YES-price history for BOTH venues, so the dossier can chart Poly vs Kalshi over time.
// Either side may be empty (honest "history unavailable"); Kalshi is via the candlesticks endpoint.
opportunityRoutes.get('/pair-history', async (c) => {
  const poly = c.req.query('poly');
  const kalshi = c.req.query('kalshi');
  const days = c.req.query('days') ? Number(c.req.query('days')) : 30;
  const [polymarket, kalshiSide] = await Promise.all([
    poly ? polyHistory(poly, days) : Promise.resolve([]),
    kalshi ? kalshiClient.getPriceHistory(kalshi, days).catch(() => []) : Promise.resolve([]),
  ]);
  return c.json({ polymarket, kalshi: kalshiSide });
});

// GET /api/opportunities/stats
opportunityRoutes.get('/stats', (c) => {
  const stats = getOpportunityStats();
  return c.json(stats);
});

function getYesPrice(market: Market): number {
  return market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;
}

/**
 * Assign a single opportunity tag to a market using the same thresholds as
 * the /scan buckets. Returns null if the market isn't notable. Priority:
 * a real cross-platform gap wins, then time pressure, then price band.
 */
function classifyMarket(m: Market, yesPrice: number, signal: number | null): WatchlistItem['type'] | null {
  if (signal != null && Math.abs(signal - yesPrice) >= 0.03) return 'price_gap';

  const vol = m.volume || 0;
  if (m.closeDate) {
    const daysLeft = (new Date(m.closeDate).getTime() - Date.now()) / 86400000;
    if (daysLeft > 0 && daysLeft <= 7 && vol > 500) return 'closing_soon';
  }
  if (yesPrice >= 0.35 && yesPrice <= 0.65 && vol > 500) return 'toss_up';
  if (((yesPrice >= 0.85 && yesPrice < 1) || (yesPrice > 0 && yesPrice <= 0.15)) && vol > 2000) return 'high_conviction';
  if (((yesPrice >= 0.10 && yesPrice < 0.25) || (yesPrice > 0.75 && yesPrice <= 0.90)) && vol > 1000) return 'contrarian';
  return null;
}
