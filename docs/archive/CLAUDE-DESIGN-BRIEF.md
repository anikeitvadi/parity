# Claude Design Brief — Visual Elevation (PARKED / DRAFT)

> Status: **parked, pending data freeze.** Do NOT start cosmetic UI until the study
> artifacts are final and `npm run check` + `npm run eval:briefs:mock` are green.
> This consolidates the overnight brief; finalize wording at handoff against the
> frozen `docs/data/*` artifacts and `docs/FINAL-STORY-WIP.md`.

## North star
Tell the **story**, not the goal-artifacts. The narrative: a cross-platform
prediction-market edge **disappears** once you scope honestly — enumerate the full
standalone universe, compare only the tradeable set, normalize orientation, and
triage every apparent gap. Lead with the funnel, end with confirmed-arbitrage ≈ 0.

## Scale framing (the "wow")
- Old/naive: `2,000 × 58,158 ≈ 116M` comparisons.
- Honest: `~25,944 Polymarket (lower-bound) × 58,158 Kalshi ≈ 1.5B` comparisons.
- Make 1.5B legible — the hero should compress a billion → a handful → ~0.

## Funnel / stage vocabulary (single source of truth)
`same_contract → orientation_normalized → validated_same_contract →
apparent_fee_clearing_gap → { settlement_ambiguity, scope_mismatch,
entity_mismatch_rejected, thin_or_dead_liquidity } → confirmed_arbitrage`
- `orientation_normalized`: YES/NO inverted, agrees after flip.
- Genuine artifacts to name: US Senate vs Texas State Senate, Chargers vs Rams.

## Data contracts (Design builds against these — frozen shapes)
- `docs/data/methodology.json` — universe vs tradeable tiers, exclusion rules, samples.
- `docs/data/efficiency-study.json` — funnel counts, gapDistribution, triage.counts, sensitivity[].
- `docs/data/gap-map.csv` / `pair-audit.csv` — per-pair: polymarket_id, polymarket_question,
  polymarket_yes, kalshi_*, triage_label, category, polymarket_volume, kalshi_volume, orientation.

## DESIGN.md additions to author (Motion & Signature Visuals)
- **Z-height / Color / Motion** tokens. Tone: **quant-lab hologram** — scientific, restrained,
  NOT a fake Marvel scene. Honor `prefers-reduced-motion`.
- **3D/WebGL**: allowed via `react-three-fiber`/`drei` ONLY where it carries meaning
  (embedding space, billion→1 compression); otherwise 2D/Canvas. Flag bundle/perf cost.
- Signature pieces: hero compression visual, **funnel/waterfall**, billion-scale matrix.
- Category slices shown as analysis (Sports, Elections, Economics), liquidity floors (>0, ≥1k, ≥10k).

## Components in scope
`web/src/app.css`, `web/src/pages/LabPage.tsx`,
`web/src/components/OpportunityQueue.tsx` (scanner signal triage badges),
`web/src/components/DecisionPane.tsx`, `web/src/components/EvidenceBoard.tsx`
(enrich research pane → powerful dashboard: real-time / social / citation).

## Docs / launch (last)
- `docs/LINKEDIN.md`, README: remove the stale `2,219 / 7 / 0` framing; adopt funnel + triage vocabulary.
- Keep the "negative result as data" angle; lead with the story.

## Acceptance
`npm run check` green · `npm run eval:briefs:mock` passing · numbers match frozen artifacts.
