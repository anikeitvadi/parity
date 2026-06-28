# Prediction Market Scanner

**A full-stack AI research terminal for prediction markets — and a case study in letting live data kill my original premise.**

I set out to find cross-platform mispricings between Polymarket and Kalshi. Then the live scan came back: **2,219 markets scanned, 7 high-confidence overlaps, 0 that met the arbitrage threshold.** Markets are efficient; "beat the crowd" fights physics for retail. So I killed the premise and reframed the product around honest value: research synthesis, contract-risk awareness, and forecasting calibration.

The pivot is the point. This README is the story of building under real market constraints and changing course when the data said to.

---

## The case study

**1. Problem.** Prediction markets (Polymarket, Kalshi, Metaculus) hold a huge amount of dispersed, real-time information. Using them well is work most people skip: checking the same event across platforms, reading the news behind a price, judging whether the crowd is informed or herding, and separating signal from noise.

**2. Hypothesis.** The obvious play: *find cross-platform mispricings.* The same real-world event is often listed on both Polymarket and Kalshi — if they price it differently, that gap is an edge. Build a scanner that surfaces those gaps.

**3. What the data showed.** I built the live scanner across both platforms — semantic event matching, divergence computation, the works. The latest scan: **2,219 live markets, only 7 listed on both platforms (cosine ≥ 0.85), and 0 gaps that cleared the ~19pp arbitrage threshold after fees.** Not a bug: in this scan, the easy cross-platform arb thesis didn't survive fees and settlement review. It's a single-run finding, reproducible with `npm run study` — not a universal claim about market efficiency.

**4. The pivot.** Instead of pretending an edge exists, I reframed the product around what *is* genuinely useful when you can't beat the price:
   - **Research synthesis** — pull the dispersed context (cited web sources, cross-platform pricing, superforecaster signals) into one AI brief, so you spend a minute instead of an hour.
   - **Contract-risk awareness** — surface settlement rules and stale/odd markets so you don't misread what you're actually betting on.
   - **Forecasting calibration** — log your own probability calls, track them against outcomes, and see where you're systematically over- or under-confident.

**5. What I'd build next.** Deeper evidence grounding (full-article retrieval and structured base rates on top of the current cited-source briefs), embedding-based Metaculus matching, on-chain "smart money" wallet profiling, and strategy backtesting against the historical snapshot data.

---

## What it does today

A single-screen research terminal (it opens straight into the workspace):

- **Market list** — the live market universe across Polymarket + Kalshi in one place. Platform badge, platform/type filters, and sort by volume, divergence, or time-to-close. Quality-ranked, meme markets filtered out.
- **Decision pane** — select any market to get: current odds + 7-day price history, divergence vs cross-platform and Metaculus signals, settlement-risk notes, an on-demand **AI research brief** (streamed, decision-first: verdict, fair-value estimate, edge, bull/bear, catalysts), a **"Sources used"** panel with the real URLs the brief grounded on, and a **"your call"** slider with half-Kelly sizing.
- **Efficiency Lab** — a second tab that visualizes the cross-platform study with [Observable Plot](https://observablehq.com/plot/): the gap distribution against the 3pp/9pp/19pp decision lines and match-confidence vs gap, headlining the reproducible **2,219 → 7 → 0** result. Regenerate from live data with `npm run study`.
- **Track record** — log forecasts, resolve them when markets settle, and read a plain-language calibration chart: *when you say 70%, does it happen 70% of the time?* (Brier score — a proper scoring rule from decision science — is shown as a footnote; lower is better, 0.25 = a coin flip.)

## Quick start

```bash
git clone <repo-url> && cd prediction-market-scanner
npm install
cp .env.example .env     # works out of the box — no API keys needed to browse
npm run dev:web          # API server + Vite frontend → http://localhost:5173
```

Market data is public (Polymarket Gamma + Kalshi events APIs), so browsing needs no keys. For AI briefs, add `OPENAI_API_KEY` or `XAI_API_KEY` (free credits at console.x.ai) to `.env`. For semantic cross-platform matching, an `OPENAI_API_KEY` powers the embeddings. Seed sample data with `npm run seed`.

## Architecture

```
web/                         React 19 + Vite + Tailwind v4 — "Scanner" + "Efficiency Lab" tabs
├── pages/TerminalPage.tsx       list + decision-pane orchestration, filters, sort
├── pages/LabPage.tsx            Efficiency Lab — Observable Plot charts (lazy-loaded)
├── components/OpportunityQueue  the market list (left)
├── components/DecisionPane      evidence + brief + sources-used + your-call
├── components/EvidenceBoard     odds, 7d history sparkline, divergence, settlement risk
└── api/client.ts                fetch() + SSE for streamed briefs

server/                      Hono API (:3001), 60–120s TTL in-memory cache
├── routes/opportunities.ts      /feed (universe + server-side divergence + tags), /scan
├── routes/markets.ts            /markets, /markets/:id (+ enrichments incl. cached sources), /:id/research (SSE)
├── routes/calibration.ts        forecast logging + resolution + Brier/calibration stats
└── prompts/research.ts          decision-first brief prompt (with source-honesty rules)

src/                         Core engine (shared by server, CLI, scheduler)
├── services/                    Polymarket, Kalshi, Metaculus clients; embeddings; semantic matcher; source-collector
├── database/                    SQLite (WAL) schema + study-store (persisted study runs/pairs)
├── detectors/ scoring/          edge detectors + composite scoring + Kelly sizing
└── jobs/ parsers/ dashboard/    Bree scheduler; settlement parsing; original Ink CLI

evals/                       promptfoo brief evals (factuality + source-honesty), runnable offline
scripts/                     efficiency-study.ts (npm run study), collect-market-context.ts (sources)
docs/SCHEMA.md               data + matching schema, and the planned pgvector migration
```

**Data flow:** external APIs → Zod-validated `Market` schema → SQLite snapshots → `/api/opportunities/feed` (universe + divergence) → React UI. Three TypeScript projects (`src/`, `server/`, `web/`) typecheck independently.

## Technical highlights (the things worth asking me about)

- **Integration / data normalization** — three completely different market APIs (Polymarket on-chain CLOB, Kalshi REST events, Metaculus posts) normalized into one Zod-validated `Market` type. Kalshi reports volume in *contracts* and Polymarket in *dollars*; reconciling units like that is most of the real work.
- **Semantic event matching** — keyword matching produced false positives ("next James Bond actor" vs "next James Bond villain"). Replaced with `text-embedding-3-small` vectors in sqlite-vec and cosine similarity at a 0.85 threshold — no external vector DB.
- **Persisted, reproducible matching** — `npm run study` writes the matched pairs + run metadata (model, threshold, universe size, timestamp) to SQLite **and** exports the same records to JSON/CSV, so the finding is inspectable instead of a runtime vibe. The Postgres + pgvector production-migration path is documented in [docs/SCHEMA.md](docs/SCHEMA.md).
- **Streamed applied AI** — research briefs stream token-by-token over SSE, with a dual provider (xAI Grok preferred, OpenAI GPT-4o fallback) and prompt/context engineering that injects market data, cited web sources, and cross-platform/forecaster signals.
- **Source-honest, evaluated AI** — the brief grounds only on real cached sources (titles + URLs shown under "Sources used") with explicit prompt rules against invented citations and claimed live retrieval. `npm run eval:briefs` runs a promptfoo suite (9 fixtures, deterministic factuality + source-honesty assertions) that passes with zero API keys via a recorded-fixture mock, and grades the live model when a key is set.
- **Decision-science scoring** — calibration uses the Brier score (a proper scoring rule), bucketed into a reliability curve.
- **Verification** — `npm run check` runs all three tsconfigs + Vite build + 408 tests.

## Reproducibility

What's live, what's cached, and what needs a key:

| Layer | How it runs | API key? |
|---|---|---|
| Browse markets | **Live** — Polymarket Gamma + Kalshi events APIs, on demand | None |
| Efficiency Lab finding | **Cached** artifact (`docs/data/efficiency-study.json` + `gap-map.csv`), regenerated by `npm run study` | `npm run study` needs `OPENAI_API_KEY` (embeddings) |
| Semantic matching | `text-embedding-3-small` via sqlite-vec; persisted to SQLite + JSON/CSV | `OPENAI_API_KEY` to (re)embed |
| AI research brief | **Live** model (xAI Grok or OpenAI), streamed, rate-limited + cached | `XAI_API_KEY` or `OPENAI_API_KEY` |
| Brief sources ("Sources used") | **Cached** artifacts in `docs/data/research-context/`, populated explicitly by `npm run collect:context` (built-in DuckDuckGo) — never scraped at request time | None |
| Brief evals | `npm run eval:briefs` (promptfoo, deterministic asserts) | None for the mock; a key grades the live model |

**Agent-Reach** is a *planned* optional adapter for richer RSS/GitHub/social/video sources — a separate [Python CLI](https://github.com/Panniantong/agent-reach), not an npm package and not a production scraper. Today the implemented collector is the built-in DuckDuckGo web adapter; `npm run collect:context` reports Agent-Reach's status and uses the built-in adapter. The app never requires it.

## Honest limitations

- **Cross-platform gaps are ~0** right now — markets are efficient. The divergence column is honest, not faked; it lights up only when a real gap exists. This is one recorded scan, not a verdict on market efficiency.
- **Brief retrieval is shallow** — the cached sources are DuckDuckGo-level (titles + URLs), not full-article retrieval with structured base rates. That depth is the next step; the brief honestly reasons from base rates when no sources are cached.
- **Some markets are stale upstream** — e.g. a long-resolved event still listed `active` by the exchange. A close-date / zero-volume filter would clean this up.
- **No accounts** — saved markets live in localStorage, calibration in local SQLite. SQLite + sqlite-vec (not Postgres) is the right call for a single-server portfolio project and keeps the study reproducible from one file; the Postgres + pgvector swap is documented in [docs/SCHEMA.md](docs/SCHEMA.md).

## Commands

```bash
npm run dev:web      # API + web → localhost:5173
npm run study        # regenerate the Efficiency Lab study from live data (needs OPENAI_API_KEY)
npm run eval:briefs  # promptfoo factuality + source-honesty evals (offline mock if no key)
npm run collect:context -- "<market question>"   # cache real sources for a market
npm run typecheck    # all 3 tsconfigs
npm run test:run     # 408 core-engine tests
npm run check        # typecheck + build + tests
npm run dashboard -- --demo   # original CLI terminal UI
```

## Deploy

One container serves the built frontend and the API together (the Hono server
falls back to `dist-web/` for non-`/api` routes):

```bash
docker build -t market-scanner .
docker run -p 3001:3001 \
  -e XAI_API_KEY=...   # optional — enables AI briefs (rate-limited + cached server-side)
  market-scanner       # → http://localhost:3001
```

Runs on any container host (Render, Fly.io, Railway). Market data is fetched
live from the public APIs on demand, so a fresh container is populated
immediately. The image ships the Efficiency Lab study artifact and seeds a few
demo calibration forecasts on first boot (`SEED_DEMO=true`). The brief endpoint
is rate-limited per IP and globally, so a public demo can't drain your key.

## License

ISC
