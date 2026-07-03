# SCANNER REFRAME — handoff (finish the holistic pass in a fresh session)

> **✅ DONE 2026-06-30.** The two-mode holistic pass is built + `npm run check` GREEN (435 tests) + Playwright-verified with zero console errors against live data (746 live / 142 join the study / 19%). Shipped: two-mode shell (Live Terminal ↔ Study Explorer) in `TerminalPage`, `StudyExplorer.tsx` (reuses `EvidenceWall`+`DeepSurvivors` + funnel strip + "Open the full Lab"), `VerifierPanel.tsx` in `EvidenceBoard` (counterpart + gap-vs-9pp ruler + 7-pt checklist + actionability verdict + honest "live only"), verifier filter chips (ALL/IN STUDY/MATCH/MISMATCH) + empty-hint linking, `useVerifierIndex` exposes `{strict, ready}`, counts clarity in the mode strip. **Only remaining:** item 3 (Kalshi candlestick history — optional) and item 4 (ingest — skip). Uncommitted; static deploy still needs a fresh `npm run snapshot`.

_2026-06-30. The prior session's context grew large enough that file reads compressed heavily and edits got slow/error-prone. Start fresh for clean reads, then finish the whole pass and show it complete (per the user's "don't patch piecemeal" brief)._

## The brief (user intent)
Scanner = a live **research/decision terminal** answering at a glance: (1) what is this market, (2) its cross-platform counterpart, (3) is the gap real / semantic-only / liquid / strict-matched / rejected, (4) why trust or ignore it, (5) how it relates to the Efficiency Lab finding. Aesthetic = **Bloomberg / research terminal / holographic lab, NOT a SaaS dashboard.** Visuals serve decisions, never decoration. Do the WHOLE shell as ONE coherent pass; show it complete.

**Full pass spans:** command bar · filters · queue rows · selected-state · Signal / Gap / Type / Liquidity / Verification columns · DecisionPane · EvidenceBoard · price chart · empty/loading states · Lab↔Scanner linking language.

**Row verifier states (9):** live only · no counterpart · candidate match · semantic survivor · liquid survivor · strict spec-match · spec mismatch · deep survivor · executable arb 0 / none proven. For rows without study-backed data, label honestly ("live only" / "not in frozen study" / "not verified") — never imply a live row went through the full Lab pipeline.

**Selected-market detail (2nd WOW):** CURRENT ODDS · Poly/Kalshi price comparison when available · gap bar with the 9pp fee threshold · verifier checklist · mismatch reason · source/evidence/call panel · price history for both platforms where available · "why this is / isn't actionable".

## Two-mode architecture (LOCKED product decision — 2026-06-30)
The live feed does NOT contain the dramatic survivor states right now (only 142/746 live rows join the study, and they're mostly `candidate`). So the Scanner becomes **two modes/tabs** — made EXPLICIT in the UI, never hidden as a caveat:

**1. Live Terminal** — the current API feed. Honest live rows: `live only`, `not in frozen study`, `candidate match`, `spec mismatch`. (Mostly MATCH today.) For current scanning / decision work.

**2. Study-Backed Explorer** — the frozen survivor/candidate set from the Lab artifacts. Where **semantic survivors, liquid survivors, strict survivors, the deep four, and rejected false positives** are inspectable even when they're not in today's live cache. The proof-backed universe + the dramatic verifier states.

Make the split explicit in the UI: "Live feed: current markets" · "Study explorer: frozen verified run" · "142 live markets join the frozen study right now" · "Survivor states come from the frozen run, not necessarily today's live cache". **Finish the holistic pass around this architecture.**

## LOCKED (see memory [[ui-overhaul-plan]], [[efficiency-lab-finding]])
- Colors: **Polymarket BLUE `#60A5FA`, Kalshi GREEN `#22C55E`** (violet is NOT a platform).
- Hologram (later stage) = **react-three-fiber: YES**.
- Don't re-run `npm run study` (shifts the locked 221/83/44/4).

## DONE this session (web typecheck + build GREEN)
- `web/src/lib/verifier.ts` — `buildVerifierIndex(study, strict)` → `Map<marketId, VerifierRecord>`; 6 states `live_only|candidate|semantic_survivor|spec_mismatch|strict_match|deep_survivor`; exports `STATE_META`, `TONE_CLASS`.
- `web/src/lib/useVerifierIndex.ts` — module-cached hook (one shared fetch of study+strict → built index). Call it from any component.
- `web/src/components/OpportunityQueue.tsx` — **Verif column wired** (`VerifChip`): matched rows show the state badge, unmatched show a faint `·` (never a false "verified" claim).
- **Real Polymarket price history** — `src/services/polymarket.ts` `getPriceHistory()` (PUBLIC CLOB `/prices-history`, no wallet), wired as a fallback in `server/src/routes/markets.ts` (~L258) when DB history is sparse → ~169 real pts/market.
- **Elevated price chart** in `web/src/components/EvidenceBoard.tsx` (`PriceSparkline`): platform-colored line + area fill, Metaculus + cross-platform reference lines, **hover crosshair + price/date readout**, date axis, legend. Kalshi header badge fixed to green (L48).
- **Prominent search command bar** in `web/src/pages/TerminalPage.tsx` (icon + wider, top bar h-11).

## KEY FINDING — why two modes (resolved by the architecture above)
Live feed (746 cached) joins the frozen study at **142/746 (19%)**, overlap = **138 `candidate` + 4 `spec_mismatch`, ZERO survivors**. The survivors are study markets not in the live cache. **Resolution = the two-mode architecture:** the **Study Explorer** surfaces survivors/rejects directly from the frozen Lab artifacts (`docs/data/efficiency-study.json` pairs + `docs/data/strict-survivors.json`) — **no ingest required**. Ingesting the study universe into `markets.db` is now an OPTIONAL enhancement to make the *Live Terminal* richer, not a prerequisite for the survivor states to be inspectable.

## REMAINING (rest of the holistic pass — structured around the two modes)
0. **Two-mode shell** — a tab switch in the Scanner: **Live Terminal** (the current queue, already has verifier badges) vs **Study Explorer** (frozen survivors/rejects from artifacts). NOTE: the Lab's `web/src/components/lab/EvidenceWall.tsx` + `DeepSurvivors.tsx` already render the survivors from the SAME artifacts — **reuse/adapt them for the Study Explorer rather than rebuild.** Make the Live-vs-Study distinction explicit (per the locked decision above).
1. **DecisionPane/EvidenceBoard verifier panel** — for the selected market, render its `VerifierRecord` via `useVerifierIndex().index.get(selectedId.id)`: counterpart (platform/question/price), **gap bar vs the 9pp fee line**, the 7-point checklist (`rec.checklist`), `rec.specMismatchReason`, and a "why this is / isn't actionable" line. When no record → honest **"live only · not in frozen study."** Insert near EvidenceBoard's cross-platform section (~L95–117).
2. **Counts clarity** — header: `Live: <feed N>` vs `Efficiency Lab: 92,290 standalone / 52,858 tradeable (frozen)` (`study.universe.total` / `study.tradeable.total`). TerminalPage count is `{filtered.length}` (~L206). This is also the Live-vs-Study explicit labeling.
3. **Kalshi price history** — add candlesticks to `src/services/kalshi.ts` (resolve series_ticker → `/series/{s}/markets/{ticker}/candlesticks`), wire a markets.ts fallback like Polymarket → every selected market gets a curve.
4. **Ingest** — OPTIONAL now (Study Explorer surfaces survivors from artifacts directly). Only do it to enrich the *Live Terminal*.
5. Verifier-state **filter chips** in the toolbar; empty/loading states; Lab↔Scanner linking language.

## Exact pointers (TerminalPage, line numbers approximate)
- imports L1–5 · state L10–19 · `const filtered = getFiltered()` L80 · count `{filtered.length}` ~L206 · `<OpportunityQueue …>` ~L223 · `<DecisionPane detail=… loading=… selectedId=… onSelectMarket=… />` L233–238.
- Dev server: `npm run dev:web` (running). Gate: `npm run check`.
