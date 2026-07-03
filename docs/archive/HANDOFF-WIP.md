# HANDOFF — resume the Efficiency Lab (next session)

_Updated 2026-06-30. Supersedes the old batch-poll handoff (that work is done + committed)._

## TL;DR
The verification corpus is **LOCKED**, the finding is **rigorously earned**, the data layer is **honest**, and **Pretext is verified build-safe**. Nothing is running in the background — safe to start fresh. **Next big step: the full Lab rebuild.** Say _"resume the Lab build."_

---

## The finding (the asset — do not overclaim)
Funnel (Polymarket × Kalshi cross-platform efficiency):
```
52,858 tradeable → 23,866 candidates → 5,431 same-event → 3,791 same-contract
→ 3,017 priceable → 558 fee-clearing → 221 semantic survivors
→ 83 liquid (>$500) → 44 strict spec-match → 4 deep (>$10k) → 0 clear executable arb
```
**Headline: "Prediction-market gaps are easy to find and hard to trade."**
Markets are efficient where liquid. Apparent arbitrage = (a) **thin liquidity** (62% of the 221 sit under $500/side, median ~$250) + (b) **contract-spec mismatch** (a strict pass killed 39/83 liquid survivors, dominant reason _"different numeric line"_, e.g. O/U 8.5 vs 9.5). All 4 deepest (>$10k) are explained by resolution nuance ("champion" vs "title holder") or timing/staleness.

**RULES:**
- **Never** say "risk-free" or "confirmed/executable arbitrage." Executability is unproven (no depth/slippage/timing). They are **"semantic survivors" / "strict survivors."**
- The portfolio "holy-shit" is the rigor: **a multi-stage verifier that caught its own matcher's false positives** and explains every exception.

---

## Done this session
- ✅ **Batch reliability layer** — committed `dcda5bb` on branch `infra/harden-batch-verification` (doctor, heartbeat, atomic manifests, crash-resilient poller, recovery). Buildable-alone verified.
- ✅ **Corpus locked** — `npm run study` (`verifierComplete:true`, single gpt-4o-mini/v3/schema1, `verdict_cache` 11,138) → `npm run retriage` → `npm run strict-survivors`.
- ✅ **Data honest** — `docs/data/efficiency-study.json` migrated: consolidated `funnel` + `claim` objects, `confirmedArb`→`semanticSurvivors` everywhere, per-pair labels `confirmed_arbitrage`→`semantic_survivor`. Zero overclaim strings. `docs/data/strict-survivors.json` = the 83-pair spec audit + the 4 deep survivors with reasons.
- ✅ **Static portfolio mode** scaffold — `VITE_STATIC=true` build reads frozen `web/public/snapshot/*` with **zero `/api`** (Playwright-proven). `vercel.json` ready.
- ✅ **Pretext verified** — `@chenglou/pretext@0.0.8` installed, **build-safe under `VITE_STATIC`**, wrapper at `web/src/lib/textLayout.ts` (`layoutText`, `naturalWidth`).
- ✅ Narrative scaffold `docs/FINAL-STORY-SKELETON.md` (placeholder-bound; separate from the user's `FINAL-STORY-WIP.md`).

---

## RESUME HERE — the Lab rebuild (green-lit, full elevation)
1. **Rewire `web/src/pages/LabPage.tsx`** to read the new `funnel` + `strict-survivors.json` (single honest source).
2. **Pretext "pretext device"** (hero): hypothesis stated → the funnel **dismantles it live** → rewritten as the finding. Use `web/src/lib/textLayout.ts` for exact glyph/line geometry (strike/annotate/rewrite). _Using `pretext` to render the pretext — intentional._
3. **Survivor evidence wall**: virtualized/masonry of the 221 (and the 4 deep) real market-question pairs from `strict-survivors.json` — "here are the gaps; here's why each isn't tradeable." Pretext `walkLineRanges`/`materializeLineRange` for virtualization.
4. **Funnel-collapse centerpiece**: **adapt** `web/src/components/lab/{CompressionWaterfall,InefficiencySurface,ComparisonMatrix}.tsx` (don't replace) — re-point at the funnel; frame as the verifier catching its own false positives.
5. **4 deep survivors visible** as evidence (questions + why each fails), not buried.
6. Restrained quant-lab motion; color lock **blue=Polymarket, green=Kalshi** (amber reserved for the snapshot/demo badge — do NOT use blue/green for that).
7. Then: `npm run check` → start live server (`npm run dev:web`) + `npm run snapshot` → `VITE_STATIC=true npm run build:web` → deploy `dist-web` to **Vercel**.

---

## Constraints / landmines
- **DO NOT re-run `npm run study`** — re-fetches a drifted universe + re-classifies via LLM → shifts the committed 221/83/44/4. The frozen artifact is what ships.
- **Generator rename deferred** (open task): `confirmedArb` still in `scripts/retriage.ts` + `scripts/efficiency-study.ts`; rename + fix the prompt's overclaiming definition only alongside a future full re-run (numbers change then anyway). `scripts/strict-survivors.ts` already accepts both labels.
- **Publish gate** (`publish-gate-checklist` memory): 6 points must pass before publishing.
- **Snapshot needs the live server running locally** (with keys) — it freezes `/lab/efficiency`, feed, market details, briefs, calibration into `web/public/snapshot/`.

## Git state
Lots **uncommitted** (the whole product layer + data migration + strict pass + pretext) on branch `infra/harden-batch-verification`. Run `git status` to see it. Recommend committing the **product layer as its own branch off `main`**, separate from the infra commit `dcda5bb`. Don't commit `.env`, `markets.db`, `.cache/`, `node_modules/`, `dist-web/`.

## Key commands
```
npm run check                 # typecheck (3 tsconfigs) + build:web + tests
npm run verify:batch:doctor   # batch source-of-truth (if ever re-running batch)
npm run snapshot              # freeze live → web/public/snapshot/ (needs live server up)
VITE_STATIC=true npm run build:web   # static portfolio bundle (zero /api)
```

## Memory pointers (load these)
`efficiency-lab-finding` (the locked finding + funnel + claim + resume), `static-portfolio-mode`, `publish-gate-checklist`, `batch-verifier-transport`, `real-goal-is-portfolio`, `lab-visual-elevation`.
