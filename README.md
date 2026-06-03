# Prediction Market Scanner

**A full-stack AI research terminal for prediction markets — and a case study in letting live data kill my original premise.**

I set out to find cross-platform mispricings between Polymarket and Kalshi. Then the live scanner found **0 real gaps across 314 markets.** Markets are efficient; "beat the crowd" fights physics for retail. So I killed the premise and reframed the product around honest value: research synthesis, contract-risk awareness, and forecasting calibration.

The pivot is the point. This README is the story of building under real market constraints and changing course when the data said to.

---

## The case study

**1. Problem.** Prediction markets (Polymarket, Kalshi, Metaculus) hold a huge amount of dispersed, real-time information. Using them well is work most people skip: checking the same event across platforms, reading the news behind a price, judging whether the crowd is informed or herding, and separating signal from noise.

**2. Hypothesis.** The obvious play: *find cross-platform mispricings.* The same real-world event is often listed on both Polymarket and Kalshi — if they price it differently, that gap is an edge. Build a scanner that surfaces those gaps.

**3. What the data showed.** I built the live scanner across both platforms — semantic event matching, divergence computation, the works. Across **314 live markets it found 0 real cross-platform gaps.** Not a bug: the markets are efficient enough that the price already reflects available information. The original edge thesis didn't survive contact with live data.

**4. The pivot.** Instead of pretending an edge exists, I reframed the product around what *is* genuinely useful when you can't beat the price:
   - **Research synthesis** — pull the dispersed context (news, cross-platform pricing, superforecaster signals) into one AI brief, so you spend a minute instead of an hour.
   - **Contract-risk awareness** — surface settlement rules and stale/odd markets so you don't misread what you're actually betting on.
   - **Forecasting calibration** — log your own probability calls, track them against outcomes, and see where you're systematically over- or under-confident.

**5. What I'd build next.** Evidence-grounded briefs (real web retrieval and base rates instead of LLM "vibes"), embedding-based Metaculus matching, on-chain "smart money" wallet profiling, and strategy backtesting against the historical snapshot data.

---

## What it does today

A single-screen research terminal (it opens straight into the workspace):

- **Market list** — the full universe of ~300+ markets across Polymarket + Kalshi in one place. Platform badge, platform/type filters, and sort by volume, divergence, or time-to-close. Quality-ranked, meme markets filtered out.
- **Decision pane** — select any market to get: current odds + 7-day price history, divergence vs cross-platform and Metaculus signals, settlement-risk notes, an on-demand **AI research brief** (streamed, decision-first: verdict, fair-value estimate, edge, bull/bear, catalysts), and a **"your call"** slider with half-Kelly sizing.
- **Track record** — log forecasts, resolve them when markets settle, and read a plain-language calibration chart: *when you say 70%, does it happen 70% of the time?* (Brier score — a proper scoring rule from decision science — is shown as a footnote; lower is better, 0.25 = a coin flip.)
- **Consensus gap map** — a scatter of market price vs external signal; dots far from the diagonal are where the crowd and the signal disagree.

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
web/                         React 19 + Vite + Tailwind v4 — single-screen "Scanner"
├── pages/TerminalPage.tsx       list + decision-pane orchestration, filters, sort
├── components/OpportunityQueue  the market list (left)
├── components/DecisionPane      evidence + brief + your-call, or dashboard when idle
├── components/EvidenceBoard     odds, 7d history sparkline, divergence, settlement risk
├── components/ConsensusGapMap   market-price vs signal scatter
└── api/client.ts                fetch() + SSE for streamed briefs

server/                      Hono API (:3001), 60–120s TTL in-memory cache
├── routes/opportunities.ts      /feed (full universe + server-side divergence + tags), /scan
├── routes/markets.ts            /markets, /markets/:id (+ enrichments), /:id/research (SSE)
├── routes/calibration.ts        forecast logging + resolution + Brier/calibration stats
└── prompts/research.ts          decision-first brief prompt construction

src/                         Core engine (shared by server, CLI, scheduler)
├── services/                    Polymarket, Kalshi, Metaculus clients; embeddings; semantic matcher
├── detectors/ scoring/          edge detectors + composite scoring + Kelly sizing
├── aggregator/ database/        orchestration + SQLite (WAL) snapshots/matches/forecasts
├── jobs/ parsers/               Bree scheduler; settlement-rule extraction
└── dashboard/                   original Ink terminal UI (CLI)
```

**Data flow:** external APIs → Zod-validated `Market` schema → SQLite snapshots → `/api/opportunities/feed` (universe + divergence) → React UI. Three TypeScript projects (`src/`, `server/`, `web/`) typecheck independently.

## Technical highlights (the things worth asking me about)

- **Integration / data normalization** — three completely different market APIs (Polymarket on-chain CLOB, Kalshi REST events, Metaculus posts) normalized into one Zod-validated `Market` type. Kalshi reports volume in *contracts* and Polymarket in *dollars*; reconciling units like that is most of the real work.
- **Semantic event matching** — keyword matching produced false positives ("next James Bond actor" vs "next James Bond villain"). Replaced with `text-embedding-3-small` vectors in sqlite-vec and cosine similarity at a 0.85 threshold — no external vector DB.
- **Streamed applied AI** — research briefs stream token-by-token over SSE, with a dual provider (xAI Grok preferred, OpenAI GPT-4o fallback) and prompt/context engineering that injects market data, news headlines, and cross-platform/forecaster signals.
- **Decision-science scoring** — calibration uses the Brier score (a proper scoring rule), bucketed into a reliability curve.
- **Verification** — `npm run check` runs all three tsconfigs + Vite build + 405 tests.

## Honest limitations

- **Cross-platform gaps are ~0** right now — markets are efficient. The divergence column is honest, not faked; it lights up only when a real gap exists.
- **Briefs are synthesis, not retrieval-grounded research** yet — the next high-value step is real web retrieval + base rates instead of LLM reasoning over the prompt alone. News context is currently headline-level (no full-article retrieval or source URLs).
- **Some markets are stale upstream** — e.g. a long-resolved event still listed `active` by the exchange. A close-date / zero-volume filter would clean this up.
- **No accounts** — saved markets live in localStorage, calibration in local SQLite. SQLite (not Postgres) is the right call for a single-server portfolio project; I'd swap to Postgres/Turso for multi-user.

## Commands

```bash
npm run dev:web      # API + web → localhost:5173
npm run typecheck    # all 3 tsconfigs
npm run test:run     # 405 core-engine tests
npm run check        # typecheck + build + tests
npm run dashboard -- --demo   # original CLI terminal UI
```

## License

ISC
