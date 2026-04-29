# Prediction Market Scanner

Research tool for prediction markets. Aggregates live data from Polymarket and Kalshi, generates AI-powered research briefs with real-time news context, tracks superforecaster signals, and helps you calibrate your own prediction accuracy.

## Quick Start

```bash
git clone <repo-url> && cd prediction-market-scanner
npm install
cp .env.example .env    # works out of the box — no API keys needed
npm run dev:web          # → http://localhost:5173
```

Ships with a seeded `demo.db` — the app has real market data, sample forecasts, and calibration data on first run. No API keys required to browse.

For AI research briefs, add `OPENAI_API_KEY` or `XAI_API_KEY` (free credits at console.x.ai) to `.env`.

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

## License

ISC
