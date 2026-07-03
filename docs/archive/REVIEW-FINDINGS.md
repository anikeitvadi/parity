# REVIEW-FINDINGS — final disposition (2026-07-03)

Adversarially-verified audit: 41 findings (round 1) + 18 (round 2, recovered numbers lane).
Every item below is either FIXED (commit referenced) or NOTED with an owner/decision.
Raw findings with evidence follow in the two sections at the bottom of this file.

## FIXED — app (commits 3502c93, f50b289, f76a0dc, a8f1b48, 01a1119, 040bbd3, dec5fda, ca7b6a6, 19f06c4)
- Dossier: raw LLM rationale attributed + quoted ("cached model rationale"); history fetch failure shows
  empty state (was eternal skeleton); row/dossier live-price sync via onLive (row 83/72 vs dossier 83/70 bug).
- Terminal: "Best verified" chip -> "Matches"+count (was 2,626 rows, 93% unverified); strip label
  "same-contract candidates"; 176-vs-215 tooltip on Apparent-gaps chip; settled pairs demoted+badged
  (per-pair probe evidence ONLY — bulk flags proven untrustworthy); staged first-load narration;
  "prices as of HH:MM" tick; server pairs/market cache 60s->900s (12.5s cold -> 23ms warm).
- Hologram: gap beacons REPLACED by amber gap-threads at uniform 1:120 link sampling (proportion-honest);
  thread endpoints snap to real dots; bidirectional traveling orbs replace the white pulse; legend cleaned
  (no "(verified)" overclaim, no Standalone-total row, sampling caption); zoom trap off; reduced-motion;
  offscreen frameloop gating; WebGL context-loss fallback; labeled Suspense fallback; readout rebased
  ("4.0% of 5,431 same-event pairs · 0 executable after audit"); "0" bound to study.
- Lab: beats-fees dots red->orange (red stays reserved); "40 strict-verified" from corrected funnel;
  ">=1.76B"; EvidenceWall "All apparent" tab counts rendered cards; survivors wall CSS-columns bug
  (64 of 79 cards were invisible) -> scrollable grid; Experiments 2/3 to full-width bottom row;
  Experiment-1 card stretches + height-aware scatter fill.
- index.html: Parity title, meta description, OG title/desc, inline SVG favicon, fonts out of
  render-blocking @import.
- pairStatus copy: banner grammar, "doesn't clear the fee floor".

## FIXED — data + docs (commits 1653778, c6f17d5)
- pair-audit.csv: 221 rows relabeled confirmed_arbitrage -> semantic_survivor (both columns).
- scripts/retriage.ts: emits current taxonomy; no longer clobbers app-shaped study.funnel (regression trap).
- README + docs/PORTFOLIO + docs/LINKEDIN + docs/INTERVIEW-WALKTHROUGH rewritten to the 92,290 story,
  then publish-gate fact-checked; all must-fixes applied (63-not-45 of 3,791 reversed; fees are upstream
  of the 215 by construction; waterfall captioned 52,858->0; red-reserved claim scoped to consensus field;
  lower-bound hedges).
- web/public/snapshot/* regenerated; static build VERIFIED zero-/api (Lab + 2,626-pair Terminal).

## NOTED — ship checklist (user actions)
1. PUSH + PR + merge (nothing is public yet; ~16 commits on feat/consensus-field-3d).
2. Deploy (vercel.json builds static from committed snapshot) + one live click-through.
3. If repo goes public: archive root AI artifacts (SESSION-HANDOFF.md, REVIEW-FINDINGS.md,
   SCANNER-REFRAME-HANDOFF.md) + decide .planning/ (68 committed files); add LICENSE file (package.json
   says ISC; README says ISC; no LICENSE file exists); optionally rename package.json name/description.

## NOTED — open, deliberately not done (with rationale)
- Funnel-ledger card is shorter than the waterfall next to it (same stretch treatment as Experiment 1
  would fix; was in flight when interrupted). Cosmetic.
- Bulk live-map matches ~0/400 (route uses first-page-capped getActiveMarkets vs study's paginating
  getAllActiveMarkets). ROOT-CAUSED + specced in SESSION-HANDOFF; harmless now (nothing user-visible
  trusts bulk flags); proper fix = probe the ~400 corpus ids on cache build.
- 12.5s cold load: mitigated (900s cache + staged narration); first visitor after idle still waits.
- Terminal is desktop-only (560px fixed dossier, no responsive pass). Post-ship.
- No deep links / hash router (/pair/:id) — selection lost on refresh. Post-ship nicety.
- P3 copy nits never applied: Overlaps-by-category counts lack thousands separators (LabPage ~:441);
  dossier 7-point CHECKS chips have no tooltips + "match 76%" unexplained (PairDossier ~:130);
  LabPage hedging bullet ~:420 could name 3,017/2.5pp/9pp explicitly.
- OG image (og:image) absent — link previews show text only.
- Google Fonts still loaded from CDN (moved to parallel <link>; @fontsource self-host possible;
  npm cache is broken — use --cache /tmp/fresh-cache).
- README has no screenshots; a hero capture would sell it (shots exist in session scratchpad).
- Hologram taste knobs if wanted: orb size (Orbs size prop), crossing speed (7+rnd*5 in buildArcGeo).

## Full findings (severity-sorted, with suggested fixes)

- **P0** [docs] `README.md:5` — README and LinkedIn docs still tell the superseded 2,219→7→0 story that contradicts the app's canonical 92,290→3,791→0 funnel
  - fix: Rewrite README headline numbers and thresholds to the canonical displayed funnel (92,290 -> 23,866 -> 5,431 -> 3,791 -> 215 -> 40 -> 4 -> 0, cosine >= 0.68, 9pp fee floor, 11,138 cached verdicts) and update or quarantine docs/LINKEDIN.md. Exact narrative wording is the user's call, but the stale numbers cannot ship.
- **P1** [thesis] `web/src/components/PairDossier.tsx:383` — Raw cached LLM rationale ('...and exploitable mispricing.') is rendered verbatim in the app's own voice, directly contradicting the 'WHY THIS ISN'T FREE MONEY' banner above it
  - fix: Display-layer fix (no regen): attribute and quote the rationale — e.g. prefix with a muted 'cached model rationale ·' label and wrap the text in quotation marks/italics, so the LLM's words are visibly evidence, not the app's verdict. Keep the existing 'Strict-spec verified...' status line as the app's voice. Regenerating rationale text is the user's call; attribution is not.
- **P1** [thesis] `web/src/pages/TerminalPage.tsx:111` — 'Best verified' chip actually shows 2,626 rows of which ~2,450 (93%) are unverified candidates — the label claims verification the Lab explicitly disclaims
  - fix: Rename the chip to match its contents — e.g. 'Curated' or 'Gaps + candidates' (or make it filter to survivor+strict only, which changes the default view — user's call which). Also avoid the double use of 'Best' (chip 'Best verified' vs sort 'Best').
- **P1** [thesis] `web/src/pages/TerminalPage.tsx:253` — Terminal header strip states '3,791 CROSS-LISTED CONTRACTS' as fact — the Lab calls the same number a cached candidate label that over-matches
  - fix: Change the strip label to 'same-contract candidates' (or 'cross-listed candidates'). Number unchanged; only the epistemic status is corrected to match the Lab.
- **P1** [thesis] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:92` — Triage badge loops forever ('verifying…' ~87% of the time) and the 215 gaps visually resurrect after every '0 confirmed' collapse — the payoff state never settles
  - fix: Settle-and-freeze: replace the modulo with a one-shot clamp, e.g. `const c = Math.min(t / 12, 1)` with windows reordered to start scanning (fade-in 0–0.12, hold to 0.8, collapse 0.8–0.95, settled >=0.95) and `const want = c >= 0.95 ? 'resolved' : 'scanning'`. User must pick the frozen end-state: gaps fully dark vs. held at a dim ember (~vis 0.15) so the 'Apparent gaps (to scale) 215' legend row still has visible referents. Also fix the stale comment.
- **P1** [numbers] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:224` — Legend row 'Same-contract pairs (verified)' overclaims — the stat card directly below labels the same 3,791 'Candidate same-contract (cached) … few strict-verified'
  - fix: Change the label at line 224 to 'Same-contract pairs (cached AI)' or 'Candidate same-contract pairs' — copy-only change, number and color untouched, aligns hero with stat card and funnel semantics.
- **P1** [ux] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:186` — Scroll trap: enableZoom on the 62vh full-bleed hero captures wheel/trackpad, stalling page scroll whenever the cursor is over the canvas; touch is also hijacked
  - fix: Smallest fix: `enableZoom={false}` and change the line-238 hint to 'drag to orbit'. Alternative (keeps zoom for demos): activate zoom only after a pointerdown on the canvas ('click to interact' pattern). For touch, `touches={{ ONE: THREE.TOUCH.NONE, TWO: THREE.TOUCH.ROTATE }}` restores one-finger page scroll. Interaction-design choice — user should pick.
- **P1** [ux] `screenshot` — 'Best verified' flagship list has no integrity: 2,626 rows shown with the chip active, and #2 is a settled tennis match (both venues closed, 55/45) presented with a 9.9pp gap and $179k liquidity.
  - fix: Highest-leverage fix in the whole app: make 'Best verified' an actual filter whose count equals 'shown', exclude settled/closed pairs from it (they already have the Near-settled bucket), and badge any settled row inline ('settled'). A hiring manager who knows markets will spot 55/45 on a finished match in five seconds, and it reads as the tool recommending fake arbitrage — the exact thing the thesis says doesn't exist.
- **P1** [numbers] `screenshot` — Selected queue row and its open dossier disagree on prices and gap simultaneously: row says 83/72 · 10.5, dossier says 83% vs 70% · 12.5pp.
  - fix: When the dossier fetches live prices, write them back to the selected row (or badge the row 'cached 9:50 AM' and the dossier 'live'). Two different gaps for the same pair side-by-side is the kind of inconsistency an interviewer screenshots.
- **P1** [thesis] `screenshot` — Hero legend claims 'Same-contract pairs (verified) 3,791' while the stat card in the same viewport says '3,791 Candidate same-contract (cached) · few strict-verified' — opposite epistemic status for the same number.
  - fix: Change the legend label to match the shipping stat-card framing ('Same-contract flags (cached)'). The whole methodology story depends on 3,791 being a candidate count, not a verified one; the hero legend currently overstates your own claim.
- **P1** [ux] `screenshot` — Dead half-viewport blank band inside the survivors card between the pair grid and 'The deep four'.
  - fix: Let the tabbed grid container collapse to content height per tab (or reserve height only during tab transitions). On a story page this reads as a rendering bug, not breathing room.
- **P1** [ux] `web/index.html:7` — The browser/share surface is unbranded: tab title is still 'Prediction Market Scanner' (app is branded 'Parity'), there is no favicon at all, and index.html has zero meta description / OG / Twitter tags, so a link sent to a hiring manager unfurls as a blank card and 404s /favicon.ico.
  - fix: In web/index.html set title to 'Parity — do cross-platform prediction-market gaps survive verification?', add <meta name="description">, og:title/og:description/og:type (og:image can come later with a real screenshot), and an inline SVG or .ico favicon in web/public/.
- **P1** [code] `web/public/snapshot/efficiency-study.json:1` — The public-deploy path ships an empty app: every file in web/public/snapshot/ is a placeholder stub, so a VITE_STATIC build today publishes a portfolio with no study, no feed, no numbers.
  - fix: Before any publish, run `npm run snapshot` against the live server and commit the populated snapshot; add 'snapshot populated (markets > 0, available: true)' as an explicit line on the publish-gate checklist so the frozen deploy can't ship blank.
- **P1** [ux] `web/src/pages/TerminalPage.tsx:209` — The app has no responsive layout at all: the Terminal queue pane is a hard `w-[560px] shrink-0` with a single breakpoint class in the whole page and zero in PairDossier, so on a phone or a half-width laptop window (< ~900px) the dossier pane is crushed to nothing — the most likely first-touch device for a LinkedIn link gets a broken app.
  - fix: Minimum viable pass, no redesign: below ~lg, stack the Terminal panes (queue full-width, dossier opens as an overlay/slide-over) and let the 560px become w-full lg:w-[560px]; audit LabPage tables for overflow-x-auto wrappers. Alternatively, if mobile is explicitly out of scope, add a small 'best viewed ≥1024px' notice instead of silent breakage.
- **P2** [thesis] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:224` — Hologram legend says 'Same-contract pairs (verified) 3,791' while the stat card directly below says 'Candidate same-contract (cached)'
  - fix: Change the legend row to 'Same-contract pairs (cached)' — one word, aligns with the stat card and the Terminal fix above.
- **P2** [docs] `web/src/lib/pairStatus.ts:197` — Flagship banner grammar: 'the last mile no dataset settles' is a garden-path phrase whose 'settles' collides with market settlement — and the same sentence appears twice on one dossier screen
  - fix: Rewrite :197 to e.g. 'Passes every automated gate. What remains unproven is the last mile no dataset can test: order-book depth, slippage, and settlement timing.' and differentiate the actionability line (:150) so the two banners don't read as a copy-paste — e.g. make actionability state the conclusion ('Closest thing to real in the corpus — still not a demonstrated trade.') and let cause-of-death carry the mechanism.
- **P2** [ux] `web/src/components/PairDossier.tsx:230` — Price-history fetch failure leaves a permanent empty skeleton box with no message (observed on the #1-ranked Hormuz pair)
  - fix: On catch, set a sentinel (e.g. {polymarket:[],kalshi:[],failed:true}) and render 'Price history unavailable for this pair.' — reuse the existing empty-state styling. Also consider minimal date ticks: the Quito chart shows two disconnected lines with only 100%/14% labels and no time axis, so 'disconnected' reads as a bug rather than non-overlapping listing windows.
- **P2** [thesis] `web/src/pages/LabPage.tsx:420` — 'Where the contracts genuinely match, prices agree — median gap 2.5pp' claims a genuinely-matched population one bullet after saying the same label over-matches
  - fix: Re-scope the claim to its actual population: 'Across the 3,017 priceable same-contract candidates, prices already agree — median gap 2.5pp, below the 9pp fee floor (over-matched look-alikes would only inflate this).'
- **P2** [numbers] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:218` — Hologram sub-line computes '0.23% of 92,290' by dividing pairs by markets — the exact cross-unit ratio the funnel ledger's own comment refuses to print
  - fix: Either drop the percentage or rebase it on a pair denominator (5,431 same-event → '4.0% of same-event pairs'); do not silently keep a ratio the methodology page disavows.
- **P2** [ux] `web/src/pages/LabPage.tsx:133` — Experiment-1 charts use red (#EF4444) for 'gap beats fees' dots, diluting the locked claim that red is reserved for confirmed arbitrage and never drawn
  - fix: Recolor beats-fees dots to the apparent-gap orange (#FF8A1E / #F59E0B family) and keep the 19pp rule red. This ENFORCES the locked semantics rather than changing them, but since it touches the locked palette's application, leaving the call to the user.
- **P2** [perf] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:207` — Canvas renders at 60fps forever — no frameloop gating when the hero is scrolled out of view on a long page
  - fix: IntersectionObserver on the wrapper div toggling `frameloop={visible ? 'always' : 'never'}` (Canvas accepts frameloop as a reactive prop). ~10 lines, no visual change.
- **P2** [ux] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:186` — prefers-reduced-motion is ignored by the hologram while every sibling Lab component respects it
  - fix: Read `window.matchMedia('(prefers-reduced-motion: reduce)')` once in ConsensusField3D; when true: autoRotate={false}, twinkle={0}, render gaps in the settled state and the badge as static 'post-traige · 0 confirmed' (the readout already carries the full thesis without motion).
- **P2** [ux] `screenshot` — Experiment-1 scatters spend red on hundreds of 'gap beats fees' dots, breaking the page's own reserved-red argument (red = confirmed arb, deliberately never drawn).
  - fix: Recolor 'gap beats fees' dots to orange — these are precisely the apparent-gap population per the locked palette (orange = apparent gaps), which keeps red truly absent page-wide and enforces the existing color invariant rather than changing it.
- **P2** [suggestion] `screenshot` — Terminal lacks the tool-feel signals it's aiming for: 12s cold load with a bare skeleton and tiny 'loading…', no per-row sparkline or last-updated tick, no visible hover/keyboard affordance, and the dossier cuts off at 'Generate research brief' with no scroll cue.
  - fix: Two cheap wins: (1) turn the 12s load into a staged narrative ('fetching 5,431 cached pairs… matching live books… pricing 2,626') — dead time becomes the pitch; (2) add a per-row micro-sparkline from the same snapshot data the dossier chart uses plus an 'as of 7:22 PM' tick in the queue header. Those two changes are most of the distance between 'demo' and 'terminal'.
- **P2** [docs] `HANDOFF.md:12` — Six internal AI-session handoff documents are tracked in git at the repo root, and at least HANDOFF.md still asserts the superseded '2,219 markets → 7 high-confidence' finding — an interviewer who clones the repo reads stale internal narrative that contradicts the app before ever reaching src/.
  - fix: User decision: either delete the session-handoff files from the repo (git rm, they live in local memory anyway), or move the few with lasting value into docs/ after updating their numbers to the canonical funnel. The repo root an interviewer lands in should contain README, CLAUDE.md, config, and code — not five generations of AI pair-session state.
- **P2** [docs] `README.md:1` — README contains zero screenshots or images — the GitHub landing page for a visual-first portfolio piece (3D hologram, Bloomberg-grade terminal) is text-only, so the strongest asset is invisible at the exact surface interviewers see first.
  - fix: When the README is rewritten for the canonical funnel (already a P0 finding), add 2-3 curated screenshots (Lab hero hologram, Terminal dossier) under docs/screenshots/ and reference the best one as the OG image. Capture them after the P1 hologram/verified-label fixes land so the screenshots don't immortalize the defects.
- **P3** [docs] `web/src/pages/LabPage.tsx:422` — Bullet 4's em-dash makes '40 strict and 4 deep survivors' read as an apposition of '0 clear executable arbitrages'
  - fix: Reorder: '...leave 40 strict and 4 deep survivors — and 0 clear executable arbitrages; the rest are thin, spec mismatches, or settlement traps.'
- **P3** [ux] `web/src/components/PairDossier.tsx:130` — 7-point checklist chips 'Line', 'Dir', 'Struct' have tooltips that merely repeat the cryptic label; 'match 69%' is likewise unexplained
  - fix: Give CHECKS a `desc` per check (e.g. Line: 'same numeric threshold/line', Dir: 'same YES direction', Struct: 'same contract structure') and use it in the title attr; add title="cosine similarity of the two questions" to the 'match NN%' span.
- **P3** [ux] `web/src/pages/LabPage.tsx:356` — 'pp' (percentage points) is never expanded on first use anywhere in the app
  - fix: Expand once per surface: hero intro '...every fee-clearing gap (measured in percentage points, pp)...' and a title="percentage points" on the dossier gap value. Also consider spelling out 'entity/scope' on the stat card ('entity/scope triage — e.g. county vs statewide').
- **P3** [numbers] `web/src/pages/LabPage.tsx:355` — Stat card hedge 'few strict-verified' is vague where the app knows and displays the exact number (40)
  - fix: Use the derived count: `of 5,431 same-event · ${correctedFunnel.strictSpecSurvivors} strict-verified` (already available in scope).
- **P3** [docs] `web/src/lib/pairStatus.ts:189` — 'It never clears the fee floor' asserts a permanent fact from a single price snapshot
  - fix: Change to 'It doesn't clear the fee floor.'
- **P3** [ux] `web/src/pages/LabPage.tsx:441` — Overlaps-by-category table prints unformatted counts ('1574') while every other number in the app is locale-formatted
  - fix: Use c.pairs.toLocaleString().
- **P3** [code] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:218` — Hologram hard-codes '0 survive verification' and 'post-triage · 0 confirmed' instead of deriving from the study artifact
  - fix: Render {num(f?.clearExecutableArb ?? 0)} in both strings (keeps today's display identical).
- **P3** [code] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:37` — gl_PointSize has no pixel-ratio compensation — the galaxy renders ~2x chunkier/brighter on dpr-1 displays (external monitors, projectors) than the designed retina look
  - fix: Multiply the size uniform by the actual pixel ratio: in PointCloud, set `uniforms.uSize.value = size * state.gl.getPixelRatio()` in useFrame (or once via onCreated), so CSS-pixel size is invariant across displays. Same for the line shader if it sizes in px.
- **P3** [code] `web/src/pages/LabPage.tsx:346` — No error boundary and no WebGL context-loss handling — a failed lazy chunk or lost GL context blanks the entire Lab page, not just the hero
  - fix: Wrap the Suspense at LabPage.tsx:346 in a ~15-line ErrorBoundary whose fallback renders the readout numbers (universe, 3,791, 215, 0) as static HTML on the same #04060e band — the thesis stays legible even when GL doesn't. Optionally add a webglcontextlost listener via Canvas onCreated to show the same fallback.
- **P3** [numbers] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:218` — Hardcoded '0' literals in the readout ('0 survive verification') and badge ('post-triage · 0 confirmed') while the legend row is properly bound
  - fix: Interpolate `{f?.clearExecutableArb ?? 0}` in both strings (lines 218 and 233).
- **P3** [ux] `web/src/pages/LabPage.tsx:346` — Suspense fallback is a bare black 62vh band — no label or numbers for the ~1-2s three.js chunk load
  - fix: Add the static kicker + headline to the fallback div ('CONSENSUS FIELD' / '1 point = 1 market — the 92,290-market universe, to scale.' — LabPage already has `s` in scope, so the numbers can be real), giving instant content continuity while the canvas hydrates.
- **P3** [thesis] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:181` — 1,400 decorative background Stars points under a '1 point = 1 market' headline — a pedantic honesty nick
  - fix: Either drop the Stars layer, or defuse it in copy: append 'background starfield decorative' to the bottom-right hint (line 238). User's call — it changes the hero's look.
- **P3** [ux] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:231` — Overlay collisions at narrow widths and a badge that intercepts orbit drags
  - fix: Add `pointer-events-none` to the badge container and hide it (or stack it under the readout) below the sm: breakpoint.
- **P3** [suggestion] `screenshot` — hero verdict
  - fix: Verdict: judged from the screenshots, this hero is visually interview-ready and is plausibly the strongest single asset in the portfolio. The two morphologies (blue ring galaxy vs green 4-arm spiral) are instantly distinguishable, the 2.43x Kalshi size asymmetry reads at a glance and is genuinely derived (radius = cbrt of count ratio, useFieldModel.ts:96), the locked palette is respected end-to-end (cyan threads, orange gap embers, red existing ONLY as a 0-count legend row — its absence in the field is the argument), and every headline number in the readout is real and matches the stat cards below. Composition, bloom level, and point density hit 'Bloomberg-meets-planetarium' without kitsch, and the code-split + same-height fallback means no layout shift. What keeps it from done is behavior, not looks: the badge is stuck in 'verifying…' ~87% of the time and directly contradicts the adjacent static '0 survive verification' line (an interviewer will almost certainly never see the payoff state, and the gaps resurrect every 12s); the '(verified)' legend label undercuts the honesty framing against the stat card two inches below it; and the wheel-zoom trap on a 62vh hero will bite anyone who scrolls the page with their cursor over the canvas. Fix those three P1s (one is a copy change, one is a ~5-line clamp, one is a prop flip) and this hero carries the thesis on sight.
- **P3** [docs] `package.json:43` — The GitHub 'storefront' metadata still tells the pre-pivot story: repo description is the old scanner/calibration-coach pitch with no mention of Parity or the efficiency-study thesis, homepage URL is empty, the repo is still private, and package.json ships scaffold defaults (author: "", license: "ISC") with no LICENSE file in the repo.
  - fix: Before flipping public: update the GitHub description to the thesis (e.g. 'Parity — 92,290 prediction markets, 0 executable arbitrages: an efficiency study of Polymarket × Kalshi'), set the homepage to the deployed URL, add a LICENSE file (MIT is conventional for portfolio repos) and matching package.json license/author. Renaming the repo to match the Parity brand is optional and the user's call.

## Round 2 — recovered numbers lane (2026-07-02, later)

- **P0** [docs] `README.md:5` — README and interview docs still tell the superseded '2,219 markets -> 7 matches -> 0' story with 0.85 cosine and ~19pp thresholds
  - fix: Rewrite README.md and docs/INTERVIEW-WALKTHROUGH.md/PORTFOLIO.md to the canonical funnel (92,290 -> 52,858 -> 23,866 @0.68 -> 5,431 -> 3,791 -> 215 -> 79 -> 40 -> 4 -> 0, 11,138 verification calls, 128 corrections). Wording is user-owned; must land before publish.
- **P1** [thesis] `docs/data/pair-audit.csv` — Shipped audit CSV labels the 221 semantic survivors 'confirmed_arbitrage' while every rendered surface says 0 confirmed arbitrage
  - fix: In scripts/retriage.ts's CSV export, map the terminal label to 'semantic_survivor' (matching efficiency-study.json's triage_label) before writing, then regenerate pair-audit.csv; optionally add a corrected_verdict column from corrections.json. Regeneration is user-owned.
- **P1** [numbers] `web/src/pages/TerminalPage.tsx:112` — Lab says 'Apparent gaps 215' while Terminal chip says 'Apparent gaps 176' — same words, two different correction conventions
  - fix: Honest reconciliation is labeling, not renumbering (forcing 176 into the funnel would erase the strict-stage cull beat: 215->79->40 collapses). Keep Lab at 215; qualify the Terminal chip, e.g. label 'Apparent gaps' with tooltip/sub 'after strict re-check corrections: 221 in study − 45 corrected = 176; the Lab's 215 counts the 39 strict-recheck failures at the strict gate instead'. Which side gets the qualifier is a design decision.
- **P1** [numbers] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:224` — Hologram legend claims 'Same-contract pairs (verified) 3,791' — the same number the page itself relabels 'Candidate same-contract (cached)'
  - fix: Change the legend label at ConsensusField3D.tsx:224 to 'Same-contract candidates (cached)' (number unchanged).
- **P1** [ux] `web/src/pages/TerminalPage.tsx:111` — 'Best verified' chip actually shows 2,626 rows, 93% of which the app itself labels unverified Candidates
  - fix: Either rename the chip to reflect content ('Gaps + candidates') and give it its count (2,626), or narrow 'curated' to survivor + strictSurvivor rows so 'Best verified' means verified. Which semantics to keep is a product decision.
- **P1** [ux] `web/index.html:7` — Browser tab, favicon, and link-unfurl are all missing or wrong: title says 'Prediction Market Scanner' while the app brands itself 'Parity', and there is no favicon, meta description, or OG/Twitter tags
  - fix: In web/index.html set <title>Parity — Market Efficiency Lab</title>, add <meta name="description">, og:title/og:description/og:type (og:image can come later with the README screenshot), and an inline SVG favicon (e.g. data-URI dot in the locked #5AA2FF blue) so no binary asset is needed.
- **P1** [docs] `HANDOFF.md:1` — Five internal AI-session handoff docs plus CONTEXT.md/RESEARCH.md and 68 .planning/ files are committed to the repo, and they carry the stale pre-correction numbers that contradict the shipped story
  - fix: Decide deliberately: either delete/gitignore the handoff docs and .planning/ from the shipped repo (git rm --cached), or move them into a clearly-labeled docs/process/ dir with a one-line disclaimer that numbers inside are historical. User decision — do not autofix.
- **P2** [numbers] `web/src/pages/LabPage.tsx:303` — EvidenceWall 'All apparent' tab count says 215 but the wall renders only 176 cards
  - fix: At LabPage.tsx:303 filter apparentPairs with only the semantic-false-positive keys (the same 6-key subset used to compute semanticFalsePositives at :298-300), not the full correctionKeys set, so the wall renders 215 cards matching its own tab count. Published number (215) is unchanged; the 39 strict-failures also legitimately appear in the wall's 'mismatch' view (39) which stays correct.
- **P2** [code] `web/public/snapshot/efficiency-study.json` — Static-deploy snapshot artifacts are byte-stubs, so the published VITE_STATIC build would render a numbers-free app
  - fix: Run `npm run snapshot` against the locked corpus and extend the snapshot script to also freeze the pairs response (survivor/candidate/stale counts included) — per the existing static-portfolio plan; regeneration timing is user-owned.
- **P2** [numbers] `web/src/components/lab/consensus3d/ConsensusField3D.tsx:218` — Hologram readout says '0 survive verification' while the Evidence Wall counts 40 strict-verified survivors and 4 deep
  - fix: Change the readout tail to '0 executable arb' (matches the legend row 'Confirmed executable arb 0' two lines below and the locked claim).
- **P2** [numbers] `web/src/pages/TerminalPage.tsx:253` — VerdictStrip labels the cached candidate set '3,791 cross-listed contracts', over-claiming the same-contract call
  - fix: Relabel to 'same-contract candidates' (or 'cross-listed candidates') in the strip; number unchanged. Headline-strip wording is design-owned.
- **P2** [numbers] `docs/data/gap-map.csv` — gap-map.csv ships a completely empty triage column and neither exported CSV reflects the correction overlay
  - fix: Populate gap-map.csv's triage column at export time and add the corrected_verdict/correction_source columns (or a companion corrections column) to both CSVs when regenerating; regeneration is user-owned.
- **P2** [docs] `README.md:1` — README of a visually-led portfolio app contains zero screenshots or GIFs — the GitHub landing page (the interviewer's first touchpoint) is text-only
  - fix: Add 2–3 final screenshots (Lab hero hologram, Terminal dossier) to a docs/media/ folder and embed them near the top of README.md once the number-consistency fixes land, so captured numbers match shipped numbers. Needs user-captured final images — not autofixable.
- **P2** [perf] `web/src/app.css:1` — The entire visual identity depends on a render-blocking runtime Google Fonts fetch: app.css line 1 is an external @import, so first paint of the dark shell chains on fonts.googleapis.com and the terminal aesthetic silently degrades on locked-down corporate networks
  - fix: Move the fonts to a <link rel="stylesheet"> in web/index.html after the existing preconnects (non-blocking with display=swap), or better, self-host the two woff2 families under web/public/fonts with @font-face so the static deploy is fully self-contained.
- **P2** [ux] `web/src/pages/TerminalPage.tsx:209` — No small-window/mobile story at all: 8 responsive breakpoint classes exist in the whole of web/src, the Terminal hard-codes a 560px left pane, and there is no matchMedia fallback or 'best on desktop' notice
  - fix: Cheapest honest fix: a small-viewport gate (CSS media query or matchMedia) that shows a styled 'Parity is a desktop terminal — best viewed at ≥1024px' card with a Lab-summary teaser, rather than attempting a responsive rewrite of the two-pane terminal.
- **P3** [numbers] `web/src/pages/LabPage.tsx:329` — '1.76B possible cross-listings' drops the lower-bound qualifier that its own factor carries
  - fix: Prefix '≥' when polymarketIsLowerBound (scale strip and waterfall header): '≥1.76B possible cross-listings'.
- **P3** [docs] `web/src/pages/LabPage.tsx:273` — Source comments still carry the raw pre-correction numbers (221/44/138/−337) that the rendered page no longer shows
  - fix: Update the four comments to the corrected displayed values (215/40/136/−343) or phrase them value-free ('the strict-cull story').
- **P3** [docs] `README.md:141` — Repo identity is stale and the declared license has no license file: package/repo name 'prediction-market-scanner' predates the Parity identity, and README/package.json say ISC but no LICENSE file exists
  - fix: Add a standard LICENSE file matching the declared license (or switch both declarations to MIT, the conventional portfolio choice), and consider renaming the GitHub repo (GitHub auto-redirects old URLs) plus updating package.json name/description to the Parity identity. Naming/licensing are user decisions — not autofixable.
