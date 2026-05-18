# Prediction Market Scanner — Project Context

## Vision & Intent

**The goal:** Build the best tool for making informed decisions on prediction markets. Not a trading bot — a research tool that makes you smarter before you place a bet.

**The analogy:** Perplexity is to Google as this tool aims to be to Polymarket/Kalshi. Instead of browsing raw market listings on each platform separately, you get:
- All markets from all platforms in one place
- AI-generated research briefs that synthesize news + data into actionable analysis
- Signals the platforms don't show you — where superforecasters disagree with the crowd, where two platforms price the same event differently, where the "smart money" wallets are positioned

**The problem it solves:** Prediction markets are powerful information tools, but using them well requires work that most people don't do:
1. Checking the same event across multiple platforms to find the best price
2. Reading news to understand *why* a market is priced the way it is
3. Knowing whether the crowd is actually informed or just following herd behavior
4. Identifying which markets are worth your time vs noise

**Who it's for:** Anyone who trades or follows prediction markets and wants to make better-informed decisions — from casual users who want to understand what the crowd thinks about current events, to active traders looking for mispriced opportunities.

**What makes it different from just using Polymarket/Kalshi directly:**
- Cross-platform aggregation (see Polymarket + Kalshi side by side)
- AI research briefs powered by real-time news (not just raw odds)
- Superforecaster data from Metaculus layered on top of market prices
- Curated watchlist that surfaces interesting markets you'd otherwise miss
- On-chain wallet analysis showing where "smart money" is positioned (planned)

**Portfolio angle:** This is also a portfolio project demonstrating full-stack engineering — React, Node.js, real-time streaming, multi-source data aggregation, LLM integration, on-chain analytics, and 405+ tests.

---

## What This Is (Technical)

A web app that aggregates live prediction markets from **Polymarket** and **Kalshi** into one place, helps you find interesting bets, and gives you AI-generated research to make better decisions. Built with React 19, Hono, Vite, SQLite, and OpenAI.

## Current State (April 2026)

### What Works
- **Market browser** — search/filter across hundreds of Polymarket + Kalshi markets
- **Category filtering** — Politics, Sports, Entertainment, Economics, etc. (from Kalshi events)
- **Market detail page** — current odds, price bar, cross-platform comparison, 7-day price history
- **Watchlist** — auto-curated picks in 4 categories:
  - **Toss-Ups** (40-60%) — crowd can't decide, your research could give you an edge
  - **Closing Soon** (<7 days) — time-sensitive, last chance to get in
  - **High Conviction** (>85% or <15%) — crowd is very confident, but are they right?
  - **Contrarian** (10-25% or 75-90%) — unlikely but not impossible
- **AI Research Brief** — streamed via GPT-4o or xAI Grok (dual provider). Enriched with DuckDuckGo news search, Metaculus superforecaster data, and cross-platform context. Confidence indicator shows data sources used. Needs `OPENAI_API_KEY` or `XAI_API_KEY`.
- **Metaculus superforecaster data** — detail page shows forecaster vs market divergence. Research briefs include Metaculus context when a match is found. Matching uses title similarity scoring with a threshold.
- **Semantic cross-platform matching** — sqlite-vec embeddings replace keyword matching. Cosine similarity at 0.85 threshold. Requires `OPENAI_API_KEY` for embedding generation.
- **Calibration Coach** — log forecasts, resolve outcomes, track Brier scores over time with calibration curves by category.
- **Saved Markets** — bookmark markets with notes, stored in browser localStorage.
- **Interactive home page** — full-viewport canvas with live market data, physics-based cursor interaction, clickable markets.
- **System Status** — pipeline health dashboard showing API status, DB state, and configuration.
- **CLI dashboard** — terminal-based scanner with keyboard nav (original tool, still works)
- **400+ tests passing** across 17 test files (core `src/` engine). All three tsconfigs typecheck clean via `npm run typecheck`.

### Known Limitations
- **AI briefs need an API key** — set `XAI_API_KEY` (free at console.x.ai) or `OPENAI_API_KEY` in `.env`.
- **Metaculus matching is best-effort** — uses keyword search + title similarity. Won't find matches for all markets.
- **Kalshi pagination** — events endpoint capped at `limit=100`, no cursor pagination. Batched detail fetches (groups of 10) but can't fetch beyond 100 events.
- **No user accounts** — saved markets and calibration data are local (localStorage and SQLite respectively).

## Architecture

```
web/                    Vite + React 19 + Tailwind v4
  └─ api/client.ts      fetch() + EventSource for SSE streaming

server/                 Hono API (port 3001)
  ├─ routes/markets.ts     GET /api/markets, /api/markets/:id
  ├─ routes/opportunities  GET /api/opportunities/scan (live watchlist)
  ├─ routes/research.ts    GET /api/markets/:id/research (SSE → GPT-4o)
  └─ cache.ts              60-120s TTL in-memory cache

src/                    Core engine (shared by server + CLI + scheduler)
  ├─ services/           Polymarket, Kalshi, Metaculus API clients
  ├─ detectors/          4 edge detectors (cross-platform, metaculus, multi-outcome, correlated)
  ├─ scoring/            Composite 1-10 scorer + Kelly sizing
  ├─ aggregator/         Orchestrates detectors + deduplication
  ├─ database/           SQLite + WAL (market_snapshots, matched_markets, opportunities, settlement_comparisons)
  ├─ jobs/               Bree scheduler (fetch every 15m, detect every 30m)
  ├─ parsers/            Settlement rule extraction (NLP)
  ├─ dashboard/          Ink terminal UI (React-based CLI)
  └─ config/             Zod env validation, feature flags
```

**Build coverage:** `npm run typecheck` validates all three tsconfigs (`src/`, `server/`, `web/`). `npm run check` runs typecheck + Vite build + tests in one command. CI does the same.

## Data Sources

| Source | Auth | What We Get |
|--------|------|-------------|
| **Polymarket Gamma API** | None (public) | Active markets with prices, volume, liquidity (up to 500 per fetch) |
| **Polymarket CLOB API** | Wallet key (optional) | Order books, token-level data |
| **Kalshi Events API** | None (public) | Events with titles, categories, market prices (first 100 events, batched detail fetch) |
| **Metaculus /posts/ API** | Token (optional) | Superforecaster predictions, community forecasts |
| **OpenAI API** | API key (optional) | GPT-4o for research brief generation |

## Key Files to Know

| File | What It Does |
|------|-------------|
| `server/src/routes/opportunities.ts` | The watchlist logic — defines what "interesting" means |
| `server/src/routes/research.ts` | AI brief generation — prompt construction + SSE streaming |
| `server/src/routes/markets.ts` | Market listing + detail with enrichments |
| `web/src/pages/MarketListPage.tsx` | Main browse UI — search, filter, grid |
| `web/src/pages/MarketDetailPage.tsx` | Detail view — odds, history, comparison, AI brief |
| `web/src/pages/EdgesPage.tsx` | Watchlist UI — curated picks grouped by category |
| `src/services/polymarket.ts` | Polymarket API client (Gamma + CLOB) |
| `src/services/kalshi.ts` | Kalshi API client (events-based, public, batched) |
| `src/services/metaculus-client.ts` | Metaculus API client with retry logic |
| `src/aggregator/opportunity-aggregator.ts` | Runs all detectors, normalizes output |
| `src/scoring/composite-scorer.ts` | 5-factor weighted scoring (heuristic, tunable via backtesting) |
| `src/database/schema.ts` | SQLite tables and indexes |

## How to Run

```bash
npm install
cp .env.example .env
# .env.example defaults to DEMO_MODE=true, all secrets commented out.
# Works immediately — no API keys needed for browsing markets.
# Optionally uncomment OPENAI_API_KEY to enable AI research briefs.
```

**Fast demo (CLI):**
```bash
npm run dashboard -- --demo
```

**Web app:**
```bash
npm run dev:web       # API server + Vite frontend → http://localhost:5173
```

**Full background scanner** (requires market API credentials in `.env`):
```bash
npm run build         # Compile src/ → dist/
npm start             # Bree scheduler: fetch every 15m, detect every 30m
```

**Verification:**
```bash
npm run check         # Typecheck all 3 tsconfigs + Vite build + 405 tests
npm run typecheck     # Just typechecks (src, server, web)
npm run test:run      # Just tests
```

## Code Quality Fixes Already Applied

These were identified in an earlier audit and fixed:

- [x] README.md created with architecture, quick start, design decisions
- [x] Demo mode unified — `--demo` flag in CLI help, `.env.example` defaults to `DEMO_MODE=true`
- [x] Stale demo data refreshed (was referencing March/June 2025)
- [x] Misleading `o`/`n` keybinds removed from SettlementView (were never wired up)
- [x] Logger silenced in test env (`NODE_ENV=test` or `VITEST` → `level: 'silent'`)
- [x] `@ethersproject/wallet` added as explicit dependency (was transitive)
- [x] Duplicated Kelly calc removed from `detect-opportunities.ts` — now calls `scoreOpportunity(opp, BANKROLL)` which already includes Kelly
- [x] "research-backed" claims softened to "heuristic, tunable via backtesting"
- [x] Cross-platform-arb detector comments updated (no longer says "DISABLED")
- [x] Tracked PDF removed from git, debug scripts gitignored
- [x] `package.json` description: "High-confidence" → "Multi-source"
- [x] CI workflow added (`.github/workflows/ci.yml` — Node 20+22, typecheck + build + test)
- [x] Kalshi client updated for new API field names (`_dollars` suffix, string prices)
- [x] Kalshi reads now use public endpoint (no auth needed for market data)
- [x] Polymarket fetch updated to `limit=500` (was returning only 20 markets)
- [x] `.env.example` made demo-safe — all secrets commented out, `DEMO_MODE=true` is default, no active placeholder values that fail validation
- [x] `npm run typecheck` added — validates all three tsconfigs (`src/`, `server/`, `web/`)
- [x] `npm run check` added — full verification: typecheck + Vite build + tests
- [x] CI updated to run `typecheck` + `build:web` (not just root `tsc`)
- [x] `@types/react-dom` added (was missing, caused web typecheck failure)
- [x] Server type error fixed in `research.ts` (MarketSnapshot data cast)

### Still Open from Audit
- [ ] CLI OpportunityTable score coloring: `ScoreIndicator` exists but Ink `Select` only takes string labels
- [ ] CLI Settlement criteria always shows "No criteria available"
- [ ] No screenshots/GIF in README yet
- [ ] Research brief source badges are inferred on the frontend, not based on what the server actually fetched

---

## Strategic Roadmap (from research)

The app is currently a **mirror** — it reflects what Polymarket and Kalshi already show. To provide real value, it needs to become a **lens** — focusing scattered data into actionable insights. The priorities below are ordered by impact.

### Tier 1: Make Every Market Useful (do first)

**1. News-Powered AI Briefs (RAG Pipeline)**
- Current briefs only have market data — useless without context
- Add a news retrieval step before generating: search Tavily/NewsAPI/Google News RSS for the market's keywords
- Feed top 3 recent headlines + market odds into GPT-4o
- The brief should sound like a quant analyst: "The market prices this at 60%, but yesterday's [Source] article on regulatory headwinds suggests..."
- **Why first:** Makes all 700+ markets immediately more useful, not just the ones with cross-platform matches

**2. Surface Metaculus Superforecasters in Web UI**
- Backend already matches Metaculus forecasts to markets (Phase 4 complete)
- Just needs a component on MarketDetailPage showing "Superforecasters say X% vs Market says Y%"
- Easiest win — the data is already there, just not displayed

### Tier 2: Fix the Edge Engine (high technical value)

**3. Semantic Cross-Platform Matching**
- Current keyword matching produces false positives ("next James Bond" vs "next Bond villain")
- Replace with embedding similarity: use `text-embedding-3-small` to vectorize titles, cosine similarity > 0.85
- For high-confidence matches, verify with an LLM prompt: "Do these two markets resolve on the exact same real-world criteria?"
- Shows recruiters: data normalization, vector search, robust decision-making with messy data

### Tier 3: On-Chain Alpha (advanced, high differentiation)

**4. Wallet Profiling & "Smart Gap" Analysis**
- Polymarket is fully on-chain — all wallet data is public
- A 50/50 market means nothing if the "Yes" side is 5 wallets with 80% historical win rate and "No" is 500 retail wallets at 30%
- Build: ingest CLOB holder addresses, calculate median PNL per side
- Display: "Smart Money vs Retail" conviction score on detail page
- Competitors doing this: Betmoar, Unusual Whales
- **Smart Gap formula:** `Smart Yes = (Yes Vol * Yes Win Rate) / ((Yes Vol * Yes Win Rate) + (No Vol * No Win Rate))`

**5. Autonomous News Latency Alerts**
- The window between breaking news and market repricing is minutes
- Build a background agent that monitors RSS/social feeds against watchlist markets
- When news strongly contradicts current odds (candidate drops out but market still prices them at 15%), push a real-time "Latency Alert"
- Demonstrates autonomous system design

**6. Structural Signal-to-Noise Filtering**
- Default feeds are clogged with daily noise (24-hour Bitcoin prices, weather)
- Build an "Event Expiration Calendar" that categorizes: Structural (elections, policy) vs Ephemeral (daily weather, price targets)
- Let users exclude ephemeral categories entirely
- Makes the app a curated workspace for thesis-driven analysts, not gamblers

### Tier 4: Polish & Deploy

**7. Institutional-Grade UI**
- B2B analytical aesthetic: deep navy palette, crisp data tables, hover states, loading skeletons
- Mobile responsive
- Clear loading progress for the 10-20s API calls

**8. The Interview Pitch**
> "I built an aggregation engine and decision tool that ingests live data from multiple prediction markets. The technical challenge was normalizing unstructured text to detect cross-market arbitrage opportunities. To solve false positives, I implemented an evaluation pipeline that synthesizes odds, community forecasts, and live news into actionable insights."

---

## Perplexity Research: 10 Upgrade Tracks

The core insight: lean into **"research terminal + quantitative lab + explainable AI"**, not just "nice UI on Polymarket/Kalshi." Pick 2-3 "deep bets" and build those out fully — depth > breadth for portfolio impact.

### Track 1: Personal Calibration Coach
- Track your own prediction accuracy over time — log your forecasts, compare against outcomes
- Show a calibration curve: "When you say 70%, it happens 55% of the time — you're overconfident"
- Brier score tracking per category (politics, sports, tech)
- **Why it matters:** No competitor does this. Shows the user their own blind spots, makes the tool sticky. Demonstrates you understand decision science, not just data display.
- **Technical:** New DB table for user forecasts, resolution tracking job, calibration chart component

### Track 2: Backtesting / Strategy Lab
- "If you had bought every market where Metaculus diverged >10% from the price, what would your ROI be?"
- Simulate strategies against historical data from market_snapshots table
- Show equity curves, win rates, drawdowns per strategy type
- **Why it matters:** Turns the watchlist from "interesting" to "proven." Recruiters love seeing backtesting — it shows quantitative rigor.
- **Technical:** Historical snapshot data already in DB, need strategy definitions + simulation engine + chart components

### Track 3: Explainability Panel
- When the AI brief says "the No side looks underpriced," show *why* — which data sources, which signals, what confidence level
- Inline citations linking to specific news articles, Metaculus forecasts, on-chain data
- Confidence meter: "This brief is based on 3 news sources and 1 forecaster signal" vs "This brief has no external data — low confidence"
- **Why it matters:** Trust. Users won't act on AI output they can't verify. This is the Perplexity pattern — citations are what make it trustworthy.
- **Technical:** Structured prompt output (JSON mode), citation tracking in the RAG pipeline

### Track 4: Detector Playground
- Let users create custom detection rules: "Alert me when any crypto market on Polymarket drops below 20% with >$50K volume"
- Visual rule builder or simple DSL
- Pluggable detector framework — new detectors can be added without modifying core aggregator
- **Why it matters:** Power users want control. Also demonstrates extensible architecture to recruiters.
- **Technical:** Rule schema in DB, evaluation engine that runs user rules against live market data

### Track 5: Advanced Wallet Archetyping
- Go beyond "smart money vs retail" — classify wallets into archetypes:
  - **Whales** (>$100K positions)
  - **Snipers** (high win rate, low volume — precision bettors)
  - **Herd followers** (buy after price moves)
  - **Contrarians** (consistently bet against consensus)
- Show which archetype is dominant on each side of a market
- **Why it matters:** This is the real alpha. "5 sniper wallets just loaded Yes" is a much stronger signal than "volume went up."
- **Technical:** Polymarket CLOB data is on-chain (Polygon), need to index wallet histories, calculate PNL per wallet, cluster into archetypes

### Track 6: Autonomous Alert Agents
- Background agents that continuously monitor news feeds against your watchlist
- When a news event strongly contradicts current market odds → push notification
- Example: "Breaking: [Candidate] drops out of race. Market still prices them at 15%. Latency alert."
- **Why it matters:** The window between news and market repricing is minutes. This is where real edge exists.
- **Technical:** RSS/social feed ingestion, LLM relevance scoring, WebSocket push to frontend

### Track 7: Research Workspaces
- Save markets to named workspaces ("2026 Elections", "AI Regulation", "Sports Bets")
- Add personal notes, track your thesis over time
- Share workspaces as read-only links
- **Why it matters:** Makes the tool sticky. Users come back to check their saved research.
- **Technical:** User accounts (or local storage), workspace DB tables, shareable URL generation

### Track 8: Observability Dashboard
- System health: API response times, cache hit rates, detector run times, error rates
- Data freshness indicators: "Polymarket data is 45 seconds old, Kalshi is 3 minutes old"
- Pipeline visualization: show the data flow from APIs → DB → detectors → watchlist
- **Why it matters:** Makes it look like a production system, not a hobby project. Recruiters at infrastructure companies love seeing this.
- **Technical:** Pino structured logging already exists, add metrics collection + dashboard page

### Track 9: Demo / Storytelling Polish
- Guided walkthrough for first-time users
- Pre-loaded demo data that shows the tool at its best (interesting edges, AI briefs, cross-platform gaps)
- Screen recording / GIF in README showing the full flow
- **Why it matters:** Recruiters spend 30 seconds on a project. If they can't see the value immediately, they move on.
- **Technical:** Demo mode already exists (--demo flag), needs richer sample data + onboarding overlay

### Track 10: Pluggable Detector Framework
- Abstract the detector interface so new signal sources can be added without touching core code
- Example plugins: Twitter sentiment, Google Trends correlation, congressional trading data
- Config-driven: enable/disable detectors via settings page
- **Why it matters:** Shows architectural thinking — the system is designed to grow.
- **Technical:** Detector interface already exists in src/detectors/, needs plugin registry + dynamic loading

### Recommended "Deep Bets" (pick 2-3)

Based on impact, feasibility, and what's already built:

1. **News-Powered AI Briefs + Explainability** (Tracks 1+3 from strategic roadmap + Track 3 above) — the core product differentiator, makes every market useful, shows RAG + streaming + citations
2. **Calibration Coach** (Track 1 above) — unique feature nobody else has, demonstrates decision science understanding, makes users come back
3. **Wallet Profiling** (Track 5 above + Tier 3 from strategic roadmap) — technically impressive, visually compelling, real alpha that platforms don't surface

---

## Tech Stack Summary

**Runtime:** Node.js 20+, TypeScript 5.5+ (strict), ESM
**Web:** React 19, Vite 6, Tailwind CSS v4, React Router 7
**API:** Hono (ESM-native, SSE streaming)
**AI:** OpenAI GPT-4o (streamed research briefs)
**Data:** SQLite (better-sqlite3, WAL mode), Zod validation
**Market APIs:** Polymarket (Gamma + CLOB), Kalshi (REST, public events endpoint), Metaculus (/posts/)
**CLI:** Ink v6 + React 19, Meow
**Testing:** Vitest, 405+ tests (core engine)
**Scheduling:** Bree (worker threads)
