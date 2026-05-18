# Prediction Market Scanner

Research tool for prediction markets. Aggregates live data from Polymarket and Kalshi, generates AI-powered research briefs with real-time news context, tracks superforecaster signals, and helps you calibrate your own prediction accuracy.

## Quick Start

```bash
git clone <repo-url> && cd prediction-market-scanner
npm install
cp .env.example .env    # works out of the box — no API keys needed
npm run dev:web          # → http://localhost:5173
```

No API keys required to browse markets — Polymarket and Kalshi data is public. For AI research briefs, add `OPENAI_API_KEY` or `XAI_API_KEY` (free credits at console.x.ai) to `.env`.

To seed the database with sample data: `npm run seed`

## Features

**Market Browser** — search and filter across Polymarket + Kalshi with category tags, quality-ranked listings, and meme market filtering.

**AI Research Briefs** — click "Generate" on any market for a streamed GPT-4o analysis. Pulls real-time news context via DuckDuckGo, Metaculus superforecaster data, and cross-platform pricing into a structured brief with bull/bear case, risks, and key factors. Confidence indicator shows how many data sources informed the analysis.

**Watchlist** — auto-curated picks in 4 categories: toss-ups (50/50 markets), closing soon, high conviction, and contrarian bets. Live scan across both platforms.

**Calibration Coach** — log your forecasts on any market, resolve them when they settle, track Brier scores over time. Calibration curve shows where you're overconfident vs underconfident, broken down by category.

**Saved Markets** — bookmark markets, add notes, track your thesis. Stored in browser localStorage.

**Semantic Matching** — sqlite-vec vector embeddings detect when the same event is listed on both platforms, replacing keyword matching that produced false positives.

**Interactive Home Page** — full-viewport canvas visualization with live market data. Text reacts to cursor (physics-based repulsion), clickable (navigates to market), hover tooltips, scroll-speed boost.

**System Status** — pipeline health dashboard showing data freshness, API status, and configuration.

## Architecture

```
web/                    React 19 + Vite + Tailwind v4
├── pages/              Home, Markets, Watchlist, Calibration, Saved, Status
├── components/         PriceBar, MarketCard, ResearchBrief, PretextHero, etc.
└── api/client.ts       fetch + SSE streaming

server/                 Hono API (port 3001)
├── routes/markets      List + detail with enrichments (Metaculus, cross-platform)
├── routes/opportunities Live watchlist scan + DB queries
├── routes/research     SSE streaming AI briefs (OpenAI or xAI/Grok)
├── routes/calibration  Forecast logging + Brier score tracking
└── prompts/research    Prompt construction with news + social context

src/                    Core engine (shared by server + CLI + scheduler)
├── services/           Polymarket, Kalshi, Metaculus, embedding, semantic-matcher
├── detectors/          Cross-platform arb, Metaculus divergence, multi-outcome, correlated
├── scoring/            Composite scorer (5 factors), Kelly sizing, Brier scores
├── aggregator/         Detector orchestration + deduplication
├── database/           SQLite + WAL (snapshots, matches, opportunities, forecasts, embeddings)
├── jobs/               Bree scheduler (fetch 15m, detect 30m)
└── config/             Zod env validation, feature flags
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 6, Tailwind CSS v4, React Router 7 |
| API | Hono (ESM-native, SSE streaming) |
| AI | OpenAI GPT-4o / xAI Grok (dual provider, streamed briefs) |
| Matching | sqlite-vec (vector embeddings, cosine similarity) |
| Data | SQLite + WAL mode, Zod validation |
| Market APIs | Polymarket (Gamma + CLOB), Kalshi (public events), Metaculus |
| CLI | Ink v6 + React 19 terminal UI |
| Testing | Vitest (400+ tests), full typecheck across 3 tsconfigs |
| Scheduling | Bree (worker threads) |

## Commands

```bash
npm run dev:web        # Web app (API + frontend)
npm run dashboard      # CLI scanner
npm run check          # Typecheck + build + test (full verification)
npm run typecheck      # All 3 tsconfigs
npm run test:run       # 400+ tests
npm run build          # Compile core engine
npm run build:web      # Vite production build
npm start              # Background scheduler (needs npm run build first)
```

## Configuration

`.env.example` defaults to `DEMO_MODE=true` — everything works without API keys. Market data from Polymarket and Kalshi is public.

Optional keys for extra features:
- `OPENAI_API_KEY` — AI research briefs (GPT-4o)
- `XAI_API_KEY` — preferred over OpenAI, free credits at console.x.ai, includes X/Twitter data
- `POLYMARKET_PRIVATE_KEY` — order book access (not needed for market data)
- `KALSHI_API_KEY` / `KALSHI_API_SECRET` — not needed for market reads

## Why This Is Technically Interesting

**Cross-platform data normalization** — Polymarket and Kalshi structure their data completely differently (on-chain CLOB vs regulated REST API, different field names, different price formats). The system normalizes both into a unified `Market` type with Zod validation.

**Semantic matching with sqlite-vec** — keyword matching produced false positives ("next James Bond actor" matching "James Bond villain"). Replaced with vector embeddings (OpenAI text-embedding-3-small) stored in sqlite-vec, doing cosine similarity search at 0.85 threshold. Runs inside the existing SQLite database — no external vector DB infrastructure.

**Enriched streaming briefs** — research briefs aren't just LLM completions. The server fetches news headlines (DuckDuckGo), Metaculus superforecaster data, cross-platform pricing, and price history, then constructs a structured prompt and streams the response via SSE. The frontend renders markdown as tokens arrive. Note: news context is headline-level (no full article retrieval or source URLs yet).

**Dual AI provider** — supports both OpenAI and xAI/Grok with automatic fallback. The xAI path includes native X/Twitter search for real-time social sentiment. Same OpenAI SDK, different base URL.

**Calibration scoring** — implements the Brier score (proper scoring rule from decision science) to track user prediction accuracy. Shows calibration curves that reveal systematic overconfidence or underconfidence by probability bucket.

**Canvas data visualization** — the home page renders live market data on a full-viewport canvas with spring physics. Text reacts to cursor position, has particle trails, and is clickable (navigates to market detail). Built with requestAnimationFrame and manual hit detection.

## Tradeoffs and Next Steps

**SQLite** — chose embedded SQLite over Postgres for zero-infrastructure setup. Right choice for a single-server portfolio project; would swap to Postgres/Turso for multi-user deployment.

**No auth** — saved markets use localStorage, forecasts use SQLite. No user accounts. Would add auth (OAuth or JWT) if this became a real product.

**Metaculus matching is best-effort** — uses keyword search + title similarity. Doesn't find matches for all markets. Could improve with embedding-based matching (same as cross-platform).

**Not yet built** — on-chain wallet profiling (smart money vs retail), autonomous news alerts, backtesting against historical data, and mobile-optimized UI.

## License

ISC
