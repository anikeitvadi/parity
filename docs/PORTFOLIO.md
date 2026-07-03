# Parity — Prediction-Market Efficiency — Case Study

> I set out to build an arbitrage scanner for prediction markets. The data killed
> the premise — twice. So I rebuilt the project around proving the absence properly:
> a full-universe efficiency study of Polymarket × Kalshi, and a live terminal that
> audits every apparent price gap down to the last residual. The finding is the product.

*~90-second read. Technical depth: [README](../README.md) ·
[Architecture](./ARCHITECTURE.md). Built solo with React, Hono, SQLite, and the
OpenAI APIs. The headline finding is reproducible from the shipped artifacts; the
full study regenerates from live data with one command: `npm run study`.*

---

## In one line

I scanned the entire standalone-market universe of Polymarket and Kalshi — **92,290
markets, ≥1.76B possible cross-listings** — verified every candidate pair with a
cached LLM pipeline, found **215 apparent price gaps**, and audited every one of them
to the same answer: **zero executable arbitrage**.

## The finding (one reproducible scan, June 30 2026)

| Stage | Count |
|---|---:|
| Standalone markets (Polymarket ≥26,930 + Kalshi 65,360) | **92,290** |
| Tradeable — markets with a live price, across both platforms | 52,858 |
| Candidate pairs (embedding cosine ≥ 0.68) | 23,866 |
| Same event (LLM-verified) | 5,431 |
| Same contract (cached verifier flag) | 3,791 |
| Priceable on both sides | 3,017 |
| Clears the 9pp round-trip fee floor (Poly 2% + Kalshi 7%) | 558 |
| **Apparent gaps** (survive entity/scope triage) | **215** |
| Liquid (> $500 per side) | 79 |
| Strict 7-point contract-spec match | 40 |
| Deep (> $10k per side) | 4 |
| **Clear executable arbitrage** | **0** |

**Two honest conclusions, both from the data:**

1. **Hundreds of gaps look free; none are.** The median gap on priceable same-contract
   pairs is 2.5pp — below the 9pp it costs to round-trip a trade. Everything above the
   fee floor dies on liquidity, contract-spec mismatch, or resolution nuance.
2. **The biggest gaps are the most suspicious.** The four largest apparent gaps
   (96–99pp) were Polymarket *county-level* contracts matched against Kalshi
   *statewide* contracts — pairs that pass every naive check and would have bankrupted
   a bot that trusted them. That trap is exactly why the tool exists.

## 1. Premise

Prediction markets (Polymarket, Kalshi) hold real-time, crowd-sourced probabilities on
elections, economics, and world events. The obvious angle: when both platforms price
the same event differently, the gap looks like a tradeable edge. Build a scanner that
finds those gaps automatically.

## 2. The first scan killed it — so I rebuilt at full scale

A first scan of 2,219 live markets found only 7 cross-platform overlaps and no gap
that survived fees — but that scan was too small to be the final word, so I rebuilt
the pipeline to ingest **the entire standalone-market universe of both platforms**:
92,290 markets, paginated past both APIs' caps (Polymarket is reported as a ≥ lower
bound for exactly this reason), which implies ≥1.76B possible cross-platform pairings
to search.

## 3. The verification pipeline

Brute-forcing 1.76B comparisons with an LLM is a non-starter, so the pipeline narrows
in stages, each cheap enough to afford the next:

- **Embeddings first.** Every market question is vectorized
  (`text-embedding-3-small`) and candidate pairs are retrieved at cosine ≥ 0.68 —
  a deliberately *recall-first* threshold: 23,866 candidates, most of them wrong,
  none silently missed.
- **LLM verification second.** A market-level verifier (single model, `gpt-4o-mini`;
  single pinned prompt version) judges each candidate: same event? same contract?
  **11,138 verification calls**, all cached and provenance-tagged, so the study
  re-runs from cache for free. Result: 5,431 same-event pairs, 3,791 same-contract
  flags.
- **Batch API transport.** Verification at this volume runs through the OpenAI Batch
  API with a crash-resilient poller and a `doctor` command that classifies stalled
  batches — the poller survives restarts and never loses a paid verdict.
- **Deterministic gates last.** Fees (9pp round trip), a $500-per-side liquidity
  floor, a 7-point contract-spec checklist, a $10k depth cut, and manual review of
  the final residuals: 215 → 79 → 40 → 4 → **0**.

## 4. The corrections layer — the part I'd want to be interviewed on

The verifier over-matches on look-alike questions. That's a finding, not a footnote,
and the credibility of "zero" rests on how those errors are handled:

- **The raw artifact is never rewritten.** `efficiency-study.json` says 221 semantic
  survivors. A strict re-verification pass plus deterministic scope rules produced
  **128 corrections** (`corrections.json`) — 45 of them against those 221 survivors.
- **Corrections apply as a display-layer overlay.** The app derives its corrected
  funnel at render time, so raw data and judgment stay separable and diffable — an
  auditor can see exactly what was reclassified, why, and by which rule.
- **Error classes become rules.** The county-vs-statewide bug wasn't patched pair by
  pair; a deterministic county-scope rule now catches the whole class (13 pairs) in
  both the app and the correction generator.
- **The corrections make the result stronger, not weaker.** Every correction removed
  a false positive; `clearExecutableArb` never moved off 0.

## 5. What I'd build next

Longitudinal re-runs (does the 215 → 0 shape hold week over week?), an order-book
depth and slippage probe for the deep residuals — the one gate the study honestly
labels untested — and full-article evidence retrieval for the Terminal's research
briefs.

---

## What this demonstrates

| Skill | Evidence |
|---|---|
| **Data engineering at scale** | Full-universe ingestion (92,290 markets past both APIs' pagination caps), a staged ≥1.76B-pair search, and a frozen, diffable artifact chain (`efficiency-study.json` → `corrections.json` → rendered funnel). |
| **Applied AI with cost discipline** | Recall-first embeddings + precision LLM verification; 11,138 cached, provenance-tagged verdicts on a single pinned model/prompt; OpenAI Batch API transport with a crash-resilient poller and stall-classifying doctor. |
| **Measurement rigor** | A corrections layer that reclassifies the pipeline's own false positives without rewriting raw data, deterministic rules for error classes, and a funnel where every stage names the gate that culled it. |
| **Full-stack engineering** | React 19 + Hono + SQLite/sqlite-vec monorepo with three independently-typechecked TypeScript projects; `npm run check` = 3 typechecks + Vite build + **435 tests**. |
| **Deployment pragmatism** | A static zero-backend deploy path: `npm run snapshot` freezes the API responses so the full Lab and 2,626-pair Terminal ship as a bundle with zero runtime calls (verified). |
| **Product judgment** | Let the data kill the premise twice, then made the negative result — and the machinery that proves it — the product. |

## See it

- **The Lab:** the study as a visual argument — a to-scale 3D consensus field
  (1 point = 1 market, all 92,290), a log-scale compression waterfall, the exact-figures
  funnel ledger, the survivors wall with per-pair 7-point spec checkboxes, and the
  "deep four" residuals.
- **The Terminal:** a live pair terminal on the same corpus — 2,626 matched pairs,
  per-pair live price refresh, and a dossier per pair with the gap-vs-fee arithmetic
  and the cached verifier's verdict, quoted and attributed.
- **The raw finding:** [`docs/data/efficiency-study.json`](./data/efficiency-study.json)
  and [`corrections.json`](./data/corrections.json), regenerated by `npm run study` +
  `npm run corrections`.
- **Code & full write-up:** [GitHub repo](https://github.com/anikeitvadi/prediction-market-scanner)
  — start with the [README](../README.md).

---

*Honest by design: this is one scan, not a universal claim about market efficiency;
the universe counts are lower bounds where pagination caps applied; and executability
was never proven or disproven at the book level — no depth, slippage, or
settlement-timing test has been run. The study stops at "no gap survives the checks a
trade would have to pass first," and the UI says so. A project I can explain beats a
flashier one I can't.*
