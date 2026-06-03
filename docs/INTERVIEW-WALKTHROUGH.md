# Interview Walkthrough — Explain It Cold

Study doc. The rule: a project you can explain beats a flashier one you can't. Every piece
below should be narratable without notes. Practice out loud until each answer is ~30–60s.

---

## The 90-second pitch (lead with this)

> "It's a full-stack AI research terminal for prediction markets. I set out to find
> cross-platform mispricings between Polymarket and Kalshi — same event priced differently,
> that's an edge. I built the live scanner with semantic matching across 314 markets and
> found **zero real gaps**. The markets are efficient; for retail there's no free edge.
> So instead of faking it, I killed the premise and reframed the product around what's
> actually useful when you can't beat the price: synthesizing the dispersed research,
> flagging contract/settlement risk, and tracking your own forecasting calibration. The
> most useful thing I learned was to let live data override the vision I was attached to."

Then pick the lens for the room:
- **Integration / solutions roles** → "I normalized three completely different market APIs
  into one validated schema and built an AI layer on top."
- **AI / agent roles** → "streamed LLM briefs over SSE with prompt/context engineering and
  vector-embedding event matching."
- **PM / product roles** → "I tested a hypothesis against live data, it failed, and I
  reframed honestly — here's the decision trail."

---

## Q: Walk me through the architecture.

"Three layers. `src/` is a framework-agnostic core engine — service clients, detectors,
scoring, SQLite. `server/` is a Hono API that imports the engine and exposes REST + an SSE
endpoint. `web/` is a React SPA that talks only to that API. Each has its own tsconfig and
typechecks independently, because the engine is reused by the API, a CLI dashboard, and a
background scheduler. Data flows: external APIs → normalized `Market` schema → SQLite →
a `/feed` endpoint that serves the universe with computed divergence → the React UI."

(Have `docs/ARCHITECTURE.md` open — the two sequence diagrams are the visual.)

## Q: The data normalization — what was actually hard?

"Syntactic differences are easy — different field names, Zod handles that. The hard part is
*semantic*. Polymarket reports trading volume in **dollars**; Kalshi reports it in
**contracts**. If you just display both, Kalshi looks 1000× smaller and any volume sort is
meaningless. So I convert Kalshi to approximate USD turnover — lifetime contracts × price.
Another one: Kalshi multi-outcome events repeat the event question as every sub-market's
title, so 'Who will the next Pope be?' showed up seven identical times — the actual
candidate name lives in a different field, `yes_sub_title`. Normalization is judgment about
meaning, not just mapping keys."

## Q: Semantic matching — why and how?

"To detect when the same real-world event is listed on both platforms, I first tried keyword
matching. It produced false positives — 'next James Bond actor' matched 'next James Bond
villain' because they share tokens. I replaced it with embeddings: each market question is
vectorized with OpenAI's `text-embedding-3-small` (1536 dims), stored in **sqlite-vec** — a
vector extension that runs inside the same SQLite file, so no separate vector DB. Matching is
cosine similarity with a 0.85 threshold. Embeddings are cached with a 24-hour freshness
check, so the matching pass itself is pure in-memory math — no API calls on the hot path."

*Follow-up — why 0.85?* "Empirical. Below it you let in near-misses like the Bond example;
much above it you miss legitimately-phrased-differently matches. It's a tunable threshold,
not a magic number."

## Q: How do the AI briefs work?

"On-demand, streamed. When you click Generate, the server gathers context — the market data,
recent news headlines, Metaculus superforecaster numbers, cross-platform pricing — builds a
decision-first prompt, and streams the model's response token-by-token over Server-Sent
Events. The frontend renders markdown as tokens arrive. It's a dual provider: it prefers xAI
Grok and falls back to OpenAI GPT-4o — same OpenAI SDK, different base URL. I made generation
manual rather than automatic specifically to not burn tokens on markets the user doesn't open."

*Honest limitation to volunteer:* "Right now the brief reasons over what's in the prompt —
it's synthesis, not retrieval-grounded research. News is headline-level, no full-article
retrieval or citations yet. The next step is real web retrieval + base rates, which is the
difference between 'sounds smart' and 'is grounded.'"

## Q: The calibration feature — what's a Brier score?

"It measures how good your *probabilities* are, not just your yes/no calls. For each resolved
forecast it's the squared error between your stated probability and the outcome (1 or 0).
Lower is better; 0.25 is what you'd get always saying 50%. I bucket forecasts into ranges and
plot predicted-vs-actual — so 'when you said 70%, did it happen 70% of the time?' If your
70% bucket only happens 55% of the time, you're overconfident. It's a proper scoring rule
from decision science — it can't be gamed by hedging."

## Q: Server-side divergence — what problem did that solve?

"Originally the list's Signal/Gap columns were computed client-side from a cache that only
filled when you *clicked* a market. So the column meant to tell you *where to look* was empty
until you'd already looked everywhere. I moved divergence computation to the server in a
`/feed` endpoint — it runs the embedding match once and attaches a signal to every market —
so the whole list is populated and sortable by divergence in one pass."

## Q: Why did the original premise fail, and how do you know?

"The scanner ran the cross-platform match across 314 live markets and found zero gaps above
threshold — the detector's own counter confirms `priceGaps: 0`. That's not a code failure;
it's the efficient-market hypothesis showing up in real data. Two well-capitalized markets on
the same event converge. I could have hidden that and shipped a fake 'edge finder,' but the
honest finding is more valuable — it forced a better product and it's the part of this
project I'm most willing to defend."

## Q: What would you build next, and what would you cut?

"Next: evidence-grounded briefs — real web retrieval and base rates with citations — because
that's the one feature that adds value a market price doesn't already contain. After that,
on-chain wallet profiling (Polymarket is on Polygon, holder data is public) to show smart-
money vs retail positioning, and backtesting against my historical snapshots. Cut: anything
that revives 'find the edge' — that premise is dead and chasing it would be dishonest."

---

## Things to be able to point at in the code

| Claim | File |
|-------|------|
| One normalized schema | `src/types/market.ts`, `src/services/{polymarket,kalshi}.ts` |
| Embedding match, 0.85 cosine | `src/services/semantic-matcher.ts` |
| Server-side divergence | `server/src/routes/opportunities.ts` (`/feed`) |
| SSE streaming brief | `server/src/routes/markets.ts` (`/:id/research`), `web/src/hooks/useResearch.ts` |
| Decision-first prompt | `server/src/prompts/research.ts` |
| Brier / calibration | `src/scoring/brier.ts`, `server/src/routes/calibration.ts` |
| The pivot in one number | scan stats `priceGaps: 0` across 314 markets |

## The one honesty rule

If asked "walk me through how X works" for any X above and you can't, fix that before
demoing anywhere. Do a full manual run of the app narrating every flow out loud first —
that rehearsal doubles as the demo script.
