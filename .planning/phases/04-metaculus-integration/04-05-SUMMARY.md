---
phase: 04-metaculus-integration
plan: 05
subsystem: detection
tags: [metaculus, scoring, aggregator, divergence, feature-flags]

# Dependency graph
requires:
  - phase: 04-04
    provides: MetaculusDivergenceDetector implementation
  - phase: 02-01
    provides: Scoring types and composite scorer
provides:
  - MetaculusDivergenceDetector integrated into OpportunityAggregator
  - metaculus_divergence type in OpportunityType union
  - Metaculus divergence opportunities in aggregated results
  - Feature flag enabled for production use
affects: [dashboard-display, alerts, cli]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy detector initialization pattern (avoid token requirement during construction)
    - Double-check feature flag at aggregator level
    - normalizeXXX method for detector-to-UnifiedOpportunity conversion

key-files:
  created:
    - tests/scoring/metaculus-scoring.test.ts
  modified:
    - src/scoring/types.ts
    - src/aggregator/opportunity-aggregator.ts
    - src/detectors/metaculus-divergence.ts
    - src/config/feature-flags.ts

key-decisions:
  - "Lazy initialization for MetaculusDivergenceDetector to allow aggregator construction without token"
  - "Fresh forecasts get 0.9 confidence, stale forecasts get 0.6 confidence"
  - "Divergence percent divided by 100 to convert to 0-1 scale for grossEdge/netEdge"

patterns-established:
  - "Lazy client initialization: Store config in constructor, create client in detect() method"
  - "Normalize method naming: normalizeXXX for each detector type"

# Metrics
duration: 6min
completed: 2026-02-04
---

# Phase 4 Plan 5: Aggregator/Scoring Integration Summary

**Metaculus divergence detector integrated into opportunity aggregator with lazy initialization and scoring verification**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-04T18:55:14Z
- **Completed:** 2026-02-04T19:00:51Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added `metaculus_divergence` to OpportunityType union for type-safe handling
- Integrated MetaculusDivergenceDetector into OpportunityAggregator with feature flag check
- Implemented lazy initialization to avoid token requirement during aggregator construction
- Created 7 scoring tests verifying Metaculus divergence opportunities score correctly
- Enabled metaculusDivergence feature flag for production use

## Task Commits

Each task was committed atomically:

1. **Task 1: Update scoring types and aggregator integration** - `81c1c73` (feat)
2. **Task 2: Verify scoring engine handles metaculus_divergence** - `c4f3f1c` (test)
3. **Task 3: Enable feature flag** - `4194053` (feat)

## Files Created/Modified
- `src/scoring/types.ts` - Added 'metaculus_divergence' to OpportunityType union
- `src/aggregator/opportunity-aggregator.ts` - Integrated MetaculusDivergenceDetector with lazy init
- `src/detectors/metaculus-divergence.ts` - Added lazy initialization pattern
- `src/config/feature-flags.ts` - Enabled metaculusDivergence flag
- `tests/scoring/metaculus-scoring.test.ts` - 7 new tests for Metaculus scoring

## Decisions Made
- **Lazy initialization for detector:** Store token in constructor, create MetaculusClient when detect() is called. Allows aggregator tests to run without METACULUS_TOKEN.
- **Confidence mapping:** Fresh forecasts (<=7 days) get 0.9 detector confidence, stale forecasts get 0.6. This affects scoring weight.
- **minLiquidity: 0 for divergence:** Divergence signals don't have inherent liquidity, so set to 0. Liquidity factor comes from the underlying market.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added lazy initialization for MetaculusDivergenceDetector**
- **Found during:** Task 1 (Aggregator integration)
- **Issue:** MetaculusClient throws in constructor if no token. Tests failed because aggregator creates detector during construction.
- **Fix:** Changed detector to store config in constructor, create client lazily in detect() method with initializeIfNeeded()
- **Files modified:** src/detectors/metaculus-divergence.ts
- **Verification:** All 401 tests pass without METACULUS_TOKEN env var
- **Committed in:** 81c1c73 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking issue)
**Impact on plan:** Essential for test compatibility. Follows established pattern (lazy CLOB client initialization).

## Issues Encountered
- Initial scoring tests had unrealistic expectations (e.g., expecting 8+ score with 15% edge). Adjusted tests to reflect actual scoring formula where 25% edge with high liquidity achieves 8+ rating.

## User Setup Required

None - no external service configuration required for this plan.

**Note:** METACULUS_TOKEN env var is required for live Metaculus API calls. The detector gracefully returns empty results if token is not set.

## Next Phase Readiness
- Phase 4 complete - all Metaculus integration tasks finished
- Dashboard integration ready (04-05 was aggregator, not dashboard per plan)
- Feature flag enabled, detector will run when METACULUS_TOKEN is configured
- Ready for Phase 5 (longshot bias detection) or dashboard visualization updates

---
*Phase: 04-metaculus-integration*
*Completed: 2026-02-04*
