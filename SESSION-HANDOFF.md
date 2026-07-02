# Session Handoff — 2026-07-01 → 07-02 (Opus / ultracode)

Branch: `infra/harden-batch-verification`. Everything below is **committed** (8 commits on top of the pre-session tip `dcda5bb`). `npm run check` is GREEN (typecheck ×3, Vite build, 435 tests). Dev server run: `npm run dev:web` → http://localhost:5173.

This session took the project from "green but presentation lagged the data" to a coherent, honest, more-polished product, and resolved several real bugs surfaced by actually clicking through the app for the first time.

---

## Commits this session (oldest → newest)

1. `83f70f6` **baseline + county-scope integrity fix** — committed the whole 49-file working tree; dossier "audit document" upgrade (word-diff on contracts, `causeOfDeath()` banner, provenance footer); added a **county-vs-statewide scope detector** to `suspiciousReason()` in BOTH `web/src/lib/pairStatus.ts` and `scripts/build-corrections.ts` (kept in sync per their invariant).
2. `07209a2` **font + queue + consistent funnel** — Inter + JetBrains Mono; queue rebuilt as a decision list (verdict rail, gap anchor, blue/green prices, ★/⚠, price flash); the corrected-funnel consistency work (see Decisions §2).
3. `09c50ba` **honest price freshness + two clocks + cut briefs + consistent strip** — the Merab fix.
4. `079efb5` **strip reframe + page refresh + restore & fix briefs** — briefs un-cut, lookup bug fixed.
5. `3bebfee` **fix brief newline rendering** — SSE JSON-encoding.
6. `7a39bd5` **Parity branding + land-on-Lab + top-bar cleanup**.
7. `a734dee` **full-bleed + bolder hologram**.
8. `afe33d5` **hologram reworked into two glowing galaxies** (current tip).

---

## Key decisions made this session (with rationale)

### 1. Branding & IA
- Product is now **"Parity"** (tagline "prediction-market efficiency"), two-dot mark (blue Poly + green Kalshi overlapping = cross-listed set). Replaces the old "Scanner" brand that collided with the "Scanner" tab.
- Tabs are **`Lab`** and **`Terminal`** (was "Efficiency Lab" / "Scanner").
- **Default landing is the Lab** (story-first: funnel + hologram + finding). Terminal is one click away. `App.tsx` default tab = `'lab'`.

### 2. The number-consistency model (IMPORTANT — this changed a headline number)
The old "221 apparent gaps → 180 after correction" was **double-counting**. Two kinds of corrections exist in `corrections.json`:
- **39 `strict_reverify`** corrections = EXACTLY the 39 `strict_survivor=false` pairs = the funnel's own 7-point cull (`liquid 83 → strict 44`). Already in the funnel.
- **6 `deterministic` scope corrections** (incl. 4 county) = genuine semantic-level false positives.

The old 180 subtracted all 45 from the apparent-gap total, but the 39 are already represented as the strict cull → double count. The **consistent model** (implemented in `web/src/lib/funnel.ts::correctedFunnelCounts`):
- `semanticSurvivors = 221 − (deterministic semantic corrections only) = 215`
- `liquidSurvivors = 83 − (corrected pairs that were strict_survivor=true, i.e. county) = 79`
- `strictSpecSurvivors = 44 − 4 county = 40`
- `deepStrictSurvivors = 4` (county are <$10k tier, unchanged)
- **Funnel now reconciles everywhere: `215 → 79 → 40 → 4 → 0`.** EvidenceWall shows `79 = 40 strict + 39 mismatch`.

`correctedFunnelCounts(study, strictPairs, correctionKeys, semanticFalsePositives)` is the single source; LabPage + (formerly) TerminalPage compute `semanticFalsePositives = corrections.filter(c => c.correction_source !== 'strict_reverify' && c.original_verdict === 'semantic_survivor').length`.

**KNOWN residual inconsistency (not yet resolved):** the Scanner's filter **chips** come from the server's per-pair status counts (`/api/opportunities/pairs` meta.counts), where `survivor = 176` (server flips ALL corrections, including the 39, to spec_mismatch). So the Lab says "215 apparent gaps" while the Scanner chip says "Apparent gaps 176". They're different metrics (study funnel stage vs live-survivor count). The **Terminal verdict strip deliberately no longer shows an apparent-gaps number** (it shows `52,858 tradeable → 3,791 cross-listed → 0 executable`) to avoid an on-page contradiction. If you want full cross-page consistency, either relabel the chip or reconcile the server count — flagged, not done.

### 3. County-scope corrections were regenerated into the data
Ran `npm run corrections` (safe: no LLM, deterministic, writes only `corrections.json`). Now **128 corrections** (was 115); `survivorsReclassified` 41→45; the 4 county strict-survivors are baked in. `docs/data/corrections.json` is updated & committed. The study funnel JSON (`efficiency-study.json`) still has raw `semanticSurvivors=221, strictSpecSurvivors=44` — the correction is applied at the display/derivation layer, NOT baked into the study artifact (deliberate — avoids the risky `retriage.ts`/`efficiency-study.ts` regen).

### 4. Live vs. batch architecture (framing the user landed on)
The 9-hour job is **AI verification** (cached corpus = the moat, 11,138 verdicts). It is NOT re-run on demand. "Live" = **re-pricing** the cached corpus (seconds). Incremental keep-fresh only verifies NEW markets (cache covers the rest) → minutes, not hours. For the portfolio: run once, re-run incrementally before interviews, keep prices live. The UI now reflects this: **two clocks** (`corpus · verified Jun 30` + live `prices` freshness) and a **`↻ refresh prices`** control (re-prices; does not re-scan).

### 5. Briefs kept (not cut)
It IS a research terminal. The brief is **grounded synthesis** (cross-platform prices + 7-day history + cached news + Metaculus forecasts) — NOT agentic (no live web/tool reach; see `research.ts:49-50`). User may want it made truly agentic later (open item).

### 6. Hologram = point-field (NOT pretext)
User confirmed: keep the data-driven point-field (it carries meaning — points = real markets, threads = matches, flares = gaps), make it genuinely impressive. Pretext-as-hero was considered and rejected. The market-question wave text is REMOVED for good.

---

## Bugs fixed this session (all real, all surfaced by clicking through)

- **Merab/Khamzat "prices don't match live":** these Dec-2026 futures fall out of the live feed and/or have no Kalshi order book, but the app stamped them "prices live." Fixed: `kalshi.getMarket()` now returns `hasBook` (a real live ask vs a stale `last_price` fallback), plumbed `hasBook` through `LiveSide` → `/pair-live` → `PairDossier`. Dossier now shows per-side `POLY·live / KAL·no book / settled / snapshot` and the cause-of-death says "Stale-price artifact — the Kalshi side has no live order book."
- **Brief "Market not found" 404:** resolved study markets aren't in `getActiveMarkets()`. `research.ts` now falls back to reconstructing a minimal `Market` from `loadVerifiedPairs()` (the frozen corpus). Verified live.
- **Brief rendered as a run-together blob:** newline-only LLM tokens collapsed over SSE's newline framing. Fixed by JSON-encoding each streamed token server-side (`research.ts`) and JSON-parsing client-side (`client.ts streamResearch`). Verified: reconstructed brief carries `\n\n` section breaks.
- **"Best verified" chip included spec_mismatch** (trust bug) — removed. **Keyboard-nav effect had no deps array** — fixed.

---

## Current UI state (what a visitor sees)

- **Land on the Lab:** full-bleed hologram (85vh, two glowing galaxies blue/green, dense cores, threads bridging, depth falloff, NO words), the `scale of one scan` strip, the reconciled funnel (`215 → 79 → 40 → 4 → 0`) in the waterfall + ledger, EvidenceWall survivor cards, DeepSurvivors word-diff, Experiment scatter plots.
- **Terminal tab:** verdict strip `52,858 tradeable → 3,791 cross-listed → 0 executable` (count-up), `↻ refresh prices`, decision-list queue (verdict rail, gap anchor, ★/⚠, price flash), auto-opened top pair, rich dossier (two clocks, per-side freshness, word-diff contracts, cause-of-death, verifier checklist, research brief, provenance footer).

---

## Open items / next steps

1. **Iterate the hologram** — it was just reworked BLIND (agent can't see pixels). Dials in `web/src/components/lab/ConsensusField.tsx`: `lobe()` cx separation (±1.28) + core concentration (`pow(rnd, 1.8)`); `bg` count (820); point size (`2.3`), brightness (`pow(q.s,1.35)*1.6`); thread/flare alphas. Have the user say warmer/colder.
2. **Second hero visual for the Terminal** — its own wow moment (never built).
3. **Make the brief agentic** (optional) — real live web search + tool-use / multi-step. Currently grounded synthesis only.
4. **Reconcile the chip-vs-strip number** (176 vs 215) if desired — see Decisions §2.
5. **Static-snapshot regen + docs** before publishing: `npm run dev:server` → `npm run snapshot` → stop → `VITE_STATIC=true npm run build:web`. Docs still tell the OLD 2,219→7→0 story. Root markdown handoffs should be archived to `docs/archive/` (this file too, once consumed).
6. **Truth-layer script cleanup** (from the pre-session mission brief, still valid): `retriage.ts`/`efficiency-study.ts` still use the old `confirmed_arbitrage` taxonomy + would clobber the 11-stage funnel if run. Not touched this session (we avoided regenerating the study artifact).

---

## How to continue

- Verify: `npm run check` (typecheck ×3 + build + 435 tests). Web-only changes: `npm run typecheck && npm run build:web`.
- Dev: `npm run dev:web` → localhost:5173 (Lab loads first). The Hono server hot-reloads on `server/` changes; `src/services/kalshi.ts` change (added `hasBook`) is core-engine, covered by tests.
- Regenerate county corrections (safe, no LLM): `npm run corrections`.
- Key files: `web/src/lib/funnel.ts` (correctedFunnelCounts), `web/src/pages/LabPage.tsx` (derivation + full-bleed layout), `web/src/components/lab/ConsensusField.tsx` (hologram), `web/src/pages/TerminalPage.tsx` (strip + refresh), `web/src/components/PairDossier.tsx` (freshness/clocks/brief/cause-of-death), `server/src/routes/research.ts` (brief + lookup fallback + SSE JSON), `server/src/routes/opportunities.ts` (hasBook + /pairs meta), `src/services/kalshi.ts` (getMarket hasBook), `scripts/build-corrections.ts` (county detector).

## Gotchas
- **Static mode** (`VITE_STATIC=true`): `snap()` never throws; briefs degrade to a note (no server); `hasBook`/freshness need the live server.
- **suspiciousReason()** is duplicated in `pairStatus.ts` (app) and `build-corrections.ts` (offline) with a MUST-stay-in-sync invariant.
- The **corrections overlay is a display/derivation layer**, not baked into `efficiency-study.json`'s funnel. Everything visible is consistent at 215/79/40/4/0; the raw artifact still says 221/44.
