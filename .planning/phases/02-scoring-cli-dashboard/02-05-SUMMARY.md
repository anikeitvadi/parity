---
phase: 02-scoring-cli-dashboard
plan: 05
subsystem: scheduler
tags:
  - bree
  - sqlite
  - opportunities
  - persistence
  - scheduling
dependency-graph:
  requires:
    - 01-05 (database schema)
    - 02-01 (scoring engine)
    - 02-02 (Kelly criterion)
    - 02-03 (opportunity aggregator)
  provides:
    - opportunities table in database
    - opportunity persistence queries
    - scheduled opportunity detection (30min interval)
  affects:
    - 02-04 (CLI dashboard can read from database)
    - future analytics/reporting
tech-stack:
  added: []
  patterns:
    - Bree worker job pattern
    - Transaction batching for bulk inserts
    - INSERT OR IGNORE for idempotent persistence
key-files:
  created:
    - src/jobs/detect-opportunities.ts
  modified:
    - src/database/schema.ts
    - src/database/queries.ts
    - src/index.ts
    - tests/database.test.ts
decisions:
  - key: "UNIQUE(opportunity_id, detected_at)"
    rationale: "Same opportunity can be detected multiple times; track each detection separately"
  - key: "Kelly position sizing in job"
    rationale: "Position sizing uses environment BANKROLL variable, calculated at detection time"
  - key: "MIN_SCORE=5 default threshold"
    rationale: "Only persist opportunities worth acting on; reduces database noise"
metrics:
  duration: "~10 minutes"
  completed: 2026-02-02
---

# Phase 02 Plan 05: Scheduled Detection & Persistence Summary

**One-liner:** Bree worker job detects opportunities every 30 minutes, scores them, applies Kelly position sizing, and persists high-quality ones to SQLite.

## What Was Built

### 1. Opportunities Database Table

Added `opportunities` table to schema with:
- Full opportunity data (type, platform, market_id, question)
- Edge metrics (gross_edge, net_edge)
- Scoring (score, score_breakdown as JSON)
- Position sizing (position_size, position_percent)
- Timestamps (detected_at, created_at)
- Indexes on detected_at, score, type for efficient queries
- UNIQUE constraint on (opportunity_id, detected_at) prevents exact duplicates

### 2. Opportunity Persistence Queries

Four new query functions in `src/database/queries.ts`:
- `insertOpportunity()`: Single insert with INSERT OR IGNORE
- `insertOpportunities()`: Transaction-batched bulk insert (10-100x faster)
- `getRecentOpportunities(minScore, limit, hoursBack)`: Query with filtering
- `getOpportunityStats()`: Aggregate stats (total, byType, avgScore)

### 3. Detection Worker Job

New `src/jobs/detect-opportunities.ts`:
- Runs OpportunityAggregator to collect from all detectors
- Scores using CompositeScorer (default weights)
- Calculates position sizing via Kelly criterion with BANKROLL env var
- Filters by MIN_SCORE threshold (default: 5)
- Persists qualifying opportunities to database
- Reports success/failure to Bree via parentPort

### 4. Bree Registration

Updated `src/index.ts` to include detect-opportunities job:
- 30-minute interval
- 10-minute timeout
- Worker thread isolation

## Key Files

| File | Lines Added | Purpose |
|------|-------------|---------|
| `src/database/schema.ts` | 29 | opportunities table DDL |
| `src/database/queries.ts` | 143 | Opportunity CRUD queries |
| `src/jobs/detect-opportunities.ts` | 131 | Bree worker job |
| `src/index.ts` | 5 | Job registration |
| `tests/database.test.ts` | 160 | 10 new opportunity tests |

## Commits

| Hash | Message |
|------|---------|
| `3848bd3` | feat(02-05): add opportunities table to database schema |
| `68c1550` | feat(02-05): add opportunity persistence queries |
| `0fd9a34` | feat(02-05): add scheduled opportunity detection job |

## Decisions Made

1. **UNIQUE(opportunity_id, detected_at)**: Same opportunity detected at different times creates separate rows. This preserves detection history and allows tracking opportunity evolution.

2. **Kelly in job, not scorer**: The CompositeScorer returns placeholder position sizing (0, 0). The job applies Kelly criterion using the BANKROLL environment variable. This separation allows different bankroll configurations without code changes.

3. **MIN_SCORE=5 default**: Only opportunities scoring 5+ are persisted. This reduces database size and focuses on actionable opportunities. Can be overridden via environment variable.

4. **score_breakdown as JSON**: Stores the full ScoreBreakdown object as JSON string. Allows future analysis of scoring factors without schema changes.

## Test Coverage

10 new tests added covering:
- Single opportunity insert and retrieval
- Duplicate handling (INSERT OR IGNORE)
- Score breakdown JSON storage
- Batch insert performance (<100ms for 100 records)
- getRecentOpportunities filtering by score and hoursBack
- Ordering by detected_at DESC, score DESC
- getOpportunityStats aggregation
- Empty database edge cases

Total: 260 tests passing (26 database tests)

## Verification

- [x] Database initializes with opportunities table
- [x] All 26 database tests pass
- [x] All 260 project tests pass
- [x] detect-opportunities job compiles without errors
- [x] Job registered in Bree scheduler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scoreOpportunity signature**
- **Found during:** Task 3
- **Issue:** Plan assumed `scoreOpportunity(opp, BANKROLL)` but actual signature is `scoreOpportunity(opp, weights?)`
- **Fix:** Use `scoreOpportunity(opp)` for scoring, then `calculateKelly()` separately for position sizing
- **Files modified:** src/jobs/detect-opportunities.ts
- **Commit:** 0fd9a34

## Next Phase Readiness

**Dependencies Met:**
- [x] Opportunity persistence for TRCK-01
- [x] Query functions for dashboard
- [x] Scheduled detection running

**Ready to Enable:**
- Dashboard can now pull from database OR live detection
- Historical analysis possible via getRecentOpportunities
- Stats aggregation via getOpportunityStats

## Usage

```bash
# Start scheduler (includes detect-opportunities)
npm run dev

# Or run detection manually for testing
npx tsx src/jobs/detect-opportunities.ts

# Query stored opportunities
sqlite3 markets.db "SELECT type, score, market_question FROM opportunities ORDER BY score DESC LIMIT 10;"
```

Environment variables:
- `BANKROLL`: Trading capital in USD (default: 500)
- `MIN_SCORE`: Minimum score threshold (default: 5)
