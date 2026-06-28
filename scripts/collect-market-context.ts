/**
 * Optional offline source collector (CLI).
 *
 * Given a market query/title (or a --platform/--id to resolve one), collects
 * attributable sources and caches them to docs/data/research-context/<slug>.json.
 * The AI brief and Research Terminal read those cached artifacts.
 *
 * Adapters:
 *   --adapter web | auto   (default) built-in DuckDuckGo web search — the implemented collector
 *   --adapter agent-reach  planned optional adapter (separate Python CLI); reports its
 *                          status and falls back to the web adapter unless --no-fallback
 *
 * Agent-Reach (https://github.com/Panniantong/agent-reach) is a Python CLI, not an npm
 * package, and its integration is a documented future step — the app never requires it.
 *
 * Examples:
 *   npm run collect:context -- "Will the Fed cut rates in September 2026?"
 *   npm run collect:context -- --platform polymarket --id 0x123
 */

import 'dotenv/config';
import { PolymarketClient } from '../src/services/polymarket.js';
import { KalshiClient } from '../src/services/kalshi.js';
import {
  agentReachCliAvailable,
  collectWeb,
  writeCachedSources,
  slugify,
  type Source,
  type ResearchContextArtifact,
} from '../src/services/source-collector.js';

interface Args {
  query?: string;
  platform?: string;
  id?: string;
  adapter: 'auto' | 'web' | 'agent-reach';
  limit: number;
  noFallback: boolean;
  slug?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { adapter: 'auto', limit: 5, noFallback: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--platform') args.platform = argv[++i];
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--adapter') args.adapter = argv[++i] as Args['adapter'];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 5;
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--no-fallback') args.noFallback = true;
    else positional.push(a);
  }
  if (positional.length) args.query = positional.join(' ');
  return args;
}

function printAgentReachStatus(detected: boolean): void {
  if (detected) {
    console.log(`
Agent-Reach CLI detected on PATH — but its source-collection integration is a planned
step, so the built-in DuckDuckGo adapter is what's wired up today.
`);
  } else {
    console.log(`
Agent-Reach is a planned optional adapter for richer sources (RSS, GitHub, social, video).
It's a separate Python 3.10+ CLI, not an npm package: https://github.com/Panniantong/agent-reach
The implemented collector today is the built-in DuckDuckGo web adapter.
`);
  }
}

async function resolveQuery(args: Args): Promise<{ query: string; market?: ResearchContextArtifact['market'] }> {
  if (args.platform && args.id) {
    const client = args.platform === 'polymarket' ? new PolymarketClient() : new KalshiClient();
    const markets = await client.getActiveMarkets();
    const m = markets.find((x) => x.id === args.id);
    if (!m) {
      console.error(`Market not found: ${args.platform}:${args.id}`);
      process.exit(1);
    }
    return { query: m.question, market: { platform: m.platform, id: m.id, question: m.question } };
  }
  if (!args.query) {
    console.error('Usage: collect-market-context "<market question>"  [--platform p --id id] [--adapter auto|web|agent-reach] [--no-fallback]');
    process.exit(1);
  }
  return { query: args.query };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { query, market } = await resolveQuery(args);
  const slug = args.slug || slugify(market?.question ?? query);

  console.log(`Collecting sources for: "${query}"`);
  console.log(`  slug: ${slug} · adapter: ${args.adapter}`);

  let sources: Source[];

  if (args.adapter === 'agent-reach') {
    // Agent-Reach is a planned optional adapter (separate Python CLI), not wired
    // up yet — report status honestly, then fall back to the implemented adapter.
    printAgentReachStatus(agentReachCliAvailable());
    if (args.noFallback) {
      console.log('Exiting without collecting (--no-fallback).');
      process.exit(0); // graceful
    }
    console.log('Using the built-in DuckDuckGo web adapter…');
    sources = await collectWeb(query, args.limit);
  } else {
    // 'auto' (default) and 'web' both use the implemented DuckDuckGo adapter.
    sources = await collectWeb(query, args.limit);
  }

  if (sources.length === 0) {
    console.log('No sources found. Nothing cached.');
    process.exit(0);
  }

  const artifact: ResearchContextArtifact = {
    slug,
    query,
    market,
    generatedAt: new Date().toISOString(),
    sources,
  };
  const path = writeCachedSources(artifact);

  console.log(`\nCached ${sources.length} source(s) → ${path}`);
  for (const s of sources) {
    console.log(`  [${s.platform}/${s.retrievalMethod}] ${s.title.slice(0, 70)}`);
    console.log(`     ${s.url}`);
  }
}

main().catch((err) => {
  console.error('collect-market-context failed:', err);
  process.exit(1);
});
