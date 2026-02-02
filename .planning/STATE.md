# Project State: Prediction Market Edge Scanner

**Last Updated:** 2026-02-02T16:06:30Z
**Project Started:** 2026-01-29

## Project Reference

**Core Value:** Surface high-confidence mispricings where analysis shows the market is wrong, filtered so only quality opportunities reach the user.

**Current Focus:** Phase 2 - Scoring & Alert Foundation

**Tech Stack:**
- Node.js 20+ & TypeScript 5.5+
- SQLite (better-sqlite3) for market snapshots
- Polymarket CLOB client (official package)
- Kalshi REST API
- Twilio WhatsApp API
- Bree scheduler, Pino logger, Zod validation

## Current Position

**Phase:** 2 of 6 (Scoring & Alert Foundation)
**Plan:** 1 of 5 complete
**Status:** In progress
**Last activity:** 2026-02-02 - Completed 02-01-PLAN.md (Scoring Engine with TDD)

**Progress Bar:**
```
Phase 1: Data Foundation & Infrastructure
[████████████████████] 100% (10/10 plans)

Phase 2: Scoring & Alert Foundation
[████░░░░░░░░░░░░░░░░] 20% (1/5 plans)

Overall Roadmap:
[███████████░░░░░░░░░] 26% (11/42 requirements)
```

**What's Next:**
- Complete 02-03 (Alert System)
- Complete 02-04 (CLI Dashboard)
- Complete 02-05 (WhatsApp Integration)

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
| Build order: Data → Scoring → Detection | Must validate pipeline before complex edge sources | 2026-01-29 |
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

### Active Constraints

**Capital:**
- $500 starting capital (impacts position sizing, risk tolerance)
- 5-10% max per trade (Kelly fractional for safety)

**APIs:**
- Polymarket CLOB: 60 orders/min, 3,500/10s burst
- Polymarket Data: 200 requests/10s
- Kalshi rate limits: TBD (test in Phase 1)
- Metaculus API access: TBD (verify superforecaster endpoint exists)

**Safety Gates:**
- EDGE-02 (cross-platform arb) stays disabled until EDGE-07 (settlement parser) operational
- EDGE-06 (whale tracking) requires on-chain infrastructure (Phase 6)

### Todos & Blockers

**Immediate Todos:**
- [x] Plan Phase 1 execution
- [ ] Verify Polymarket API key access
- [ ] Verify Kalshi API key access
- [ ] Set up VPS environment (Hetzner 2 vCPU / 8GB RAM) - BLOCKING 01-09 Tasks 2-3
- [ ] Create hot wallet for CLOB auth ($1-5 gas only) - BLOCKING 01-09 Tasks 2-3
- [ ] Configure Twilio WhatsApp sandbox for testing

**Known Blockers:**
- 01-09 Tasks 2-3 blocked on VPS provisioning and hot wallet creation

**Research Needed During Planning:**
- Phase 3: Settlement rule extraction methodology (Polymarket UMA oracle vs Kalshi resolution)
- Phase 4: Metaculus superforecaster API endpoint verification

### Patterns & Anti-Patterns

**Working Well:**
- Research-driven roadmap (pitfall prevention built into phases)
- Explicit safety gates (disabled features until dependencies met)
- Observable success criteria (no implementation tasks, only user behaviors)

**Watch Out For:**
- API rate limiting (implement shared limiter in Phase 1)
- Wash trading volume inflation (use order book depth, not 24h volume)
- Settlement rule divergence (highest severity risk for cross-platform arb)
- Alert fatigue (deduplication critical in Phase 2)

### Notes

**From Research:**
- Polycule bot hacked for $230K (Jan 2026) due to reversible key storage → INFR-02 critical
- Sports bot made $8M exploiting time lag → we can't compete on speed with $500 capital
- Columbia study: 25-60% of Polymarket volume is wash trading → use order book depth exclusively
- Cross-platform arb extracted $40M+ in 2024-2025 but settlement divergence causes double losses

**Phase Rationale:**
- Phase 1-2: Table stakes (data collection, scoring, alerts)
- Phase 3: Critical safety feature (settlement verification before enabling arb)
- Phase 4-5: Competitive differentiators (Metaculus divergence, longshot bias)
- Phase 6: Optimization and on-chain infrastructure

## Session Continuity

**Last Session:** 2026-02-02T16:06:30Z
- Completed 02-01-PLAN.md (Scoring Engine with TDD)
- TDD cycle: RED (478c3ff) -> GREEN (85ad44e) -> REFACTOR (cee7927)
- 71/71 scoring tests passing, 227 total tests passing
- Files created: src/scoring/*.ts, tests/scoring.test.ts

**Resume Point:** Continue Phase 2 (02-02 Kelly Position Sizing)

**Next Session Should:**
- Execute 02-02-PLAN.md (Kelly Criterion Position Sizing)
- Execute 02-03-PLAN.md (Alert System)
- Execute 02-04-PLAN.md (CLI Dashboard)

**Outstanding from Phase 1:**
- VPS provisioning still pending (01-09 Tasks 2-3)
- Hot wallet creation still pending

---

*State tracking started: 2026-01-29*
