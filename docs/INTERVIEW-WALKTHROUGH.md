# Interview Walkthrough — Explain It Cold

Study doc. The rule: a project you can explain beats a flashier one you can't. Every piece
below should be narratable without notes. Practice out loud until each answer is ~30–60s.

---

## The 30-second pitch (lead with this)

> "Parity is a market-efficiency study that ships as a product. I set out to find
> arbitrage between Polymarket and Kalshi — same event, different price, trade the gap.
> I scanned 92,290 standalone markets across both platforms (the Polymarket count is a floor), verified every candidate
> pair with a cached LLM pipeline, and found 215 apparent price gaps — some huge. After
> fees, liquidity, contract-spec checks, and manual review: zero executable. Proving
> that zero rigorously — including auditing my own verifier's false positives with a
> 128-correction overlay that never rewrites the raw data — became the product. It's
> two surfaces: a Lab that walks you through the full audit, and a live pair terminal
> built on the same verifier."

Then pick the lens for the room:
- **Data / ML roles** → "recall-first embeddings at cosine 0.68, precision from 11,138
  cached LLM verdicts on a pinned model+prompt — most accumulated via a Batch API transport with a crash-resilient poller."
- **Full-stack roles** → "three independently-typechecked TypeScript projects, 435 tests,
  and a static zero-backend deploy that ships the whole corpus as frozen artifacts."
- **PM / product roles** → "the data killed my premise twice; I made the negative result
  and the machinery that proves it the product."

---

## The 5-minute walkthrough (drive the app in this order)

**1. Lab hero — the consensus field (~60s).** "Every point is one market — all 92,290,
to scale; the green Kalshi galaxy really is 2.4× the blue Polymarket one. The orange
embers are the 215 apparent gaps. Watch them triage: the badge settles on 'post-triage ·
0 confirmed.' In the consensus field, red is reserved for confirmed executable arbitrage —
and it is never drawn. That absence is the argument."

**2. Waterfall + funnel ledger (~60s).** "This is the whole study in one chart — the
log-scale collapse from 92,290 to 0, and under it the exact-figures ledger: every stage
names its gate and its cull. 23,866 candidates at cosine ≥ 0.68, 5,431 same-event,
3,791 same-contract flags, 558 clear the 9pp fee floor, 215 survive entity/scope triage,
then 79 liquid, 40 strict spec-matched, 4 deep, 0 executable. No stage is hand-waved."

**3. Survivors wall (~60s).** "Here's every apparent gap as evidence, not aggregate:
per-pair 7-point contract-spec checklists (the word-diffed contract titles come next, in the deep four and the dossier), so you can
see exactly which check failed. This is where 'looks like the same contract' goes to die."

**4. The deep four (~45s).** "The four residuals with real money behind them — e.g. a
Strait of Hormuz pair with $725k on the thinner side, and two UFC pairs where the diff
is literally 'Champion' vs 'Title Holder' on the same date. Each dies on resolution
nuance or timing under manual review. The honest caveat lives here too: executability
was never tested at the order-book level — the claim is 'nothing survives the checks a
trade would have to pass first,' not 'no arb can exist.'"

**5. Terminal dossier (~75s).** "Same verifier, live tool: 2,626 matched pairs, live
per-pair price refresh against both venues. Open a dossier: gap-vs-fee meter, dual
30-day price history, word-diffed contract texts, the cached verifier's rationale —
quoted and attributed, not spoken in the app's voice — and a 'why this isn't free money'
banner with the exact gap−fee arithmetic. It answers the question a trader would
actually ask, pair by pair."

---

## Hard questions (know these cold)

### Q: Why zero? Isn't that suspiciously clean?

"Zero is what the gates leave, not a narrative choice. The median gap on priceable
same-contract pairs is 2.5pp against a 9pp round-trip fee floor — most 'gaps' are
noise inside fees. Of the 215 that clear fees and triage, 136 are too thin to trade,
39 more fail a 7-point contract-spec checklist, and the deep residuals die on
resolution nuance under manual review. And the biggest gaps were the *most* wrong —
96–99pp 'gaps' that were county-vs-statewide contract mismatches. If anything, zero is
conservative: I never even got to test depth and slippage, because nothing survived
long enough to need it."

### Q: Is the verifier trustworthy?

"No — and that's a design input, not an admission. It over-matches on look-alike
questions, so trust comes from the layers around it: a pinned single model and prompt
version (`gpt-4o-mini`, v3-market-level) across all 11,138 calls, every verdict cached
and provenance-tagged, a strict re-verification pass over the survivors, and
deterministic rules for known error classes. That audit produced 128 corrections — 45
against the 221 raw survivors — applied as a display-layer overlay so the raw artifact
is never rewritten. You can diff exactly what I reclassified and why. The verifier is
a noisy instrument; the corrections layer is the calibration certificate."

### Q: The Lab says 215 apparent gaps; the Terminal chip says 176. Which is wrong?

"Neither — they're two views of the same corrections file. The study's raw artifact has
221 semantic survivors. The corrections layer reverses 45 of them: 6 by deterministic
scope rules, 39 by strict re-verification. The Lab books those 39 where they
methodologically belong — at the strict-spec gate of the funnel (that's the 79 → 40
cull) — so its apparent-gaps stage shows 221 − 6 = 215. The Terminal is a per-pair
tool, so its chip applies all 45 up front: 221 − 45 = 176, and the chip's tooltip spells
out that arithmetic. Same `corrections.json`, one funnel-stage convention, one
per-pair convention — and I can point to the derivation for each in the code."

### Q: Your first scan found 7 overlaps in 2,219 markets. Why believe the new numbers?

"The first scan used a high-precision cosine threshold (0.85) on a small pull — good at
not being wrong, terrible at recall. The rebuild inverts that: a recall-first 0.68
threshold that admits 23,866 candidates, then an LLM verification layer to restore
precision. The overlap story changed completely — 5,431 same-event pairs, not 7 —
which is exactly why the conclusion had to be re-earned at full scale."

---

## What broke and how I found it (war stories)

**The county-scope bug.** The four largest apparent gaps in the study — 96 to 99
points — were Polymarket contracts on *county-level* results of the California
governor primary matched against Kalshi's *statewide* contracts. Same candidate, same
election, same wording almost token-for-token; every naive check passed. It surfaced in
an adversarial QA pass I ran over my own results before publishing — the rule I gave
the review was 'attack the biggest gaps first, they're the most likely to be wrong.'
The fix wasn't editing four rows: I wrote a deterministic county-scope rule that
catches the whole class (13 pairs corpus-wide) in both the app overlay and the
correction generator, and the raw artifact stayed untouched.

**The 0/400 bulk-match trap.** For the Terminal I wanted settled pairs demoted from the
queue. The cheap approach — bulk-fetch the live market map and treat 'absent' as
'settled' — matched 0 of the first 400 corpus rows. Not because everything settled
overnight, but because platform IDs churn: the bulk endpoint and the frozen corpus
disagreed on identity. If I'd trusted absence as evidence, the Terminal would have
demoted essentially every pair — a silent, total mislabeling. The fix: a pair is only
marked settled on per-pair probe evidence, where both venues are found *and* report
inactive. The lesson generalizes: absence in a bulk join is weak evidence, and weak
evidence should never drive a strong label.

---

## Things to be able to point at in the code

| Claim | File |
|-------|------|
| The funnel, one source of truth (215→79→40→4→0) | `web/src/lib/funnel.ts` |
| Correction overlay, raw data never rewritten | `server/src/pairs-data.ts`, `scripts/build-corrections.ts` |
| Batch verification transport + crash-safe poller | `scripts/verify-batch.ts`, `verify-batch-doctor.ts` |
| The study itself | `scripts/efficiency-study.ts` → `docs/data/efficiency-study.json` |
| 3D consensus field (to-scale, settle-and-freeze) | `web/src/components/lab/consensus3d/` |
| Dossier: gap meter, diff, attributed verdict | `web/src/components/PairDossier.tsx` |
| Settled-only-on-probe-evidence logic | `web/src/pages/TerminalPage.tsx` |
| 176-vs-215 reconciliation, in the UI itself | Terminal "Apparent gaps" chip tooltip |

## The one honesty rule

If asked "walk me through how X works" for any X above and you can't, fix that before
demoing anywhere. Do a full manual run of the app narrating every flow out loud first —
that rehearsal doubles as the demo script.
