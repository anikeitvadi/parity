# LinkedIn post — draft

> Lead with the number, not the "I learned so much" cliché. Attach ONE visual: the
> Consensus Gap Map (external/reference probability vs market price, points hugging the
> diagonal) or a simple bar of "2,219 markets → 7 shared events." Numbers are from the
> 2026-06-16 `npm run study` run; refresh before posting if it's been a while.

---

## Primary draft

I spent weeks building a tool to arbitrage prediction markets — find the same event
priced differently on Polymarket vs Kalshi, trade the gap.

Then I measured the one assumption the whole idea rested on: how often do the two
platforms even list the same event?

I pulled all 2,219 live markets and matched them semantically (OpenAI embeddings,
cosine ≥ 0.85). The answer:

→ 7 shared events. Out of 2,219. ~0.3%.
→ 6 of those 7 were the same niche question (next Israeli PM).
→ And where prices did differ, the gaps didn't survive fees — the one big, liquid gap
  was a settlement-definition mismatch, not free money.

The premise didn't just fail. It failed one level earlier than I expected: there was
almost nothing to compare.

So I stopped building an "edge finder" and rebuilt it as a Market Efficiency Lab — a
tool that *tests* whether an edge exists instead of assuming it does. The negative
result became the product, and the whole thing is reproducible: one command regenerates
the finding from live data.

The most useful engineering habit I practiced here: measure the assumption under your
idea before you build on top of it.

Code + full write-up 👇
[repo link]

#buildinpublic #datascience #appliedAI #fullstack

---

## Shorter alt (if the primary runs long for the feed)

I built a prediction-market arbitrage scanner, then measured the assumption it depended
on: how often do Polymarket and Kalshi list the same event?

Out of 2,219 live markets — 7. And none of the gaps survived fees.

There was nothing to arbitrage. So I rebuilt it as a lab that measures market efficiency
instead of pretending to beat it. Reproducible from live data with one command.

Measure the assumption under your idea before you build on it. 👇
[repo link]

---

## Posting checklist
- [ ] Re-run `npm run study` so the numbers are current; update them here if they moved.
- [ ] Attach the Consensus Gap Map image (or the 2,219 → 7 bar).
- [ ] Make the GitHub repo public and paste the real link.
- [ ] First comment: link to `docs/PORTFOLIO.md` directly for the 90-second read.
