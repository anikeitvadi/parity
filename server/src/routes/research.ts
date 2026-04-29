import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import OpenAI from 'openai';
import { PolymarketClient } from '../../../src/services/polymarket.js';
import { KalshiClient } from '../../../src/services/kalshi.js';
import { getRecentMatches, getLatestSnapshot, getSettlementComparison, getMarketHistory } from '../../../src/database/queries.js';
import { SimpleCache } from '../cache.js';
import { buildResearchPrompt } from '../prompts/research.js';
import { findMetaculusMatch } from './markets.js';
import type { Market } from '../../../src/types/market.js';

const polyClient = new PolymarketClient();
const kalshiClient = new KalshiClient();
const marketCache = new SimpleCache<Market[]>(60);

/**
 * Get the AI client configuration.
 * Prefers xAI/Grok (free credits + real-time X data), falls back to OpenAI.
 */
function getAIConfig(): { client: OpenAI; model: string; provider: string; hasXSearch: boolean } | null {
  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    return {
      client: new OpenAI({ apiKey: xaiKey, baseURL: 'https://api.x.ai/v1' }),
      model: 'grok-3-mini-fast',
      provider: 'xai',
      hasXSearch: true,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: 'gpt-4o',
      provider: 'openai',
      hasXSearch: false,
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

  // Fetch social/news context via xAI x_search if available, else DuckDuckGo
  let newsHeadlines: string[] = [];
  let xPosts: string[] = [];

  if (aiConfig.hasXSearch) {
    // Use Grok to search X for relevant posts — separate quick call
    try {
      const xSearchResult = await aiConfig.client.chat.completions.create({
        model: 'grok-3-mini-fast',
        messages: [
          {
            role: 'system',
            content: 'Search X/Twitter for recent posts about this topic. Return only the 5 most relevant and informative posts as a numbered list. Include the poster\'s handle if visible. Be concise.',
          },
          {
            role: 'user',
            content: `Find recent X posts about: ${market.question}`,
          },
        ],
        max_tokens: 400,
      });
      const xContent = xSearchResult.choices[0]?.message?.content || '';
      if (xContent) {
        xPosts = xContent
          .split('\n')
          .filter((line) => line.trim().length > 10)
          .slice(0, 5);
      }
    } catch {
      // x_search is best-effort
    }
  } else {
    // Fallback: DuckDuckGo news search
    const { fetchNewsContext } = await import('../prompts/research.js');
    newsHeadlines = await fetchNewsContext(market.question);
  }

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
    xPosts: xPosts.length > 0 ? xPosts : undefined,
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

      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          await stream.writeSSE({ data: text });
        }
      }

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
