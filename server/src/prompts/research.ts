import type { Market } from '../../../src/types/market.js';

interface ResearchContext {
  market: Market;
  crossPlatform?: {
    matchedPlatform: string;
    matchedMarket: { question: string; prices: Record<string, number> } | null;
    confidence: number;
  };
  settlement?: {
    similarity: { overall: number };
    safeForArbitrage: boolean;
    riskFactors: string[];
  };
  priceHistory?: { timestamp: number; data: { prices: Record<string, number> } }[];
  metaculus?: {
    title: string;
    prediction: number;
    divergence: number;
  };
  newsHeadlines?: string[];
  xPosts?: string[];
}

/**
 * Fetch recent news headlines relevant to a market question.
 * Uses DuckDuckGo instant answer API (free, no key needed).
 */
export async function fetchNewsContext(question: string): Promise<string[]> {
  const keywords = question
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join(' ');

  if (!keywords) return [];

  try {
    // Use DuckDuckGo HTML search and extract titles (lightweight, no API key)
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keywords + ' news 2026')}`,
      {
        headers: { 'User-Agent': 'PredictionMarketScanner/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return [];

    const html = await res.text();

    // Extract result titles from DDG HTML results
    const titles: string[] = [];
    const regex = /<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && titles.length < 5) {
      const title = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
      if (title.length > 10) titles.push(title);
    }

    return titles;
  } catch {
    return [];
  }
}

export function buildResearchPrompt(ctx: ResearchContext): { system: string; user: string } {
  const { market } = ctx;
  const yesPrice = market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;

  const hasNews = ctx.newsHeadlines && ctx.newsHeadlines.length > 0;
  const hasXPosts = ctx.xPosts && ctx.xPosts.length > 0;
  const hasSocialContext = hasNews || hasXPosts;
  const hasMetaculus = !!ctx.metaculus;
  const hasCrossPlatform = !!ctx.crossPlatform?.matchedMarket;

  const system = `You are an expert prediction market analyst. Provide concise, actionable research briefs that help traders make informed decisions. Be direct and specific. ${hasSocialContext ? 'Reference the provided social/news context when relevant.' : ''} If data is limited, say so.`;

  let userPrompt = `Analyze this prediction market and provide an actionable research brief.

## Market
- Question: ${market.question}
- Platform: ${market.platform}
- Current Odds: Yes ${(yesPrice * 100).toFixed(1)}% / No ${((1 - yesPrice) * 100).toFixed(1)}%`;

  if (market.volume) {
    userPrompt += `\n- Volume: $${market.volume.toLocaleString()}`;
  }
  if (market.closeDate) {
    userPrompt += `\n- Closes: ${market.closeDate}`;
  }

  // News context
  if (hasNews) {
    userPrompt += `\n\n## Recent News Headlines`;
    for (const headline of ctx.newsHeadlines!) {
      userPrompt += `\n- ${headline}`;
    }
  }

  // X/Twitter social context
  if (hasXPosts) {
    userPrompt += `\n\n## Recent X/Twitter Posts`;
    for (const post of ctx.xPosts!) {
      userPrompt += `\n- ${post}`;
    }
  }

  // Metaculus data
  if (hasMetaculus) {
    userPrompt += `\n\n## Superforecaster Data (Metaculus)
- Metaculus Question: ${ctx.metaculus!.title}
- Superforecaster Prediction: ${(ctx.metaculus!.prediction * 100).toFixed(1)}%
- Divergence from Market: ${(ctx.metaculus!.divergence * 100).toFixed(1)}%`;
  }

  // Cross-platform data
  if (hasCrossPlatform) {
    const otherPrices = ctx.crossPlatform!.matchedMarket!.prices;
    const otherYes = otherPrices['Yes'] ?? otherPrices['yes'] ?? Object.values(otherPrices)[0] ?? 0.5;
    userPrompt += `\n\n## Cross-Platform Comparison
- ${market.platform}: Yes ${(yesPrice * 100).toFixed(1)}%
- ${ctx.crossPlatform!.matchedPlatform}: Yes ${(otherYes * 100).toFixed(1)}%
- Price Delta: ${(Math.abs(yesPrice - otherYes) * 100).toFixed(1)}%`;

    if (ctx.settlement) {
      userPrompt += `\n- Settlement Safety: ${ctx.settlement.safeForArbitrage ? 'Safe' : 'Unsafe'}`;
      if (ctx.settlement.riskFactors.length > 0) {
        userPrompt += `\n- Risk Factors: ${ctx.settlement.riskFactors.join(', ')}`;
      }
    }
  }

  // Price history
  if (ctx.priceHistory && ctx.priceHistory.length > 1) {
    const recent = ctx.priceHistory.slice(-10);
    const trend = recent.map((s) => {
      const p = s.data.prices['Yes'] ?? s.data.prices['yes'] ?? Object.values(s.data.prices)[0] ?? 0.5;
      return `${new Date(s.timestamp).toLocaleDateString()}: ${(p * 100).toFixed(0)}%`;
    });
    userPrompt += `\n\n## Recent Price History\n${trend.join('\n')}`;
  }

  let section = 1;
  userPrompt += `\n\nProvide:
${section++}. **Context** — What this market is about (1 short paragraph)
${section++}. **Key Factors** — 3-5 specific factors that could move this market`;

  if (hasSocialContext) {
    userPrompt += `\n${section++}. **Social & News Analysis** — What the ${hasXPosts ? 'X/Twitter posts' : 'news headlines'}${hasXPosts && hasNews ? ' and news' : ''} reveal about current sentiment and developments`;
  }

  userPrompt += `\n${section++}. **Bull Case** — Why Yes might be underpriced
${section++}. **Bear Case** — Why No might be underpriced
${section++}. **Risks** — Key uncertainties and what to watch for`;

  if (hasMetaculus) {
    userPrompt += `\n${section++}. **Forecaster Signal** — What the ${(ctx.metaculus!.divergence * 100).toFixed(0)}% divergence between superforecasters and the market might mean`;
  }

  if (hasCrossPlatform) {
    userPrompt += `\n${section++}. **Cross-Platform Signal** — What the price gap between platforms might indicate`;
  }

  userPrompt += `\n\nKeep it under 600 words. Be specific and actionable.`;

  return { system, user: userPrompt };
}
