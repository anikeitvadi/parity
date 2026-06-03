# Prediction Market Scanner — Case Study

> A full-stack AI research terminal for prediction markets — and the story of letting live
> data kill my original idea.

*~90-second read. Technical depth: [README](../README.md) ·
[Architecture](./ARCHITECTURE.md). Built solo with React, Hono, SQLite, and the OpenAI/xAI APIs.*

---

## In one line

I built a tool to find pricing edges across prediction markets, discovered from live data
that the edge doesn't exist, and turned that finding into a better product and a sharper story.

## The pivot, at a glance

| | |
|---|---|
| **Initial thesis** | Polymarket and Kalshi list the same events — find where they disagree and that's an edge. |
| **What live data showed** | **0 real cross-platform gaps across 314 markets.** The markets are efficient; the edge isn't there for retail. |
| **New thesis** | Stop chasing fake alpha. Make the *research and the decision* better: synthesize dispersed info, flag contract risk, track your own forecasting accuracy. |

The most useful thing I learned was to let the data override the vision I was attached to.

---

## 1. Problem

Prediction markets hold a huge amount of real-time, crowd-sourced information about the
future — elections, economics, world events. But using them well is tedious: you have to
check the same event across platforms, read the news behind a price, and judge whether the
crowd actually knows something or is just following the herd. Most people don't.

## 2. Hypothesis

The obvious money-making angle: the *same* event is often listed on both Polymarket and
Kalshi. If the two prices disagree, that gap is a tradeable edge. So I built a scanner to
find those gaps automatically across both platforms.

## 3. What the data showed

I built the whole pipeline — pulling live markets from both platforms, matching the same
event across them using AI embeddings, and computing the price difference. Run against 314
live markets, it found **zero meaningful gaps.** That's not a bug — it's the efficient-market
hypothesis showing up in practice. Two liquid markets on the same question converge. For a
retail user, there is no reliable free edge.

## 4. The pivot

Rather than hide that and ship a dishonest "edge finder," I reframed the product around value
that survives efficient markets:

- **Research synthesis** — an on-demand AI brief that pulls news, superforecaster signals,
  and cross-platform context into one decision-first summary. A minute instead of an hour.
- **Contract-risk awareness** — surfacing settlement rules and stale/odd markets so you
  don't misread what you're actually betting on.
- **Forecasting calibration** — log your probability calls, track them against outcomes, and
  see in plain language where you're overconfident: *when you say 70%, does it happen 70%?*

## 5. What I'd build next

Evidence-grounded briefs (real web retrieval with citations, not just LLM reasoning),
on-chain "smart money" wallet profiling, and strategy backtesting against the historical
data the system already stores.

---

## What this demonstrates

| Skill | Evidence |
|---|---|
| **API integration & data normalization** | Three completely different market APIs (Polymarket on-chain, Kalshi REST, Metaculus) unified into one validated data model — including reconciling that Kalshi measures volume in contracts and Polymarket in dollars. |
| **Applied AI** | LLM research briefs streamed live to the browser, with prompt/context engineering and a dual-provider fallback (xAI Grok / OpenAI GPT-4o). |
| **Vector / semantic search** | AI embeddings (cosine similarity) to match the same event across platforms — replacing keyword matching that produced false positives. |
| **Full-stack engineering** | React frontend, Hono API, SQLite, background scheduler, 405 automated tests, clean typecheck across three TypeScript projects. |
| **Product judgment** | Tested a hypothesis, let live data kill it, and reframed honestly instead of overclaiming. |

## See it

- **Live walkthrough:** [60-second demo](#) *(add link)*
- **Screenshots:** *(add 4–6: the market list, a decision pane with a brief, the calibration view, the architecture diagram)*
- **Code & full write-up:** [GitHub repo](#) *(add link)* — start with the [README](../README.md)

---

*Honest by design: cross-platform gaps are ~0 right now (that's the point), and the AI briefs
are synthesis rather than fully retrieval-grounded — both documented as known limitations and
next steps. A project I can explain beats a flashier one I can't.*
