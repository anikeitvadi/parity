import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import OpenAI from 'openai';
import { PolymarketClient } from '../../../src/services/polymarket.js';
import { KalshiClient } from '../../../src/services/kalshi.js';
import { getRecentMatches, getLatestSnapshot, getSettlementComparison, getMarketHistory } from '../../../src/database/queries.js';
import { SimpleCache } from '../cache.js';
import { buildResearchPrompt } from '../prompts/research.js';
import { findMetaculusMatch } from './markets.js';
import { readCachedSources, slugify } from '../../../src/services/source-collector.js';
import type { Market } from '../../../src/types/market.js';

const polyClient = new PolymarketClient();
const kalshiClient = new KalshiClient();
const marketCache = new SimpleCache<Market[]>(60);
// Completed briefs, keyed by platform:id — repeat views replay free, no model call.
const briefCache = new SimpleCache<string>(600);

// In-memory fixed-window rate limit. Single server, no scheduler — a Map is enough.
// Caps token spend if a public demo is hammered; cache hits skip this entirely.
const RATE_WINDOW_MS = 60_000;
const PER_IP_LIMIT = 5; // brief generations per minute per IP
const GLOBAL_LIMIT = 40; // brief generations per minute, all IPs combined
const rateHits = new Map<string, { count: number; resetAt: number }>();

function takeRateToken(ip: string): boolean {
  const now = Date.now();
  const active = (key: string) => {
    const e = rateHits.get(key);
    return e && now <= e.resetAt ? e : null;
  };
  const global = active('__global__');
  const perIp = active(ip);
  if ((global && global.count >= GLOBAL_LIMIT) || (perIp && perIp.count >= PER_IP_LIMIT)) {
    return false;
  }
  const bump = (key: string) => {
    const e = active(key);
    if (e) e.count++;
    else rateHits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  };
  bump('__global__');
  bump(ip);
  return true;
}

/**
 * Get the AI client configuration.
 * Prefers xAI/Grok (free credits), falls back to OpenAI. The brief does no live
 * web/X retrieval — external sources come from cached artifacts only.
 */
function getAIConfig(): { client: OpenAI; model: string; provider: string } | null {
  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    return {
      client: new OpenAI({ apiKey: xaiKey, baseURL: 'https://api.x.ai/v1' }),
      model: 'grok-3-mini-fast',
      provider: 'xai',
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: 'gpt-4o',
      provider: 'openai',
    };
  }

  return null;
}

export const researchRoutes = new Hono();

// GET /api/markets/:id/research — Stream AI research brief via SSE
researchRoutes.get('/markets/:id/research', async (c) => {
  const aiConfig = getAIConfig();
  if (!aiConfig) {
    return c.json({
      error: 'No AI API key configured. Add XAI_API_KEY (free at console.x.ai) or OPENAI_API_KEY to .env.',
    }, 503);
  }

  const id = c.req.param('id');
  const platform = c.req.query('platform');

  if (!platform) {
    return c.json({ error: 'platform query param required' }, 400);
  }

  const cacheKey = `${platform}:${id}`;

  // Repeat views are free: replay the cached brief without touching the model.
  const cachedBrief = briefCache.get(cacheKey);
  if (cachedBrief) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: cachedBrief });
      await stream.writeSSE({ data: '[DONE]' });
    });
  }

  // Generating a fresh brief spends tokens — rate-limit it so a public demo can't be drained.
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || c.req.header('x-real-ip')
    || 'unknown';
  if (!takeRateToken(ip)) {
    c.header('Retry-After', '60');
    return c.json({ error: 'Rate limit reached — too many briefs generated right now. Try again in a minute.' }, 429);
  }

  // Find market
  let market: Market | null = null;
  const cached = marketCache.get(platform);
  if (cached) {
    market = cached.find((m) => m.id === id) || null;
  }
  if (!market) {
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

  // Gather enrichments
  const crossPlatform = getCrossPlatformData(id, platform);
  const settlement = crossPlatform
    ? getSettlementData(crossPlatform.polymarketId, crossPlatform.kalshiTicker)
    : undefined;

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const priceHistory = getMarketHistory(id, weekAgo, now);

  // Read pre-collected sources only (run `npm run collect:context` to populate) —
  // no live scrape at request time. The brief grounds on the cached artifact, or
  // honestly says it has none. Titles feed the model; the full sourced URLs
  // surface in the UI under "Sources used", not in the prompt.
  const cachedSources = readCachedSources(slugify(market.question));
  const newsHeadlines: string[] = (cachedSources?.sources ?? []).map((s) => s.title);

  // Metaculus superforecaster data (best-effort)
  let metaculus: { title: string; prediction: number; divergence: number } | undefined;
  try {
    const match = await findMetaculusMatch(market);
    if (match) {
      metaculus = { title: match.title, prediction: match.prediction, divergence: match.divergence };
    }
  } catch { /* best-effort */ }

  // Build prompt with all available context
  const { system, user } = buildResearchPrompt({
    market,
    crossPlatform: crossPlatform
      ? {
          matchedPlatform: crossPlatform.otherPlatform,
          matchedMarket: crossPlatform.otherSnapshot?.data as { question: string; prices: Record<string, number> } | null,
          confidence: crossPlatform.confidence,
        }
      : undefined,
    settlement: settlement || undefined,
    priceHistory: priceHistory as unknown as { timestamp: number; data: { prices: Record<string, number> } }[],
    newsHeadlines: newsHeadlines.length > 0 ? newsHeadlines : undefined,
    metaculus,
  });

  // Stream response
  const { client: aiClient, model } = aiConfig;

  return streamSSE(c, async (stream) => {
    try {
      const response = await aiClient.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: true,
      });

      let full = '';
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          full += text;
          await stream.writeSSE({ data: text });
        }
      }

      if (full) briefCache.set(cacheKey, full);
      await stream.writeSSE({ data: '[DONE]' });
    } catch (err) {
      await stream.writeSSE({
        data: `[ERROR] ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  });
});

function getCrossPlatformData(marketId: string, platform: string) {
  const matches = getRecentMatches(0.5, 200);
  const match = matches.find(
    (m) =>
      (platform === 'polymarket' && m.polymarket_id === marketId) ||
      (platform === 'kalshi' && m.kalshi_ticker === marketId)
  );

  if (!match) return null;

  const otherPlatform = platform === 'polymarket' ? 'kalshi' : 'polymarket';
  const otherId = platform === 'polymarket' ? match.kalshi_ticker : match.polymarket_id;
  const otherSnapshot = getLatestSnapshot(otherPlatform, otherId);

  return {
    polymarketId: match.polymarket_id,
    kalshiTicker: match.kalshi_ticker,
    otherPlatform,
    otherSnapshot,
    confidence: match.confidence,
  };
}

function getSettlementData(polymarketId: string, kalshiTicker: string) {
  const comparison = getSettlementComparison(polymarketId, kalshiTicker);
  if (!comparison) return null;
  return {
    similarity: comparison.similarity,
    safeForArbitrage: comparison.safeForArbitrage,
    riskFactors: comparison.riskFactors,
  };
}
