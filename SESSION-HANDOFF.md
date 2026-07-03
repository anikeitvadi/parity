# Session Handoff — SHIP-READY (2026-07-03)

> Read this + `REVIEW-FINDINGS.md` (final disposition of all 59 audit findings) first.
> Branch `feat/consensus-field-3d`, ~16 commits ahead of main, **NOTHING PUSHED**.
> `npm run check` GREEN at tip (typecheck ×3 + Vite build + 435 tests). Static deploy verified.

## TL;DR
The product is done and audit-clean. A 59-finding adversarial review (2 rounds) ran across thesis,
numbers, UX, heroes, docs, and hygiene; **every finding is either fixed (with commit) or explicitly
noted with an owner** — see REVIEW-FINDINGS.md's disposition ledger. Docs were rewritten to the real
study and independently fact-checked (publish gate); all must-fixes applied. What remains is shipping
mechanics, not product work.

## Ship checklist (in order, ~30 min + deploy)
1. **(optional, 5 min)** Funnel-ledger height nit — stretch the ledger card to match the waterfall
   (same treatment as Experiment 1 in commit 19f06c4: grid `items-stretch`, card `h-full flex flex-col`,
   let the table breathe). Was in flight when the session pivoted to handoff.
2. **(if repo public)** Hygiene sweep: move SESSION-HANDOFF.md, REVIEW-FINDINGS.md,
   SCANNER-REFRAME-HANDOFF.md -> docs/archive/ (or delete); decide `.planning/` (68 committed AI-session
   files); add LICENSE file (ISC to match package.json + README); optionally fix package.json
   name/description ("prediction-market-scanner" / scanner-era description).
3. **Push + PR + merge** to main.
4. **Deploy**: vercel.json builds `VITE_STATIC=true npm run build:web` from the COMMITTED snapshot
   (web/public/snapshot/*, regenerated 2026-07-03, verified zero-/api with full 2,626-pair Terminal).
   Click through the live URL once: Lab hero renders, Terminal loads, one dossier opens.
5. **Post**: docs/LINKEDIN.md has the fact-checked draft (hook, numbers, visual guidance).
   docs/INTERVIEW-WALKTHROUGH.md is the rehearsal script.

## What this session shipped (commit -> what)
- `7e78ad6` handoff + findings tracker (round-1)
- `3502c93` polish pass: dossier rationale attribution, history empty-state, Matches chip,
  row/dossier live-price sync, hologram trust+perf fixes, red->orange dots, index.html identity
- `f50b289` deployment readiness: settled demotion (per-pair probe evidence only), staged load
  narration, prices-as-of tick, server cache 60s->900s (12.5s cold -> 23ms warm), snapshot regenerated
- `1653778` README rewritten to the real study; pair-audit.csv relabeled (221 rows,
  confirmed_arbitrage -> semantic_survivor, both columns); retriage.ts defused (emits current
  taxonomy + no longer clobbers app-shaped study.funnel — re-running it was a regression trap)
- `c6f17d5` PORTFOLIO/LINKEDIN/INTERVIEW-WALKTHROUGH rewritten + publish-gate must-fixes
  (63-not-45 of 3,791 reversed; fees upstream of the 215 by construction; waterfall captioned
  52,858->0; red-reserved claim scoped to the consensus field)
- `f76a0dc` arcs snap to real dots; gap beacons steady (interim state)
- `77114f1` + `040bbd3` gaps redrawn as amber THREADS at uniform 1:120 link sampling
  (proportion-honest; beacon dots deleted); legend cleaned (no "(verified)" overclaim, no
  Standalone-total row, sampling caption)
- `a8f1b48` + `01a1119` traveling orbs replace the white pulse (hue-true, bidirectional,
  ride the exact arc bezier, fade at ends)
- `dec5fda` survivors wall CSS-columns bug: 64 of 79 cards rendered INVISIBLY off-card
  -> scrollable grid
- `ca7b6a6` + `19f06c4` experiments 2/3 to full-width bottom row; Experiment-1 card stretches with
  height-aware scatter (PlotFigure fill mode: absolute inner layer, no resize feedback loop)

## Key technical facts a future session needs
- **Number model**: raw artifact 221 semantic survivors / 44 strict; displayed funnel 215->79->40->4->0
  via web/src/lib/funnel.ts::correctedFunnelCounts (subtracts only the 6 deterministic corrections;
  the 39 strict-reverify kills are booked at the strict gate). Terminal chips apply all 45 ->
  counts.survivor=176. corrections.json total=128. 63 of 3,791 same-contract flags reversed overall
  (45 among the 221). A tooltip on the Apparent-gaps chip explains 176-vs-215.
- **Hologram encoding**: 1 point = 1 market (92,290, to scale, Kalshi 2.43x); links sample at
  ~1:120 (32 teal gradient threads = 3,791 candidates, 2 amber = 215 gaps); every thread endpoint
  is a real rendered dot; orbs travel both directions, hue follows position; red never drawn.
- **Bulk live-map is broken by design** (ROOT-CAUSED): the pairs route uses getActiveMarkets()
  (FIRST Gamma page only, ~100 markets) vs the study's paginating getAllActiveMarkets -> live map
  matches ~0/400 corpus pairs. Everything user-visible now uses per-pair probes (/pair-live).
  Proper fix if wanted: on pairs-cache build, probe the ~400 corpus ids directly (concurrency-limited).
- **retriage.ts**: safe now, but the verdict-cache vocabulary still says 'confirmed_arbitrage' —
  the script MAPS it to 'semantic_survivor' on output and writes its funnel to study.triageFunnel.
- **Static mode**: client.ts VITE_STATIC=true reads web/public/snapshot/*; fetchPairLive returns null
  -> no live badges/settled demotion in static (correct: can't verify). Regen: dev servers up ->
  `npm run snapshot` -> `VITE_STATIC=true npm run build:web`.
- **npm cache is broken** (root-owned ~/.npm/_cacache): use `npm install --cache /tmp/fresh-cache`.
- **Token-compression hook** (RTK/headroom) mangles file reads mid-session; for surgical edits either
  disable it or print exact lines via python line-slices and patch by line index.

## Where everything lives
- Findings + final disposition: `REVIEW-FINDINGS.md` (committed, this repo).
- Raw audit JSON + all verification screenshots: session scratchpad
  `/private/tmp/claude-501/-Users-anikeit-new-project/0c27b23f-a2bb-49d2-906e-0da60939e6a4/scratchpad/`
  (review-round1.json, review-round2.json, shots/*.png — ephemeral tmp, will not survive forever).
- Persistent memory: `~/.claude/projects/-Users-anikeit-new-project/memory/` — endgame-punch-list is
  the running log; NOTE the hologram gap encoding changed 2026-07-03 (beacons -> sampled amber threads).
- LinkedIn draft + interview script: docs/LINKEDIN.md, docs/INTERVIEW-WALKTHROUGH.md (gate-checked).
