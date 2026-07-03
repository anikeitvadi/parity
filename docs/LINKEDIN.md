# LinkedIn post — draft

> Lead with the numbers, not the "I learned so much" cliché. Attach ONE visual: the
> Lab's 3D consensus field (92,290 points, the orange gaps settling to "0 confirmed")
> or the compression waterfall (52,858 tradeable → 0; only the consensus field shows the full 92,290). Numbers are from the 2026-06-30
> `npm run study` corpus; they are frozen in the shipped artifact, so no refresh needed.

---

## Primary draft

I built a tool to find arbitrage between prediction markets. It found none — and
proving that absence rigorously became the portfolio piece.

The idea: the same real-world event is often priced differently on Polymarket vs
Kalshi. Find the gaps, trade them.

So I scanned the standalone-market universe of both platforms — ≥92,290
markets, ≥1.76 billion possible cross-listings — and pushed every candidate pair
through an embedding + LLM verification pipeline, then fee, liquidity, and
contract-spec gates.

→ 215 apparent price gaps. Some looked enormous.
→ 0 executable. Every single one died on thin books, contract-spec
  mismatches, or resolution nuance.
→ The four biggest "gaps" (96–99pp!) were county-level contracts matched against
  statewide ones — pairs that pass every naive check and would have bankrupted a
  bot that trusted them.

The part I'm proudest of isn't the pipeline — it's the error handling. The verifier
over-matches on look-alike questions, so I audited it against itself: 128 corrections,
applied as a display-layer overlay so the raw study artifact is never rewritten. The
corrections only made the answer stronger. Zero never moved.

The result ships as "Parity": a Lab that walks you through the full 92,290 → 0 audit,
and a live Terminal that shows you, pair by pair, exactly why each gap isn't free
money.

Sometimes the most valuable thing a measurement tool can produce is a rigorous zero.

Code + full write-up 👇
[repo link]

#buildinpublic #datascience #appliedAI #fullstack

---

## Shorter alt (if the primary runs long for the feed)

I built a tool to find arbitrage between prediction markets. It found none — and
proving that absence rigorously became the portfolio piece.

92,290 markets scanned across Polymarket and Kalshi. 215 apparent price gaps.
0 executable — every one died on liquidity or contract fine print (2,459 more never even cleared round-trip fees). Plus 128
corrections where I audited my own verifier's false positives, overlaid without ever
rewriting the raw data.

The negative result is the product: a Lab that shows the full audit, and a live
terminal that explains, pair by pair, why the "free money" isn't. 👇
[repo link]

---

## Posting checklist
- [ ] Capture the final hero screenshot (after the hologram settles on "post-triage · 0 confirmed").
- [ ] Make the GitHub repo public and paste the real link.
- [ ] First comment: link to `docs/PORTFOLIO.md` directly for the 90-second read.
