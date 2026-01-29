# Project State: Prediction Market Edge Scanner

**Last Updated:** 2026-01-29T20:47:47Z
**Project Started:** 2026-01-29

## Project Reference

**Core Value:** Surface high-confidence mispricings where analysis shows the market is wrong, filtered so only quality opportunities reach the user.

**Current Focus:** Phase 1 - Data Foundation & Infrastructure

**Tech Stack:**
- Node.js 20+ & TypeScript 5.5+
- SQLite (better-sqlite3) for market snapshots
- Polymarket CLOB client (official package)
- Kalshi REST API
- Twilio WhatsApp API
- Bree scheduler, Pino logger, Zod validation

## Current Position

**Phase:** 1 of 6 (Data Foundation & Infrastructure)
**Plan:** 2 of 5 complete
**Status:** In progress
**Last activity:** 2026-01-29 - Completed 01-02-PLAN.md (SQLite Database Layer)

**Progress Bar:**
```
Phase 1: Data Foundation & Infrastructure
[████░░░░░░░░░░░░░░░░] 15% (2/13 requirements)

Overall Roadmap:
[█░░░░░░░░░░░░░░░░░░░] 5% (2/42 requirements)
```

**What's Next:**
- Execute 01-03-PLAN.md (Polymarket CLOB Client)
- Execute 01-04-PLAN.md (Kalshi REST Client)
- Execute 01-05-PLAN.md (Scheduler & Logging)

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
- [ ] Plan Phase 1 execution
- [ ] Verify Polymarket API key access
- [ ] Verify Kalshi API key access
- [ ] Set up VPS environment (Hetzner 2 vCPU / 8GB RAM)
- [ ] Configure Twilio WhatsApp sandbox for testing

**Known Blockers:**
- None currently

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

**Last Session:** 2026-01-29T20:47:47Z
- Completed 01-01-PLAN.md (Project Foundation)
- Logger with error serialization, rate limiter with exponential backoff
- Commits: af76d17 (init), 595f145 (logger), 3283021 (blocking fix)

**Resume Point:** 01-02-PLAN.md (SQLite Database Layer)

**Next Session Should:**
- Execute 01-02-PLAN.md (SQLite Database Layer)
- Execute 01-03-PLAN.md (Polymarket CLOB Client)
- Verify Polymarket API key access

---

*State tracking started: 2026-01-29*
