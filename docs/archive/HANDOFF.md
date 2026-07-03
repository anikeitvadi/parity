# Handoff — Current State & The Decision That Matters

> Honest snapshot written 2026-06-02. `CONTEXT.md` is the lean orientation/doc-map;
> this file is the deeper "current state + the strategic decision" companion. Read this
> when you need the reasoning behind the pivot, not just the layout.

## The one thing to resolve before writing any more code

We keep polishing the surface; the **core value proposition is unproven and may not exist.**

- The original premise is "find mispriced markets / cross-platform gaps." But the overlapping
  markets are **efficient**: one reproducible scan of 2,219 markets surfaced 7 high-confidence
  overlaps (cosine ≥ 0.85) and 0 that cleared the arbitrage threshold (~19pp after ~9pp
  round-trip fees; the scanner's own `priceGaps: 0` confirms it). In an efficient market the
  price *is* the best estimate, so a "spot where the crowd is wrong" tool is fighting the
  premise, not executing badly.
- The AI brief produces plausible-but-generic analysis (LLM vibes, not real research). It
  doesn't beat the price either.
- Every session improves layout/formatting/data correctness without resolving *what job
  this wins at*. That is the blocker. No feature fixes it.

### Pick the job, or decide there isn't one

1. **Make *you* a better forecaster** (calibration, not edges). Value = self-improvement.
   Niche, slow, only works if forecasts are logged religiously.
2. **Information synthesis on hard markets** — surface dispersed info (news, base rates,
   mechanics) you'd spend an hour gathering. Only delivers if the brief does *real*
   research (live web search + structured base rates), not LLM vibes.
3. **Aggregation / discovery** — one clean place to browse both platforms + signals.
   Convenient, no moat (Polymarket's own UI is good).
4. **Portfolio / learning piece, not a product.** Legitimate — but then "value" means
   *impressive and finished*, not *used daily*. Different goal, different work.

### Questions only the owner can answer
- Who is this for — you, or other people?
- Would *you* open it before a real bet, and would it change your mind vs. just reading the
  price? (If the builder wouldn't use it, no feature fixes that.)
- Is success "a product people use" or "a finished thing I'm proud of"?

**Cheapest validation:** take one market you genuinely care about; check whether this tool
changes your decision vs. reading the price. If not, the premise is the problem.

## What the app actually is right now (post-this-session)

Single-screen "Scanner" terminal UI (the old multi-page app is deleted):

- **Left:** full market list — ~2,219 markets from Polymarket + Kalshi, POLY/KALSHI badge,
  platform filter, type filter, sort by volume / divergence / closing.
- **Right (a market selected):** one decision pane — price + 7d history, divergence vs
  cross-platform/Metaculus, settlement risk, on-demand AI brief, your-call slider (Kelly).
- **Right (nothing selected / Esc):** dashboard — plain-language calibration track record
  + saved markets.

Data flows from a single endpoint: `GET /api/opportunities/feed` (full universe +
server-computed divergence + opportunity tags).

## Code state (all UNCOMMITTED on `main`)

This session's changes:
- `server/src/prompts/research.ts` — brief rewritten decision-first (verdict + fair value +
  edge), filler banned.
- Manual brief generation (Generate button + Stop) — was auto-running per selection.
- `server/src/routes/opportunities.ts` — new `/feed` endpoint; server-side cross-platform
  divergence map + `classifyMarket` helper.
- `web/src/api/client.ts` — `FeedItem` type + `fetchFeed`.
- `web/src/pages/TerminalPage.tsx` — feed-driven, platform filter, sort, two-pane layout.
- `web/src/components/OpportunityQueue.tsx` — full universe, platform badge, signal/gap from
  feed (not click-only cache).
- `web/src/components/ConsensusGapMap.tsx` — consumes FeedItem.
- `web/src/components/DecisionPane.tsx` — NEW merged pane (evidence + brief + your-call +
  dashboard). `web/src/components/DecisionPanel.tsx` — DELETED.
- `web/src/components/EvidenceBoard.tsx`, `web/src/app.css`, `web/index.html` — earlier
  rewrite + font-import fix.
- `src/services/kalshi.ts` — multi-outcome questions use `yes_sub_title` (option name) not
  the duplicated event title; volume = lifetime `volume_fp × price` (USD approx) instead of
  near-zero 24h contract count.

Verification: `npm run typecheck` clean (3 tsconfigs), `npm run build:web` green,
`npm run test:run` 405 passing.

## Known real limitations (not bugs to fix — facts to design around)
- Cross-platform gaps are ~0 (efficient markets). The divergence column is honest but
  mostly empty.
- Brief now grounds on real cached web sources with URLs (optional `npm run collect:context`,
  built-in DuckDuckGo adapter; optional Agent-Reach for richer sources); the remaining gap is
  full-article retrieval + structured base rates.
- Some Kalshi markets are stale-in-reality but listed `active` upstream (e.g. "next Pope",
  close date 2070). Not our bug; could filter by close date / zero volume if desired.
- Calibration data is thin (a few logged forecasts) — chart works, just sparse.

## If continuing
Don't start with code. Answer the decision above. Then:
- If **#2 (synthesis):** push the brief past the cached sources it already cites to
  full-article retrieval + structured base rates — the only path to value a price doesn't
  already contain.
- If **#1 (calibration):** make logging + resolving a forecast frictionless; make the track
  record the landing screen.
