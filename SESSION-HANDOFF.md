# Session Handoff — 3D Consensus Field (2026-07-02)

## TL;DR
The Lab's signature visual was rebuilt from a flat Canvas2D point-field into a **true 3D WebGL scene**
(react-three-fiber + bloom). It renders the market universe **to scale as two galaxies** — Polymarket
a **ring galaxy**, Kalshi a **4-arm spiral** — connected by the verified same-contract links. The chosen
connection style is **Arcs**. Everything is **green** (`npm run check` passes) but **NOTHING IS COMMITTED YET**
— committing is the #1 next step.

## The decision trail (why it looks like it does)
- Two blind Canvas2D iterations were rejected as "rudimentary" and for **misrepresenting proportion**
  (a fake 820-point 50/50 split; gap-flares that visually rivaled a 65k universe). Root lesson saved in
  memory `viz-proportion-honesty`: **research the delivery first; never ship a proportion-dishonest viz.**
- A research workflow produced the honest reframe (Tufte lie-factor≈1, ISOTYPE, edge-bundling, atmospheric
  depth, FUI motion economy). Canvas2D was then rejected as a medium ("rudimentary" is inherent to flat
  additive dots) → pivoted to **react-three-fiber** for volumetric particles + GPU bloom.
- User chose **Nebula** look (dropped Hologram/Network directions) and, for the connections, **Arcs**
  (after comparing Waist / Arcs / Pulses / Stream live via a switcher).

## What's REAL vs DECORATIVE (the honesty line — this is the whole thesis)
**Real (bound to `study`):**
- 1 point = 1 market. Poly galaxy = `universe.polymarket` (26,930); Kalshi = `universe.kalshi` (65,360).
- Kalshi radius = Poly × ∛(count ratio) → volume is exactly 2.43× (uniform density).
- 215 orange gap beacons = `apparentCount` = real 0.23% of 92,290. `0` confirmed → **red never drawn** (its absence is the argument).
- Every readout number read straight from `study` (poly ≥26,930 / kalshi 65,360 / total 92,290 / same-contract 3,791 / gaps 215 / confirmed 0).

**Decorative (arrangement, not a data claim):**
- Point *positions* (ring/spiral shape) — not tied to per-market attributes.
- Gap speck locations (scattered ~29/71 by universe share, not the true per-platform split).
- The bridge draws a **sample of 150 threads** (endpoints procedural); the real **3,791** is in the readout.
- Rationale: it's honest the way an ISOTYPE/unit chart is — magnitudes/proportions exact, layout aesthetic.

## Files
- `web/src/components/lab/consensus3d/useFieldModel.ts` — honest data model. Builds galaxy point arrays
  (ring for Poly via `RING_RADIUS/RING_WIDTH`; spiral for Kalshi via `KALSHI_BRANCHES/KALSHI_SPIN`), 215
  gap positions, and 150 bridge endpoint pairs (`bridgeA`/`bridgeB`/`bridgePhase`). Counts come from `study`.
- `web/src/components/lab/consensus3d/ConsensusField3D.tsx` — the scene. Custom GLSL for soft round point
  sprites (galaxies + gaps), flowing lines (Arcs/Waist), and flowing points (Pulses/Stream). Bloom via
  `@react-three/postprocessing`. Orbit camera. HTML overlay = honest readout + connection switcher + triage badge.
- `web/src/pages/LabPage.tsx` — swapped `<ConsensusField>` → `<ConsensusField3D study={s} apparentCount={correctedSemantic} />` (line ~343).
- `web/src/components/lab/ConsensusField.tsx` — the OLD Canvas2D version. **Deleted** (recoverable from git history).
- Deps added: `three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7 @react-three/postprocessing@3.0.4 @types/three@0.185.0`.

## Current visual params (dials)
- Galaxies: `POLY_R=1.85`, `KALSHI_R=POLY_R*∛2.43`, centers `POLY_CENTER=[-3.9,0,0]` / `KALSHI_CENTER=[4.5,0,0]`, point `size 0.08`, `twinkle 0.4`.
- Connection = **Arcs**: `buildLineGeo(model, 30, 'splay')`, opacity 0.22, blue→teal→green gradient with a flow pulse (`LINE_VERT` `uTime*0.11`).
- Gaps: `uSize 0.36`, `uTwinkle 0.75`, orange `#FF8A1E`; 12s triage breath fades them to 0 (badge flips to "post-triage · 0 confirmed").
- Camera `[0.5,3.6,7.0]` fov 52, orbit `minDistance 6 / maxDistance 13`, bloom `intensity 1.3 / threshold 0.2`.
- Frame height `62vh`. Colors LOCKED: blue=Poly `#5AA2FF`, green=Kalshi `#22C55E`, cyan=consensus `#22D3EE`, orange=gaps, red=confirmed(reserved).

## How to run / verify
- `npm run dev:web` (5173) — **the dev server was killed; restart it.** New deps mean if it errors on
  `@react-three/fiber`, a full restart (not just refresh) is required so Vite pre-bundles them.
- `npm run check` — typecheck (3 tsconfigs) + build + tests. **Currently GREEN.**

## Status / next steps
- ✅ **Committed** — branch `feat/consensus-field-3d`, commit `1609968` (deps + `consensus3d/` + LabPage swap).
- ✅ **Pruned** — Arcs-only; the Waist/Pulses/Stream builders + switcher removed; dead Canvas2D
  `ConsensusField.tsx` deleted. (All still recoverable from git history.)
- ✅ **Code-split** — canvas is `lazy()` + `<Suspense>`; three.js is its own chunk
  (`ConsensusField3D-*.js`, ~266 KB gz) so the Lab shell + readout paint first.
- ⬜ **Push + PR** — `git push -u origin feat/consensus-field-3d`, open PR against `main`.
- ⬜ **Static snapshot** — re-run `npm run snapshot` if the frozen public bundle needs the new visual (memory `static-portfolio-mode`).

## Gotchas
- **npm cache is broken**: `~/.npm/_cacache` has a root-owned locked file → `npm install` fails with EACCES.
  Workaround used: `npm install <pkgs> --cache <tmpdir>` (a fresh cache dir). Fix properly with
  `sudo chown -R $(whoami) ~/.npm` when convenient.
- Don't manage the user's 5173 server processes (they drive it).
- R3F v9 requires React 19 (project is on 19.2) — versions above are the compatible set; don't bump blindly.
- Bundle-size warning on build is just advisory (chunk > 500 KB), not an error.

## Related memory
`consensus-field-honest` (the design + this pivot), `viz-proportion-honesty` (research-first rule),
`lab-visual-elevation` (color lock), `endgame-punch-list` (the broader finish plan), `static-portfolio-mode`.
