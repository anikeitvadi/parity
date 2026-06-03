# Prediction Market Scanner — Project Context

> Orientation doc. Updated 2026-06-03 after the pivot. The earlier version of this file
> described an edge-finding product and a multi-page UI that no longer exist — both were
> replaced. For the canonical writeups see the doc map at the bottom.

## What this is (post-pivot)

A full-stack AI **research terminal** for prediction markets (Polymarket + Kalshi), and a
**portfolio project** demonstrating integration + applied AI + product judgment.

It started as an *edge scanner* — find cross-platform mispricings and trade them. The live
scanner found **0 real cross-platform gaps across 314 markets**: the markets are efficient,
so there's no reliable retail edge. Rather than fake one, the product was reframed around
value that survives efficient markets:

- **Research synthesis** — an on-demand, streamed AI brief per market (news + Metaculus +
  cross-platform context).
- **Contract-risk awareness** — settlement rules and stale/odd markets surfaced.
- **Forecasting calibration** — log your probability calls, track them, see where you're
  over/under-confident in plain language.

The pivot is the asset, not a flaw to hide. See `HANDOFF.md` for the full reasoning.

## Current app shape

Single-screen "Scanner" (the old Home/Markets/Watchlist/Calibration/Saved/Status pages and
the canvas home page are deleted):

- **Left:** full market universe (~300+ across both platforms) — platform badge, platform/
  type filters, sort by volume / divergence / closing.
- **Right (market selected):** one decision pane — odds + 7d history, divergence vs cross-
  platform/Metaculus, settlement risk, on-demand AI brief, your-call slider (half-Kelly).
- **Right (idle / Esc):** dashboard — plain-language calibration track record + saved markets.

Data comes from one endpoint: `GET /api/opportunities/feed` (full universe + server-computed
divergence + opportunity tags). Full architecture + diagrams: `docs/ARCHITECTURE.md`.

## Architecture (accurate)

```
web/      React 19 + Vite + Tailwind v4 — single-screen scanner
  pages/TerminalPage.tsx            list + decision-pane orchestration, filters, sort
  components/OpportunityQueue.tsx   the market list
  components/DecisionPane.tsx       evidence + brief + your-call, or dashboard when idle
  components/EvidenceBoard.tsx      odds, history sparkline, divergence, settlement
  components/ConsensusGapMap.tsx    market-price vs signal scatter
  api/client.ts                     fetch() + SSE

server/   Hono API (:3001), 60–120s TTL cache
  routes/opportunities.ts           /feed (universe + divergence), /scan
  routes/markets.ts                 /markets, /markets/:id (+ enrichments), /:id/research (SSE)
  routes/calibration.ts             forecast logging + Brier/calibration stats
  prompts/research.ts               decision-first brief prompt

src/      Core engine (shared by server, CLI, scheduler)
  services/                         polymarket, kalshi, metaculus, embedding, semantic-matcher
  detectors/ scoring/ aggregator/   edge detectors, composite scorer, Kelly, Brier
  database/ jobs/ parsers/          SQLite (WAL), Bree scheduler, settlement parsing
  dashboard/                        original Ink CLI
```

Three independent tsconfigs (`src/`, `server/`, `web/`). `npm run check` = typecheck (all 3)
+ Vite build + 405 tests.

## Data sources

| Source | Auth | What we get |
|--------|------|-------------|
| Polymarket Gamma API | none (public) | active markets, prices, volume (USD), liquidity |
| Kalshi Events API | none (public) | events → markets, prices, volume (contracts → USD approx) |
| Metaculus posts API | optional token | superforecaster/community predictions |
| OpenAI / xAI | optional key | research briefs (Grok preferred, GPT-4o fallback) + embeddings |

## How to run

```bash
npm install
cp .env.example .env       # works without keys for browsing
npm run dev:web            # API + web → http://localhost:5173
npm run check              # typecheck + build + tests
npm run dashboard -- --demo  # original CLI
```

Add `OPENAI_API_KEY` or `XAI_API_KEY` for AI briefs; `OPENAI_API_KEY` also powers embeddings.

## Status & known limitations

- Phases 1–4 of the original GSD roadmap shipped (data, scoring/CLI, settlement, Metaculus).
  Phases 5–6 (longshot bias, whale tracking) are **abandoned** — dead premise. See
  `.planning/ROADMAP.md`.
- Cross-platform gaps are ~0 (efficient markets) — the divergence column is honest, not faked.
- AI briefs are *synthesis*, not retrieval-grounded research yet (headline-level news, no
  citations). The top "build next" item is real web retrieval + base rates.
- Some markets are stale upstream (listed active but long resolved). No accounts (localStorage
  + local SQLite).

## Doc map

| Doc | Purpose |
|-----|---------|
| `README.md` | Public case study (problem → hypothesis → 0/314 → pivot → built) |
| `docs/PORTFOLIO.md` | Recruiter-facing 90-sec case study |
| `docs/ARCHITECTURE.md` | System + sequence diagrams, data flow |
| `docs/INTERVIEW-WALKTHROUGH.md` | "Explain it cold" Q&A study doc |
| `HANDOFF.md` | Honest current state + the strategic decision |
| `PORTFOLIO-STRATEGY.md` | Job-targeting / positioning map |
| `CLAUDE.md` | Working guidelines for this repo |
| `.planning/` | GSD roadmap/state (milestone 1 closed) |
