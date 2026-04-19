import { Hono } from 'hono';
import { getRecentOpportunities, getOpportunityStats } from '../../../src/database/queries.js';
import { getDatabase } from '../../../src/database/schema.js';
import { PolymarketClient } from '../../../src/services/polymarket.js';
import { KalshiClient } from '../../../src/services/kalshi.js';
import { initEmbeddingTable, embedMarkets, findSemanticMatches } from '../../../src/services/semantic-matcher.js';
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

const polyClient = new PolymarketClient();
const kalshiClient = new KalshiClient();
const watchlistCache = new SimpleCache<WatchlistItem[]>(120);
const marketCache = new SimpleCache<Market[]>(60);

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
            platform: 'cross',
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

// GET /api/opportunities/stats
opportunityRoutes.get('/stats', (c) => {
  const stats = getOpportunityStats();
  return c.json(stats);
});

function getYesPrice(market: Market): number {
  return market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;
}
