# Final Story WIP: Market Efficiency Lab

## Core Narrative

I started with a simple builder/trader question:

> If someone built a cross-platform scanner for Polymarket and Kalshi, what standalone markets would they actually scan, and did any real mispricings survive fees, liquidity, and contract review?

The first version looked for arbitrage directly. The better version became a measurement system: define the comparable market universe, filter out structurally invalid API noise like parlays/composites, match equivalent contracts across platforms, normalize orientation, and inspect whether apparent gaps are real.

The key distinction:

- **Catalog universe:** all discovered standalone markets across both platforms.
- **Tradeable analysis set:** the subset with evidence of trading activity, because arbitrage requires executable prices.

The scale is the story:

- Earlier run: `2,000 × 58,158 ≈ 116M` possible Polymarket/Kalshi comparisons.
- Corrected Polymarket enumeration: `~25,944 × 58,158 ≈ 1.5B` possible comparisons.
- That means the Lab is not just checking a few pairs; it is compressing a billion-scale search space down to candidate matches, verified same-contract pairs, apparent gaps, and finally confirmed arbitrage.

So the project should not claim only “markets are efficient.” The stronger claim is:

> Apparent cross-platform arbitrage mostly disappears once you account for market structure: API noise, thin liquidity, outcome orientation, settlement wording, entity mismatches, and fees.

That is the real portfolio story. It shows engineering rigor, product judgment, and honest negative-result analysis.

## Current Methodology Direction

The study should separate three layers:

1. **Universe Enumeration**
   - Enumerate the broad standalone market catalog.
   - Polymarket: discovered standalone markets from multi-sort Gamma walks; if API caps prevent proof of completeness, label as a lower-bound enumeration.
   - Kalshi: standalone markets expanded from open events; raw `/markets` parlay/composite noise is measured and excluded structurally.

2. **Tradeability Scope**
   - Run price-gap analysis only on markets with evidence of trading activity.
   - Primary floor: `volume > 0` / has traded.
   - Sensitivity floors: `>= $1k`, `>= $10k`, optionally `>= $100k`.
   - This is not category filtering; it directly follows from the arbitrage question.

3. **Gap Triage**
   - Candidate topical overlap.
   - Same-contract pair.
   - Priceable pair.
   - Apparent fee-clearing gap.
   - Triage label: validated, orientation-normalized, settlement ambiguity, scope mismatch, entity mismatch, thin/dead liquidity.
   - Confirmed arbitrage only if it survives all of the above.

## Important Wording

Use wording like:

> The study enumerates the broad standalone market catalog, then runs price-gap analysis on the tradeable subset because arbitrage requires executable prices. Liquidity floors are reported as sensitivity checks, not category filters.

Avoid wording like:

- “all markets” unless the enumeration is actually exhaustive.
- “opportunities” for untriaged gaps.
- “markets are universally efficient” from one scan.
- “arbitrage” unless fees, liquidity, orientation, and settlement have all cleared.

## Comparison Matrix Concept

The next design/analysis object should be a matrix that makes billions of potential comparisons understandable without pretending every pair was manually reviewed.

Purpose:

> Show how the enormous possible pair space collapses into a small number of meaningful comparable contracts.

Rows / stages:

1. Full pair space: Polymarket standalone count × Kalshi standalone count.
2. Candidate embedding matches.
3. LLM-verified topical overlaps.
4. Same-contract candidates.
5. Priceable same-contract pairs.
6. Apparent gaps above fee line.
7. Confirmed arbitrage after triage.

Columns / slices:

- All tradeable markets.
- Sports.
- Elections.
- Politics.
- Financials / Economics.
- Crypto.
- Entertainment.
- Liquidity floor `>0`.
- Liquidity floor `>=1k`.
- Liquidity floor `>=10k`.

Possible visual forms:

- **Funnel matrix:** each category is a column; each pipeline stage is a row; cell values show count and survival rate.
- **Heatmap:** categories × liquidity floors, colored by median gap or fee-clearing gap count.
- **Triage waterfall:** apparent large gaps broken down by reason they are not confirmed arbitrage.
- **Pair-space compression graphic:** huge theoretical pair count down to validated same-contract count.

Design principle:

> Make real market data the eye candy. The wow moment should be the compression from billions of possible comparisons to a tiny number of real, tradeable, same-contract gaps.

## Verification Infrastructure Lesson

The verification layer became its own engineering story. The first large run hit the synchronous verifier's request-per-day wall: the data pipeline needed thousands of contract-verification calls, and even perfect rate limiting could not make a one-shot chat-completions loop reliable.

The fix is to treat verification as batch infrastructure, not an API loop:

- Generate stable JSONL requests for missing verdicts.
- Use a provider Batch API transport for large runs.
- Map each result back by deterministic `custom_id`.
- Write every verdict into a provider/model/prompt-version scoped cache.
- Publish only a complete, single-model verifier corpus unless mixed-provider provenance is explicitly documented.

Portfolio framing:

> The initial verifier hit request/day limits, so I moved large-scale contract verification to a Batch API pipeline: JSONL request generation, async polling, deterministic result mapping, provider/model-scoped verdict caching, and publish-time provenance checks.

This strengthens the project because the system is no longer just analyzing markets; it is engineered to survive billion-scale candidate spaces and quota-limited AI verification.

## Portfolio Angle

The project is not a failed arbitrage bot. It is an analyst workbench that demonstrates why naive arbitrage bots get fooled.

Stronger headline direction:

> I scanned the cross-platform prediction-market universe and found that the hard part is not spotting price gaps. It is proving they are real.

Or:

> I built a scanner to find prediction-market arbitrage. The useful product turned out to be a lab for showing why most apparent arbitrage is fake.
