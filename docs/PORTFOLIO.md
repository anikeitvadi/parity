# Prediction Market Efficiency Lab — Case Study

> I set out to build an arbitrage scanner for prediction markets. Then I measured
> the thing it depended on — and the data killed the premise. So I turned the tool
> into a lab for measuring market efficiency, and the negative result became the
> product.

*~90-second read. Technical depth: [README](../README.md) ·
[Architecture](./ARCHITECTURE.md). Built solo with React, Hono, SQLite, and the
OpenAI APIs. The headline finding is reproducible from live data with one command:
`npm run study`.*

---

## In one line

I built a tool to arbitrage price differences between Polymarket and Kalshi,
measured how often the two platforms even list the same event, found the answer is
**almost never** — and rebuilt the project around that measurement.

## The finding (run it yourself: `npm run study`)

A live scan on **2026-06-16**:

| Measured | Result |
|---|---|
| Live markets pulled (Polymarket + Kalshi) | **2,219** (1,500 + 719) |
| Events listed on **both** platforms (semantic match, cosine ≥ 0.85) | **7** (~0.3%) |
| Of those 7, how many were the *same underlying question* | 6 were variants of *"next Prime Minister of Israel"* |
| Price gaps that survive round-trip fees (Poly 2% + Kalshi 7% = 9%) | **2** — both marginal |
| Gaps large enough to clear the arbitrage threshold (≥19pp) | **0** |

**Two honest conclusions, both from the data:**

1. **The platforms barely list the same events.** Out of 2,219 live markets, only 7
   overlap — and 6 of those are the same niche question. The premise of cross-platform
   arbitrage assumes a shared event to compare; in practice that overlap is nearly empty.
2. **Where they do overlap, there's no free edge.** The median gap is 3.5pp — below the
   9pp it costs in fees to round-trip a trade. The single largest gap (18.5pp, on a
   *liquid* $1.6M market — "will Bennett be next Israeli PM," 20% vs 38%) is almost
   certainly a **settlement-definition mismatch**, not alpha: the two platforms resolve
   "next PM" on different terms. That trap — a gap that looks real but isn't — is exactly
   why naive cross-platform arbitrage loses money, and why the tool flags settlement risk.

The most useful thing I learned was to measure the assumption under my idea before
building on top of it.

---

## 1. Problem

Prediction markets (Polymarket, Kalshi) hold real-time, crowd-sourced probabilities
on elections, economics, and world events. The obvious money-making angle: the *same*
event is often listed on both platforms, so if the two prices disagree, that gap looks
like a tradeable edge.

## 2. Hypothesis

Build a scanner that finds those cross-platform gaps automatically: pull both
platforms, match the same event across them, compute the price difference, surface the
divergences.

## 3. What the data showed

I built the whole pipeline — live ingestion from both public APIs, semantic matching
of equivalent events via OpenAI embeddings (cosine similarity ≥ 0.85), and gap
measurement net of fees. Then I ran it across the **full** market universe (2,219
markets), not a sample.

The result is the table above: **7 shared events out of 2,219**, and **no edge that
survives fees and settlement risk.** The arbitrage premise fails one level earlier than
"efficient markets" — there's almost nothing to compare in the first place, and the rare
overlaps are either noise or definition mismatches.

A detail I'm proud of: the matcher's *restraint* is what reveals this. Naive keyword
matching pairs *"Mamdani win the 2028 nomination"* with *"Mamdani become President"*
because they share words. The embedding matcher correctly rejects those as different
questions (they score ~0.75, below the 0.85 bar). The negative result is only
trustworthy because the matching is good enough not to manufacture false positives.

## 4. The pivot — from scanner to Efficiency Lab

Rather than ship a dishonest "edge finder," I reframed the project as a **Market
Efficiency Lab**: a tool that *tests whether an edge exists* instead of assuming it does.
A lab has experiments, not just listings:

- **Experiment 1 — Cross-platform efficiency (done, reproducible).** The finding above.
  `npm run study` regenerates it from live data, persists the matched pairs to SQLite,
  and writes the distribution behind the Efficiency Lab charts (Observable Plot).
- **Experiment 2 — Metaculus vs. the market (running).** When superforecasters disagree
  with the market by 10+ points, who's right? This is a backtest that needs resolved
  outcomes over time; the harness is collecting them now. No claim until the data is in.
- **Experiment 3 — Personal calibration (running, n=3).** Log your probability calls,
  score them with a proper scoring rule (Brier), and see where you're overconfident —
  *when you say 70%, does it happen 70%?* The method works; the sample is still thin.

The honest framing is the point: one reproducible experiment, two transparently in
progress. That's what a lab actually looks like.

## 5. What I'd build next

Deeper evidence grounding (full-article retrieval and structured base rates on top of
the cited web sources briefs already use), longitudinal efficiency tracking (re-run the
study weekly to see whether overlap/gaps move), and the settlement-rule comparison
surfaced directly on every matched pair.

---

## What this demonstrates

| Skill | Evidence |
|---|---|
| **API integration & data normalization** | Three different market APIs (Polymarket on-chain/Gamma, Kalshi REST, Metaculus) unified into one validated `Market` type — including reconciling that Kalshi measures volume in contracts and Polymarket in dollars, and paginating past both APIs' 100-per-page caps to get the *full* universe. |
| **Applied AI** | OpenAI embeddings (text-embedding-3-small, 1536-dim) for semantic event matching; LLM research briefs streamed live over SSE with prompt/context engineering, explicit source-honesty rules, and a promptfoo eval suite (factuality + no invented citations, runs offline). |
| **Vector / semantic search** | Cosine similarity at a 0.85 threshold to match the same event across platforms — chosen specifically to reject same-name-different-event false positives that keyword matching produces. |
| **Data / measurement rigor** | A reproducible study (`npm run study`) that produces a real distribution from 2,219 live markets, net of a fee model — not a hand-waved "0 gaps." Results persist to SQLite; the schema + pgvector production path are in [docs/SCHEMA.md](./SCHEMA.md). |
| **Full-stack engineering** | React frontend, Hono API, SQLite + sqlite-vec, background scheduler, 408 automated tests, clean typecheck across three TypeScript projects. |
| **Product judgment** | Measured the assumption under the idea, let the data kill it, and reframed the product around what the measurement actually supports. |

## See it

- **Live walkthrough:** [60-second demo](#) *(add link)*
- **Screenshots:** *(add 4–6: the market universe, a decision pane with a brief + "Sources
  used", the Efficiency Lab charts, the calibration view)*
- **The raw finding:** [`docs/data/efficiency-study.json`](./data/efficiency-study.json)
  and [`gap-map.csv`](./data/gap-map.csv), regenerated by `npm run study`.
- **Code & full write-up:** [GitHub repo](https://github.com/anikeitvadi/prediction-market-scanner)
  — start with the [README](../README.md).

---

*Honest by design: the cross-platform overlap is tiny (7 of 2,219 markets on the run
above) and the AI briefs ground on real cached web sources but not yet full-article
retrieval — both documented as findings and next steps, not hidden. The numbers above are a single live
run and will drift; the point is that anyone can re-run it. A project I can explain beats
a flashier one I can't.*
