# Parity — prediction-market efficiency

**A full-stack market-efficiency study and live cross-platform terminal for Polymarket × Kalshi — and a case study in letting the data kill my original premise, twice.**

I set out to find cross-platform mispricings between Polymarket and Kalshi. The first small scan (2,219 markets, 7 overlaps) suggested there was nothing there. So I rebuilt the pipeline to scan **the entire standalone-market universe of both platforms — 92,290 markets — and audited every apparent price gap down to the last residual.** The answer got stronger: hundreds of gaps *look* free, and after fees, liquidity, contract-spec verification, and manual review, **zero are executable**.

The finding is the product. Parity ships two surfaces: the **Lab**, which walks you through the full 92,290 → 0 audit, and the **Terminal**, a live pair-by-pair decision tool built on the same verifier.

**Live demo:** [paritylab.vercel.app](https://paritylab.vercel.app) — a frozen, reproducible snapshot. Clone and run locally for the live-data mode against both venues.

---

## The funnel (one reproducible scan, June 30 2026)

| Stage | Count | Removed by |
|---|---:|---|
| Standalone markets (Poly ≥26,930 + Kalshi 65,360) | 92,290 | — |
| Tradeable (live price, both platforms) | 52,858 | stale / no book |
| Candidate pairs (cosine ≥ 0.68) | 23,866 | embedding similarity |
| Same event (LLM-verified) | 5,431 | different event |
| Same contract (cached verifier flag) | 3,791 | topical only |
| Priceable both sides | 3,017 | degenerate / stale price |
| Clears 9pp round-trip fees | 558 | prices agree < fees |
| **Apparent gaps** (semantic survivors) | **215** | entity / scope mismatch |
| Liquid (> $500 per side) | 79 | too thin to trade |
| Strict 7-point contract-spec match | 40 | spec mismatch |
| Deep (> $10k per side) | 4 | below institutional depth |
| **Clear executable arbitrage** | **0** | resolution nuance / timing |

Every number is derived from the shipped artifact (`docs/data/efficiency-study.json`) plus a transparent correction layer — see *Honesty architecture* below. One scan, not a universal claim about market efficiency; regenerate with `npm run study`.

## What it does today

- **Lab** (landing tab) — the study as a visual argument: a to-scale 3D "consensus field" (1 point = 1 market, all 92,290 of them; the 215 apparent gaps triage down to a settled *0 confirmed* state), a log-scale compression waterfall, an exact-figures funnel ledger, the survivors wall with per-pair 7-point spec checkboxes and word-diffed contract titles, the "deep four" residuals, and gap-vs-threshold scatter charts.
- **Terminal** — a live cross-platform pair terminal on the same corpus: 2,626 matched pairs, live per-pair price refresh against both venues' books, a dossier per pair (gap vs fee meter, price history, word-diffed contract texts, the cached verifier's verdict — quoted and attributed — and a "why this isn't free money" banner with the exact gap−fee arithmetic), plus streamed AI research briefs with cited sources.
- **Core engine** (`src/`) — platform clients, embedding matcher, batch LLM verification transport with crash-resilient polling, SQLite persistence, calibration scoring (Brier) — shared by the server, study scripts, and the original Ink CLI.

## Honesty architecture

The study's credibility rests on how errors are handled, not on the headline:

- **The raw artifact is never rewritten.** `efficiency-study.json` says 221 semantic survivors. The study's verification layer is 11,138 cached AI calls — single model `gpt-4o-mini`, single prompt `v3-market-level`. A batch **strict re-verification pass** plus deterministic scope rules produced **128 corrections** (`corrections.json`) — 45 of them against those 221 survivors. The app applies corrections as a **display-layer overlay**, so raw data and judgment stay separable and diffable.
- **The corrections make the result *stronger*, not weaker.** Example: the four highest apparent gaps were Polymarket *county-level* contracts matched against Kalshi *statewide* contracts — 96–99pp "gaps" that pass naive checks. A deterministic county-scope rule now catches the whole class, in both the app and the correction generator.
- **Displayed funnel semantics:** the Lab shows 215 apparent gaps (221 − 6 deterministic scope corrections), and books the 39 strict-recheck failures where they belong — at the strict-spec gate (79 → 40). The Terminal's per-pair chips apply all 45 (hover the "Apparent gaps 176" chip for the reconciliation).
- **Red is reserved.** Across every visualization, red = confirmed executable arbitrage. It is never drawn. That absence is the argument.
- **Executability stays unproven, and the UI says so:** no order-book depth, slippage, or settlement-timing test has been run. "Same contract" is a semantic and spec verdict — not a risk-free trade.

## Quick start

```bash
git clone https://github.com/anikeitvadi/parity.git && cd parity
npm install
cp .env.example .env     # works out of the box — no API keys needed to browse
npm run dev:web          # API server + Vite frontend → http://localhost:5173
```

Market data is public (Polymarket Gamma + Kalshi events APIs). For AI research briefs add `XAI_API_KEY` (preferred) or `OPENAI_API_KEY` to `.env`. Regenerating the study (`npm run study`) needs `OPENAI_API_KEY` for embeddings + verification.

## Architecture

```
web/                         React 19 + Vite + Tailwind v4 — "Lab" + "Terminal" tabs
├── pages/LabPage.tsx            the study page (stats, waterfall, ledger, survivors, experiments)
├── pages/TerminalPage.tsx       queue + dossier orchestration, chips, sort, live-price merge
├── components/lab/consensus3d/  the 3D consensus field (react-three-fiber, code-split)
├── components/PairQueue.tsx     the pair list
├── components/PairDossier.tsx   per-pair audit document (gap meter, diff, verdict, brief)
├── lib/funnel.ts                corrected funnel derivation (single source of the 215→79→40→4→0)
├── lib/pairStatus.ts            status taxonomy, causeOfDeath(), scope-mismatch detector
└── api/client.ts                fetch + SSE; VITE_STATIC=true swaps /api for bundled snapshots

server/                      Hono API (:3001), in-memory TTL caches
├── routes/opportunities.ts      /pairs (corpus + live overlay), /pair-live, /pair-history, /feed
├── pairs-data.ts                frozen-corpus loader + correction overlay
└── routes/{markets,research}.ts market enrichments; SSE-streamed briefs (xAI → OpenAI fallback)

src/                         Core engine — clients, embeddings, matcher, batch verifier, SQLite
scripts/                     efficiency-study.ts, build-corrections.ts, retriage.ts, snapshot.ts,
                             verify-batch*.ts (Batch API transport + doctor + crash-safe poller)
docs/data/                   efficiency-study.json, corrections.json, pair-audit.csv, gap-map.csv
```

Three TypeScript projects typecheck independently; `npm run check` runs all three + the Vite build + 435 tests.

## Reproducibility

| Layer | How it runs | API key? |
|---|---|---|
| Lab + Terminal corpus | **Cached artifacts** (`docs/data/*.json|csv`), served by the API or bundled statically | None |
| Live pair prices | **Live** — per-pair probe of both venues on dossier open | None |
| Full study regeneration | `npm run study` → embeddings + LLM verification (Batch API transport with `npm run verify:batch:*`) | `OPENAI_API_KEY` |
| Corrections layer | `npm run corrections` (deterministic rules + cached strict re-verification) | None (reads cache) |
| AI research briefs | **Live** model, SSE-streamed, rate-limited + cached | `XAI_API_KEY` or `OPENAI_API_KEY` |
| Brief evals | `npm run eval:briefs` (promptfoo; offline mock without a key) | Optional |
| Static deploy | `npm run snapshot` → `VITE_STATIC=true npm run build:web` → zero-backend bundle | None at runtime |

## Honest limitations

- **One scan.** The corpus is frozen at June 30 2026. The Terminal refreshes prices per pair on demand, but the match set itself is a snapshot; markets list and delist daily.
- **The universe counts are lower bounds** where pagination caps applied (Polymarket is reported as ≥26,930 for exactly this reason).
- **The verifier over-matches on look-alike questions.** That's a finding, not a footnote — it's why the strict re-verification and correction layer exist, and 63 of its 3,791 same-contract flags were reversed on audit — 45 of them among the 221 apparent-gap survivors.
- **Executability was never proven or disproven at the book level.** No depth, slippage, or settlement-timing test has been run; the study stops at "no gap survives the checks a trade would have to pass first."
- **No accounts, single server.** SQLite + sqlite-vec, deliberately — the whole study stays reproducible from files in the repo.

## Commands

```bash
npm run dev:web       # API + web → localhost:5173
npm run study         # regenerate the full study from live data (needs OPENAI_API_KEY)
npm run corrections   # rebuild the correction overlay from cache + deterministic rules
npm run snapshot      # freeze API responses into web/public/snapshot/ for the static build
npm run check         # 3× typecheck + Vite build + 435 tests
npm run eval:briefs   # promptfoo factuality + source-honesty evals (offline mock if no key)
npm run dashboard -- --demo   # original CLI terminal UI
```

## Deploy

**Static (recommended for the public demo):** `npm run snapshot`, then `VITE_STATIC=true npm run build:web` — the bundle serves the Lab and the full 2,626-pair Terminal with zero backend calls (verified). `vercel.json` runs the static build on push (the snapshot is committed to the repo).

**Full container:** one image serves the built frontend and the API together; briefs are rate-limited per IP and globally so a public demo can't drain a key.

```bash
docker build -t parity . && docker run -p 3001:3001 -e XAI_API_KEY=... parity
```

## License

ISC
