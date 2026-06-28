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

export function buildResearchPrompt(ctx: ResearchContext): { system: string; user: string } {
  const { market } = ctx;
  const yesPrice = market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;

  const hasNews = ctx.newsHeadlines && ctx.newsHeadlines.length > 0;
  const hasXPosts = ctx.xPosts && ctx.xPosts.length > 0;
  const hasSocialContext = hasNews || hasXPosts;
  const hasMetaculus = !!ctx.metaculus;
  const hasCrossPlatform = !!ctx.crossPlatform?.matchedMarket;

  const system = `You are a sharp prediction-market trader writing a decision brief for another trader who is ALREADY looking at the live odds, the price chart, and any forecaster/cross-platform signals. Do not restate those numbers or explain what the market is — add judgment they can act on.

Rules:
- Open with a verdict line: a directional call (Lean YES / Lean NO / Pass), your estimated fair-value probability, and the edge versus the current price in percentage points.
- Commit to a fair-value number even under uncertainty. If the data is thin, say so and mark conviction Low — don't refuse to call it.
- Be concrete. Name the specific events, players, numbers, or dynamics that decide this. Ban filler like "monitor the news", "pay attention to outcomes", or "stay updated".
- Tight markdown: bold section labels, bullets over paragraphs, blank line between sections. Bold the key numbers.${hasSocialContext ? '\n- Use the provided news/social context only where it actually changes the read.' : ''}
- Source honesty: ground every claim in the data provided below. Never invent article titles, URLs, quotes, or statistics, and never claim you searched the web, news, or X/Twitter in real time.${hasSocialContext ? ' Treat the provided headlines/posts as the only external sources you have.' : ' No external news or social sources were retrieved for this market — do not imply you have live coverage; reason from base rates and the listed signals, and note the thin sourcing if it affects the call.'}`;

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

  userPrompt += `\n\nWrite the brief in this exact markdown structure, under 250 words:

**Verdict** — one line, e.g. \`Lean YES · Fair value ~58% · Edge +6pp · Conviction Med\` (use Pass if there's no edge).

**Thesis** — 1–2 sentences on the core reason for the call.

**Drivers** — 3–4 bullets naming the specific things that decide the outcome.

**Bull / Bear** — one bullet each: the strongest reason Yes is cheap, the strongest reason No is cheap.

**Catalysts** — concrete near-term events before close that would move the price, with rough timing.`;

  if (hasSocialContext) {
    userPrompt += `\n\n**Sentiment** — one line on what the ${hasXPosts ? 'X/Twitter posts' : 'news'}${hasXPosts && hasNews ? ' and news' : ''} actually signal (skip if they add nothing).`;
  }

  if (hasMetaculus || hasCrossPlatform) {
    const parts: string[] = [];
    if (hasMetaculus) parts.push(`the ${(ctx.metaculus!.divergence * 100).toFixed(0)}pp superforecaster divergence`);
    if (hasCrossPlatform) parts.push('the cross-platform price gap');
    userPrompt += `\n\n**Signal read** — one line on whether ${parts.join(' and ')} is a real edge or noise${hasCrossPlatform ? ', after round-trip trading fees and any settlement-rule differences between the two platforms' : ''}.`;
  }

  return { system, user: userPrompt };
}
