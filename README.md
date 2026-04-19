# Prediction Market Scanner

A prediction market research tool that aggregates live markets from Polymarket and Kalshi, detects mispricings using cross-platform arbitrage and superforecaster consensus, and generates AI-powered research briefs to help you make informed decisions.

Includes both a **web dashboard** (React + Hono API) and a **CLI scanner** (Ink terminal UI).

## What It Does

Scans Polymarket, Kalshi, and Metaculus on a schedule, then surfaces opportunities where the market price is likely wrong:

- **Cross-platform arbitrage** &mdash; finds price gaps between Polymarket and Kalshi for the same event, gated by NLP-based settlement rule comparison to avoid resolution divergence
- **Metaculus divergence** &mdash; flags markets where superforecaster consensus disagrees with the traded price by >5%
- **Multi-outcome mispricing** &mdash; detects probability sets that don't sum to 100% (implied arbitrage)
- **Correlated market inconsistency** &mdash; catches contradictions between related markets

Each opportunity is scored 1&ndash;10 using five weighted factors (edge size, confidence, liquidity, time to resolution, fee-adjusted profit) and sized using half-Kelly criterion.

## Quick Start

```bash
# Install
git clone <repo-url> && cd prediction-market-scanner
npm install
cp .env.example .env

# Start the web app
npm run dev:web
# → Browse markets at http://localhost:5173

# Or use the CLI dashboard
npm run dashboard -- --demo
```

```
PREDICTION MARKET EDGE SCANNER [DEMO MODE]

SCORE   MARKET                                     EDGE         TYPE        SIZE
  8.2   Will the US impose reciprocal tariffs...   10.0%   cross_platform      $40
  7.5   Will GPT-5 score 95%+ on GPQA Diamond...   12.0%   metaculus_div...     $30
  6.8   What will the Fed funds rate be after...    6.0%   multi_outcome       $25
  4.2   Bitcoin ETF daily inflow > $500M ...        3.0%      correlated       $10

Use arrow keys to navigate, Enter to view details
```

### With Live Data

Set real API credentials in `.env`:

```bash
DEMO_MODE=false
POLYMARKET_PRIVATE_KEY=<hex-private-key>   # hot wallet, not your main key
KALSHI_API_KEY=<key>
KALSHI_API_SECRET=<secret>
OPENAI_API_KEY=sk-...                      # for AI research briefs
```

Then run the scheduler to start collecting data:

```bash
npm start              # Runs fetch jobs on 15/30 min intervals
npm run dev:web        # Web dashboard at localhost:5173
npm run dashboard      # CLI dashboard (alternative)
```

## Web App

The web frontend lets you browse live markets and get AI research briefs:

- **Market browser** &mdash; search and filter across Polymarket + Kalshi
- **Market detail** &mdash; current odds, price history, cross-platform comparison
- **AI research brief** &mdash; click "Generate" to get a streamed analysis via GPT-4o covering key factors, bull/bear case, risks, and cross-platform signals

```
[React SPA]  →  [Hono API]  →  [Market services + SQLite]
  (Vite)         (SSE)              ↓
                              [OpenAI API] (research briefs)
```

The API server (`npm run dev:server`) wraps the existing data layer and exposes REST endpoints. The Vite dev server proxies `/api` requests to it.

## Architecture

```
src/
├── services/           # API clients (Polymarket, Kalshi, Metaculus)
│   ├── polymarket.ts         Gamma + CLOB API, Zod-validated responses
│   ├── kalshi.ts             REST API with demo mode support
│   ├── metaculus-client.ts   /posts/ API with exponential backoff retry
│   ├── market-matcher.ts     Cross-platform event matching (50+ pairs)
│   └── settlement-comparator.ts  NLP settlement rule comparison
├── detectors/          # Edge detection strategies
│   ├── cross-platform-arb.ts    Settlement-verified cross-platform gaps
│   ├── metaculus-divergence.ts   Superforecaster vs market divergence
│   ├── multi-outcome-arb.ts     Probability sum != 100% detection
│   └── correlated-markets.ts    Related market inconsistency
├── scoring/            # Composite scoring engine
│   ├── composite-scorer.ts      Weighted 1-10 scoring (5 factors)
│   ├── kelly.ts                 Half-Kelly position sizing
│   └── factors/                 Edge, confidence, liquidity, time, fee
├── aggregator/         # Pipeline orchestration
│   ├── opportunity-aggregator.ts  Run all detectors, merge results
│   └── deduplicator.ts           4-6 hour dedup window
├── dashboard/          # Terminal UI (React/Ink)
│   ├── App.tsx                  Main app with keyboard nav
│   └── components/              Table, detail, settlement, Metaculus views
├── database/           # SQLite persistence (WAL mode)
│   ├── schema.ts               Migrations + initialization
│   └── queries.ts              Snapshots, matches, opportunities
├── jobs/               # Bree scheduled workers
│   ├── fetch-polymarket.ts     Every 15 min
│   ├── fetch-kalshi.ts         Every 15 min
│   ├── match-markets.ts        Every 30 min
│   └── detect-opportunities.ts Every 30 min
├── parsers/            # Settlement rule extraction
│   ├── polymarket-parser.ts    Resolution criteria, data sources, dates
│   └── kalshi-parser.ts        Rules, sources, expiration
├── config/
│   ├── env.ts                  Zod-validated env vars with demo mode
│   └── feature-flags.ts        Safe rollout of risky detectors
└── types/              # Shared TypeScript types

server/                 # Hono API server
├── src/
│   ├── index.ts               Server entry, CORS, routing
│   ├── cache.ts               TTL-based in-memory cache
│   ├── routes/
│   │   ├── markets.ts         Market list + detail with enrichments
│   │   ├── opportunities.ts   Scored opportunity feed
│   │   └── research.ts        SSE streaming Claude research briefs
│   └── prompts/
│       └── research.ts        Research prompt construction

web/                    # Vite + React SPA
├── src/
│   ├── App.tsx                Router + layout
│   ├── api/client.ts          API + SSE fetch helpers
│   ├── pages/
│   │   ├── MarketListPage.tsx  Search, filter, browse markets
│   │   └── MarketDetailPage.tsx  Odds, history, cross-platform, AI brief
│   └── components/            PriceBar, MarketCard, ResearchBrief, etc.
```

### Key Design Decisions

| Decision | Why |
|---|---|
| Settlement verification before arbitrage | Cross-platform arb without matching resolution rules can cause double losses |
| Feature flags for detectors | Each detector can be independently enabled after verification |
| Worker thread isolation (Bree) | One job crash doesn't take down the scheduler |
| Human-in-the-loop only | No automated execution &mdash; surfaces opportunities for manual review |
| Half-Kelly sizing | Full Kelly is too aggressive for small bankrolls; half-Kelly balances growth with drawdown protection |
| SQLite + WAL mode | Embedded, no infrastructure needed, concurrent reads during writes |

## Tech Stack

**Runtime:** Node.js 20+, TypeScript 5.5+ (strict), ESM
**Web:** React 19, Vite, Tailwind CSS v4, React Router
**API:** Hono (ESM-native, SSE streaming)
**AI:** OpenAI GPT-4o (streamed research briefs via SSE)
**Data:** SQLite (better-sqlite3, WAL mode), Zod schema validation
**Market APIs:** Polymarket CLOB + Gamma, Kalshi REST, Metaculus /posts/
**Scheduling:** Bree (worker threads)
**CLI:** Ink v6 + React 19 (terminal), Meow (CLI args)
**Analysis:** string-similarity (NLP), chrono-node (date parsing), ethers v6 (wallet auth)
**Testing:** Vitest, 405+ tests across 17 test files

## Tests

```bash
npm run test:run       # Run all tests (silent logger in test env)
npm test               # Watch mode
npm run build          # TypeScript compilation check
```

## Project Status

Phases 1&ndash;4 of 6 complete. Core detection pipeline is operational.

- [x] Phase 1: Data infrastructure (fetch, parse, match, persist)
- [x] Phase 2: Scoring engine + CLI dashboard
- [x] Phase 3: Settlement rule verification for cross-platform arb
- [x] Phase 4: Metaculus superforecaster integration
- [ ] Phase 5: Historical calibration + longshot bias detection
- [ ] Phase 6: Whale tracking + production hardening

## License

ISC
