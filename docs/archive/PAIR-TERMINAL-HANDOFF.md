# Pair Terminal + Trust Layer — Handoff (2026-07-01)

## TL;DR
The **Scanner** was rebuilt from a market-browser into a **live cross-platform PAIR terminal**; the
**Lab** got a 3D "Consensus Field" hero; then a **verdict trust layer** (honest labels + a correction
overlay) was added on top. State: **`npm run check` GREEN** (3 typechecks + Vite build + **435 tests**),
Playwright boots with **zero console errors**, all key screens screenshot-verified. **Uncommitted** on
branch `infra/harden-batch-verification` (that branch also carries unrelated batch-verifier infra — the
product layer should land as its own branch off `main`).

Durable detail lives in memory: **`scanner-pair-terminal-spec`**, **`verdict-trust-layer`**,
`scanner-reframe-complete` (superseded), `ui-overhaul-plan`, `efficiency-lab-finding`.

## What the product is
- **Scanner** = a LIVE terminal. Every row is one event listed on **both** Polymarket (BLUE `#60A5FA`)
  and Kalshi (GREEN `#22C55E`). Live discovery + **cached rigor**. NOT a market browser, NOT a frozen
  museum (the old two-mode "Study Explorer" was deleted).
- **Lab** = methodology/proof page. Scanner says "same verifier as the Efficiency Lab."
- Goal: opening the Scanner instantly says *"these are current cross-platform candidates, this is what
  the verifier knows, this is why the apparent edge is or isn't tradable."* Honesty is the whole point.

## Architecture / data flow
- **Read-model:** `server/src/pairs-data.ts` `loadVerifiedPairs()` reads the **triaged, oriented** study
  artifacts — `docs/data/efficiency-study.json` (`pairs[].triage_label`) + `strict-survivors.json` +
  `corrections.json` (overlay). It does **NOT** use the raw `verdict_cache` — a raw join reintroduces
  the orientation / near-settled artifacts the study exists to remove (this was a real bug, caught and
  fixed early).
- **Endpoints** (all in `server/src/routes/opportunities.ts`):
  - `GET /api/opportunities/pairs` — the queue. Status from `triage_label`, live price refresh over the
    live universe, thinner-side liquidity = `min(polyVolume,kalshiVolume)`, default "opportunity" sort
    (strict survivors → liquidity). Cached 60s. Filters via query params.
  - `GET /api/opportunities/pair-live?poly=&kalshi=` — on-open live prices: Poly via CLOB
    `getMarketDetails`, Kalshi via new `KalshiClient.getMarket(ticker)`.
  - `GET /api/opportunities/pair-history?poly=&kalshi=&days=30` — dual-venue history.
  - `GET /api/lab/{efficiency,strict-survivors,corrections}` (in `server/src/index.ts`).
- **Web:** `pages/TerminalPage.tsx` (pair-centric shell), `components/PairQueue.tsx`,
  `components/PairDossier.tsx`, `lib/pairStatus.ts` (verdict display + `suspiciousReason`),
  `lib/pretextText.ts` (variable-typographic canvas text), `components/lab/ConsensusField.tsx`.
  `api/client.ts` `fetchPairs()` fetches the FULL set once and filters client-side (static-mode parity).

## What was built this session (in order)
1. **Pair terminal** — queue rows = cross-platform pairs; dossier = the decision view.
2. **Live refresh + honest freshness** — dossier refreshes both prices on open; per-side `● live / ◌
   closed / ❄ snapshot`; header "prices live · {t} · verdict cached {date}".
3. **Kalshi history + dual chart** — new `KalshiClient.getPriceHistory` (candlesticks); **fixed a latent
   Poly `getPriceHistory` bug** (used `startTs/endTs&fidelity=60` → returned nothing; switched to
   `interval=1d|1w|1m|max&fidelity=1440`). Dossier `HistoryChart` = dual-line SVG (blue/green, oriented).
4. **Consensus Field** — 3D rotating data-bound Lab hero (`components/lab/ConsensusField.tsx`): Poly/Kalshi
   lobes, real same-contract threads, apparent-gap flares (colored by `catOf(reason)`), triage collapse to
   0; **pretext** (`@chenglou/pretext/rich-inline`) renders real market questions in variable-weight serif
   (`lib/pretextText.ts`). Replaced the old DOM `LabHero` and the flat `FunnelCollapse`.
5. **Trust layer** (see below).

## Trust layer (latest + most important — see `verdict-trust-layer` memory)
Problem: the study's LLM verifier **over-claims "same contract"** on look-alike-but-different questions
(e.g. Poly "will a player representing Morocco be WC top goalscorer" vs Kalshi "Morocco: Goal Leader —
Saibari"). The app was showing those false verdicts as authoritative.

- **#1 App honesty** (`web/src/lib/pairStatus.ts`): never render bare "same contract" unless
  strict-spec verified. `verdictDisplay(pair)` → only `strictSurvivor && !suspicious` earns "Same
  contract ✓"; else honest label (`same_contract` status relabelled **"Candidate"**, survivor="Apparent
  gap"). `suspiciousReason(polyTitle,kalshiTitle)` = deterministic over-match detector (5 patterns).
  Dossier shows ⚠ over-match warning + "cached label · not strict-spec verified".
- **#2/#3 Correction overlay** (`scripts/build-corrections.ts`, `npm run corrections` →
  `docs/data/corrections.json`, ADDITIVE — frozen artifacts untouched): **115 corrections** (39
  `strict_reverify` = survivors the study's own 7-point audit already failed + 76 `deterministic_rule`).
  `loadVerifiedPairs` applies the overlay (corrected verdict wins; adds `corrected/correctionReason/
  correctionSource`; corrected pairs → `spec_mismatch` status). Dossier shows the ↺ "Reclassified…" note
  and strikes the original reason.
- **#4 Impact:** survivors **221 → 180** (−41 false positives), spec_mismatch 337 → 452 (sum conserved
  5,431). **Strict 44 / deep 4 / clear-executable-arb 0 — UNCHANGED.** Corrections only remove false
  positives, so the "gaps easy to find, hard to trade" finding holds (strengthens).
- **Lab↔Scanner parity:** `/api/lab/corrections` + `fetchCorrections()` + snapshot; LabPage threads the
  corrected count through the Consensus Field readout, stat card ("180 · 221 scanned − 41 reclassified"),
  EvidenceWall, and the narrative — framed as rigor, not a retraction.

⚠️ **KEEP IN SYNC:** `suspiciousReason` exists in BOTH `web/src/lib/pairStatus.ts` and
`scripts/build-corrections.ts` (Node can't import the web module cleanly). Edit both together.

## Open threads / next steps (roughly prioritized)
1. **Waterfall/ledger parity (small):** `CompressionWaterfall` + the funnel-ledger table derive from
   `web/src/lib/funnel.ts` `funnelStages()` (untouched), so their semantic-survivor bar may still read the
   raw **221**. The hero, stat cards, EvidenceWall, and narrative are corrected. Align these two.
2. **Deeper LLM pass (optional, user deferred):** the **138 sub-$500 survivors** are honestly labelled
   "not strict-verified" but were NOT individually re-checked. `OPENAI_API_KEY` is in `.env`; reuse
   `scripts/strict-survivors.ts` machinery at `FLOOR=0` for full coverage, then regen corrections.
3. **Cleanup (#4):** orphaned-but-unused components left in place (don't delete unprompted): `LabHero`,
   `FunnelCollapse`, `DecisionPane`, `EvidenceBoard`, `OpportunityQueue`, `VerifierPanel`,
   `useVerifierIndex`, `verifier.ts`, `ConsensusGapMap`. (`StudyExplorer` already deleted.)
4. **Static deploy:** re-run `npm run snapshot` (writes `pairs.json`, `corrections.json`,
   `strict-survivors.json`, etc.) for the `VITE_STATIC=true` bundle. Current `web/public/snapshot/` is stale.
5. **git commit** — everything is uncommitted. Plan: branch off `main` for the product layer.

## Run / verify
- `npm run dev:web` — server (:3001) + Vite (:5173). Scanner is the default tab; "Efficiency Lab" is the
  other top-nav tab.
- `npm run check` — 3 typechecks + Vite build + 435 tests (must stay GREEN).
- `npm run corrections` — regenerate the correction overlay (after any re-run of the study).
- Screenshots via Playwright: scripts in the session scratchpad use
  `createRequire('/Users/anikeit/new-project/')` to resolve `playwright` from the project.

## Gotchas
- `statusFor()` (opportunities.ts) must map `'spec_mismatch'` input → `spec_mismatch` status (corrected
  verdicts use that canonical label; it previously fell through to `topical`). Fixed.
- Poly `getPriceHistory` needs `interval=`; Kalshi series ticker = `ticker.split('-')[0]`.
- Colors are LOCKED: Poly BLUE `#60A5FA`, Kalshi GREEN `#22C55E` (the lab-hero.html mockup used
  cyan/violet — we kept blue/green for Scanner↔Lab consistency).
- The artifact's `kalshiYes` is already oriented; live Kalshi quotes are raw → orient with
  `yesAligned ? raw : 1-raw`.
- In THIS session the Read tool auto-compresses large files — read small line ranges.
