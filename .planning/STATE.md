---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
last_updated: "2026-07-01T22:09:36.455Z"
last_activity: 2026-02-04 - Completed 04-06-PLAN.md (Dashboard MetaculusView)
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 26
  completed_plans: 26
  percent: 67
---

# Project State: Prediction Market Edge Scanner

**Last Updated:** 2026-02-04T22:26:14Z
**Project Started:** 2026-01-29

## Project Reference

**Core Value:** Surface high-confidence mispricings where analysis shows the market is wrong, filtered so only quality opportunities reach the user.

**Current Focus:** Phase 4 Complete - Ready for Phase 5

**Tech Stack:**

- Node.js 20+ & TypeScript 5.5+
- SQLite (better-sqlite3) for market snapshots
- Polymarket CLOB client (official package)
- Kalshi REST API
- Metaculus API (axios + axios-retry)
- Ink + @inkjs/ui for CLI dashboard
- Bree scheduler, Pino logger, Zod validation
- string-similarity, chrono-node for settlement verification

## Current Position

**Phase:** 4 of 6 (Advanced Edge Detection)
**Plan:** 6 of 6 complete
**Status:** Phase complete
**Last activity:** 2026-02-04 - Completed 04-06-PLAN.md (Dashboard MetaculusView)

**Progress Bar:**

```
Phase 1: Data Foundation & Infrastructure
[████████████████████] 100% (10/10 plans)

Phase 2: Scoring & Alert Foundation
[████████████████████] 100% (5/5 plans)

Phase 3: Cross-Platform Arbitrage Enablement
[████████████████████] 100% (5/5 plans)

Phase 4: Advanced Edge Detection
[████████████████████] 100% (6/6 plans)

Overall Roadmap:
[██████████████████░░] 65% (26/40 requirements)
```

**What's Next:**

- Phase 5: Longshot bias detection

## Performance Metrics

**Phase Velocity:** N/A (no phases completed)

**Requirements Completion:**

- Completed: 0
- In Progress: 0
- Blocked: 0
- Remaining: 42

**Quality Indicators:**

- Build failures: 0
- Rollbacks: 0
- Blocked days: 0

## Accumulated Context

### Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Cross-platform arb disabled until Phase 3 | Settlement divergence risk too high with $500 capital | 2026-01-29 |
| Human-in-the-loop alerts only | 75%+ of traders lose money with full automation | 2026-01-29 |
| WhatsApp as primary interface | User preference, enables reply-for-analysis workflow | 2026-01-29 |
| 5% fee threshold for alerts | Edges <5% eaten by fees (research-backed) | 2026-01-29 |
| Build order: Data -> Scoring -> Detection | Must validate pipeline before complex edge sources | 2026-01-29 |
| INSERT OR IGNORE for snapshot duplicates | Idempotent inserts simplify retry logic in API clients | 2026-01-29 |
| Transaction batching for bulk inserts | 10-100x speedup for batch snapshot storage | 2026-01-29 |
| INTEGER timestamps in SQLite | More efficient than ISO strings for range queries | 2026-01-29 |
| ES2022 target with ESNext modules | Modern Node.js support, better tree-shaking | 2026-01-29 |
| 50% safety margin on rate limits | Prevent API bans (research-backed) | 2026-01-29 |
| Full jitter on exponential backoff | Prevent thundering herd on retries | 2026-01-29 |
| Kalshi credentials required in env | Core data source for cross-platform matching | 2026-01-29 |
| KALSHI_USE_DEMO flag for demo API | Enables testing without production credentials | 2026-01-29 |
| Kalshi prices normalized (cents to 0-1) | Match Polymarket format for downstream comparison | 2026-01-29 |
| Use ethers v5 wallet for CLOB client | CLOB client type compatibility | 2026-01-29 |
| Lazy CLOB client initialization | Allow market fetch without auth; order book needs it | 2026-01-29 |
| 50% Jaccard threshold for keyword matches | Prevents false positives from shared common words | 2026-01-29 |
| 7-day max difference for close dates | Markets often have slightly different resolution dates | 2026-01-29 |
| 0.7 minimum confidence for matches | Balances precision vs recall for cross-platform matching | 2026-01-29 |
| 15-minute interval for data collection | Balance API quota vs data freshness | 2026-01-29 |
| 30-minute interval for market matching | Reduce computation overhead | 2026-01-29 |
| $500 liquidity threshold for order books | Focus on liquid markets only | 2026-01-29 |
| Worker threads via Bree | Isolation prevents job failures from crashing scheduler | 2026-01-29 |
| Default fees: Poly 2%, Kalshi 7% | Standard trading fees for edge calculation | 2026-01-29 |
| 10% minimum net edge for cross-platform arb | Must cover 9% fees + settlement risk buffer | 2026-01-29 |
| 30-minute max snapshot age | Stale prices lead to false arbitrage opportunities | 2026-01-29 |
| Feature flag pattern for gated features | Safe enablement of risky features after dependencies met | 2026-01-29 |
| PM2 with graceful 5s shutdown | Allows in-flight requests to complete before restart | 2026-01-29 |
| Rsync excludes planning docs | Keep development artifacts off production VPS | 2026-01-29 |
| chmod 600 for .env on VPS | Script enforces secure permissions on credentials | 2026-01-29 |
| Confidence threshold < 0.1 returns 0 | Confidence of exactly 0.10 can still bet (1% position with 20% edge) | 2026-02-02 |
| Round positionPercent to 4 decimals | Avoid floating-point precision issues in Kelly calculation | 2026-02-02 |
| 5% minimum net edge threshold | $0.05 profit minimum on $100 trade covers execution overhead | 2026-02-02 |
| Weighted average scoring | Configurable weights allow tuning without code changes | 2026-02-02 |
| Pure functions for scoring factors | Testability, predictability, no side effects | 2026-02-02 |
| Reset expired dedup entries on re-record | When window expires, treat as new opportunity to allow re-alerting | 2026-02-02 |
| Double-check feature flag at aggregator level | Even if detector has own check, aggregator must also verify for safety | 2026-02-02 |
| Hash key = type:platform:marketId | Ignore fluctuating edge values; same market+type = duplicate | 2026-02-02 |
| UNIQUE(opportunity_id, detected_at) | Same opportunity detected at different times creates separate rows for history | 2026-02-02 |
| Kelly position sizing in detection job | Uses BANKROLL env var; allows different bankroll configs without code changes | 2026-02-02 |
| MIN_SCORE=5 default threshold | Only persist opportunities scoring 5+; reduces database noise | 2026-02-02 |
| Use standard react-jsx without jsxImportSource | Ink v6 uses React's standard JSX runtime, not a custom one | 2026-02-02 |
| scoreOpportunity accepts bankroll parameter | Integrated Kelly criterion position sizing into composite scorer | 2026-02-02 |
| Use string-similarity for settlement text comparison | Deprecated but functional; can migrate if issues arise | 2026-02-04 |
| Use chrono-node for date extraction | Robust NLP-based date parsing from resolution text | 2026-02-04 |
| Track settlement outcomes for divergence rate | Historical data enables confidence threshold tuning | 2026-02-04 |
| Support manual overrides for settlement safety | Human verification can override automated comparison | 2026-02-04 |
| Filter sentence starters from entity extraction | Prevents false positives like "Will Elon Musk" instead of "Elon Musk" | 2026-02-04 |
| Prioritize specific data source patterns | "official data from" before "based on" for more precise extraction | 2026-02-04 |
| Use latest parsed date as resolution date fallback | When structured date field missing, NLP-extracted dates provide fallback | 2026-02-04 |
| Map Kalshi strike types to scalar settlement type | greater/less/between indicate scalar markets vs binary Yes/No | 2026-02-04 |
| Weight criteria highest (0.4) in similarity scoring | Research shows rule text most predictive of settlement divergence | 2026-02-04 |
| Conservative Phase 3.1 thresholds for arbitrage safety | overall >= 0.9, criteria >= 0.7, timing >= 0.5; no risk factors | 2026-02-04 |
| Linear timing decay over 14 days | 0 days = 1.0, 7 days = 0.5, 14+ days = 0.0 similarity | 2026-02-04 |
| Check manual override before calculating similarity | Database lookup optimization - skip calculation if override exists | 2026-02-04 |
| Flag subjective keywords as risk factors | 'reasonable', 'consensus', 'mainstream' indicate resolution ambiguity | 2026-02-04 |
| Date difference > 7 days flagged as risk | Markets resolving >1 week apart likely measure different things | 2026-02-04 |
| Data source similarity < 0.8 flagged as risk | Different data sources can resolve differently for same question | 2026-02-04 |
| Use Zod validation for Metaculus API types | Matches existing pattern in market.ts and settlement.ts | 2026-02-04 |
| Create separate manual matches file for Metaculus | Follows same pattern as MarketMatcher's manual-matches.json | 2026-02-04 |
| Keep metaculusDivergence flag disabled until Phase 4 complete | Wait until all Metaculus plans executed and tested | 2026-02-04 |
| axios-retry with exponentialDelay for Metaculus | Built-in jitter prevents thundering herd on retries | 2026-02-04 |
| 5 retries on 429 and network errors | Aggressive retry balances API reliability with eventual failure | 2026-02-04 |
| 30-second timeout for Metaculus API | Longer than typical clients; Metaculus can be slow on search | 2026-02-04 |
| 0.8 confidence threshold for Metaculus matching | Higher than cross-platform (0.7) due to technical question specificity | 2026-02-04 |
| Linear timing decay over 14 days for Metaculus | Questions >2 weeks apart likely measure different events | 2026-02-04 |
| Weighted similarity: title 50%, description 30%, timing 20% | Title most reliable signal, timing prevents temporal mismatches | 2026-02-04 |
| Default 0.5 description similarity for Metaculus | Markets lack detailed descriptions, neutral score avoids penalizing matches | 2026-02-04 |
| Manual Metaculus matches take absolute precedence | Human curation more reliable than algorithmic for edge cases | 2026-02-04 |
| Binary Metaculus questions only | Numeric/date/multiple choice have different semantics from Yes/No markets | 2026-02-04 |
| 5% minimum divergence for Metaculus opportunities | Smaller edges likely eaten by fees and slippage | 2026-02-04 |
| 7-day freshness threshold for Metaculus forecasts | Predictions >7 days old trigger staleness warnings | 2026-02-04 |
| Manual day calculation without date-fns | Avoid adding dependency for simple date arithmetic | 2026-02-04 |
| Sort divergence opportunities by percent descending | Highest divergences = highest priority for user review | 2026-02-04 |
| Lazy initialization for MetaculusDivergenceDetector | Avoid token requirement during aggregator construction; allows tests to run | 2026-02-04 |
| Fresh forecasts get 0.9 confidence, stale 0.6 | Staleness affects scoring weight via detector confidence | 2026-02-04 |
| metaculusDivergence feature flag enabled | Phase 4 complete, full Metaculus integration active | 2026-02-04 |
| Helper function pattern for type-safe unknown extraction | getMetaculusRaw() pattern avoids TypeScript unknown-in-JSX errors | 2026-02-04 |
| Staleness thresholds: <7d green, 7-14d yellow, >14d red | Visual indicator for forecast freshness in dashboard | 2026-02-04 |

### Active Constraints

**Capital:**

- $500 starting capital (impacts position sizing, risk tolerance)
- 5-10% max per trade (Kelly fractional for safety)

**APIs:**

- Polymarket CLOB: 60 orders/min, 3,500/10s burst
- Polymarket Data: 200 requests/10s
- Kalshi rate limits: TBD (test in Phase 1)
- Metaculus API: Verified working with METACULUS_TOKEN

**Safety Gates:**

- EDGE-02 (cross-platform arb) stays disabled until EDGE-07 (settlement parser) operational
- EDGE-06 (whale tracking) requires on-chain infrastructure (Phase 6)

### Todos & Blockers

**Immediate Todos:**

- [x] Plan Phase 1 execution
- [x] Plan Phase 2 execution
- [x] Test Metaculus API integration
- [ ] Verify Polymarket API key access
- [ ] Verify Kalshi API key access
- [ ] Set up VPS environment (Hetzner 2 vCPU / 8GB RAM) - BLOCKING 01-09 Tasks 2-3
- [ ] Create hot wallet for CLOB auth ($1-5 gas only) - BLOCKING 01-09 Tasks 2-3
- [x] Test dashboard: npm run dashboard

**Known Blockers:**

- 01-09 Tasks 2-3 blocked on VPS provisioning and hot wallet creation

**Research Needed During Planning:**

- Phase 3: Settlement rule extraction methodology (Polymarket UMA oracle vs Kalshi resolution)
- Phase 4: Metaculus superforecaster API endpoint verification - VERIFIED WORKING

### Patterns & Anti-Patterns

**Working Well:**

- Research-driven roadmap (pitfall prevention built into phases)
- Explicit safety gates (disabled features until dependencies met)
- Observable success criteria (no implementation tasks, only user behaviors)
- Graceful error handling (one detector failure doesn't crash aggregation)
- Helper function pattern for type-safe raw extraction (getMetaculusRaw, getSettlementForOpportunity)

**Watch Out For:**

- API rate limiting (implement shared limiter in Phase 1)
- Wash trading volume inflation (use order book depth, not 24h volume)
- Settlement rule divergence (highest severity risk for cross-platform arb)
- Alert fatigue (deduplication critical in Phase 2) - NOW IMPLEMENTED

### Notes

**From Research:**

- Polycule bot hacked for $230K (Jan 2026) due to reversible key storage -> INFR-02 critical
- Sports bot made $8M exploiting time lag -> we can't compete on speed with $500 capital
- Columbia study: 25-60% of Polymarket volume is wash trading -> use order book depth exclusively
- Cross-platform arb extracted $40M+ in 2024-2025 but settlement divergence causes double losses

**Phase Rationale:**

- Phase 1-2: Table stakes (data collection, scoring, alerts)
- Phase 3: Critical safety feature (settlement verification before enabling arb)
- Phase 4-5: Competitive differentiators (Metaculus divergence, longshot bias)
- Phase 6: Optimization and on-chain infrastructure

## Session Continuity

**Last Session:** 2026-07-01T22:09:36.451Z

- Completed 04-06-PLAN.md (Dashboard MetaculusView)
  - Created MetaculusView component with staleness color coding
  - Integrated into OpportunityDetail with type-safe helper
  - Verified API integration working with live Metaculus data
  - 401 total tests passing

**Phase 3 Complete:**

- 03-01: Settlement types + database schema
- 03-02: Platform-specific parsers (Polymarket, Kalshi)
- 03-03: Settlement comparator with TDD (26 tests)
- 03-04: Detector integration + feature flag enablement
- 03-05: Dashboard settlement view

**Phase 4 Complete:**

- 04-01: ✅ Metaculus foundation types
- 04-02: ✅ Metaculus API client
- 04-03: ✅ Question-to-market matcher
- 04-04: ✅ Metaculus divergence detector
- 04-05: ✅ Aggregator/Scoring integration
- 04-06: ✅ Dashboard MetaculusView

**Resume Point:** Ready for Phase 5 (Longshot bias detection)

**Next Session Should:**

- Plan Phase 5 if continuing
- Monitor Metaculus divergence opportunities for FP rate assessment
- Consider periodic review of match quality once sufficient data accumulated

**Outstanding from Phase 1:**

- VPS provisioning still pending (01-09 Tasks 2-3)
- Hot wallet creation still pending

---

*State tracking started: 2026-01-29*
