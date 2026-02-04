---
phase: 04-metaculus-integration
plan: 04
subsystem: edge-detection
tags: [metaculus, divergence-detection, tdd, superforecasters, feature-flags]

# Dependency graph
requires:
  - phase: 04-01
    provides: MetaculusDivergenceOpportunity types and ForecastStaleness types
  - phase: 04-02
    provides: MetaculusClient for API access
  - phase: 04-03
    provides: MetaculusMatcher for question-to-market pairing
provides:
  - MetaculusDivergenceDetector class implementing detector pattern
  - Divergence calculation with configurable threshold (default 5%)
  - Forecast staleness tracking with age-based warnings
  - Feature flag gating for safe rollout
affects: [04-05-dashboard-integration, 02-03-opportunity-aggregator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD red-green-refactor cycle for detector implementation"
    - "Feature flag gating as first check in detect() method"
    - "Manual day calculation (no date-fns dependency added)"
    - "Configurable threshold pattern (minDivergence parameter)"

key-files:
  created:
    - src/detectors/metaculus-divergence.ts
    - tests/detectors/metaculus-divergence.test.ts
  modified: []

key-decisions:
  - "5% default minimum divergence threshold (absolute percentage difference)"
  - "7-day staleness threshold (forecasts >7 days trigger warnings)"
  - "Feature flag check happens FIRST before any API calls"
  - "Sort results by divergence percentage descending"
  - "Manual day calculation instead of adding date-fns dependency"
  - "Skip questions without community_prediction rather than error"

patterns-established:
  - "TDD for detector logic: 19 tests written before implementation"
  - "Comprehensive mocking: MetaculusClient and MetaculusMatcher fully mocked in tests"
  - "Staleness warning tiers: 7-14 days (caution), 14-28 days (outdated), 28+ days (likely outdated)"
  - "Private helper methods for reusable logic (calculateDivergence, checkStaleness, daysBetween)"

# Metrics
duration: 5min
completed: 2026-02-04
---

# Phase 04 Plan 04: Metaculus Divergence Detector Summary

**Detector identifies >5% divergences between superforecaster consensus and market prices with staleness tracking**

## Performance

- **Duration:** 5 minutes (296 seconds)
- **Started:** 2026-02-04T18:45:59Z
- **Completed:** 2026-02-04T18:50:52Z
- **Tasks:** 3 (TDD cycle: RED → GREEN → REFACTOR)
- **Files modified:** 2 created
- **Tests added:** 19 new tests (394 total passing, up from 375)

## Accomplishments

- MetaculusDivergenceDetector class implementing full detector pattern
- TDD implementation: comprehensive test suite before any production code
- Configurable divergence threshold (default 5%, can override in constructor)
- Forecast staleness detection with age-based warnings (>7 days)
- Feature flag gating (metaculusDivergence) as first check
- Sorts opportunities by divergence percentage descending
- Skips questions without community_prediction gracefully
- Manual day calculation implementation (avoided adding date-fns dependency)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED - Write failing tests** - `ab0db95` (test)
   - 19 comprehensive test cases for divergence detection
   - Tests for feature flag, divergence calculation, staleness tracking
   - Mock MetaculusClient and MetaculusMatcher to isolate detector logic
   - Tests for custom threshold support

2. **Task 2: GREEN - Implement to pass tests** - `f4af128` (feat)
   - MetaculusDivergenceDetector class with detect() method
   - calculateDivergence, checkStaleness, extractMarketPrice, daysBetween helpers
   - Feature flag check as first operation
   - All 19 tests passing

3. **Task 3: REFACTOR - Clean up and document** - `bae3d9e` (refactor)
   - Enhanced module-level documentation
   - Extract MAX_QUESTIONS_LIMIT constant
   - Improved comments for clarity
   - All 394 tests still passing

## Files Created/Modified

- `src/detectors/metaculus-divergence.ts` - MetaculusDivergenceDetector class with divergence calculation, staleness tracking, feature flag gating
- `tests/detectors/metaculus-divergence.test.ts` - 19 unit tests covering all detection logic, staleness thresholds, sorting

## Decisions Made

**1. 5% default divergence threshold**
- Rationale: Smaller edges (<5%) likely eaten by fees and slippage
- Configurable via constructor for testing different thresholds
- Absolute percentage difference (|metaculus - market| * 100)

**2. 7-day staleness threshold with tiered warnings**
- ≤7 days: isFresh = true, no warning
- 7-14 days: "use with caution"
- 14-28 days: "may be outdated"
- 28+ days: "likely outdated"
- Rationale: Superforecaster predictions can shift significantly over 1-2 weeks as new information emerges

**3. Feature flag check as first operation**
- Pattern follows cross-platform-arb.ts
- Returns empty array immediately if disabled
- Prevents unnecessary API calls and processing

**4. Manual day calculation instead of date-fns**
- Rationale: Avoid adding new dependency for simple calculation
- daysBetween() helper method: Math.floor((date2 - date1) / MS_PER_DAY)
- Tests verify correctness across multiple day ranges

**5. Skip questions without community_prediction**
- Rationale: Cannot calculate divergence without Metaculus prediction
- Log debug message but continue processing other questions
- Prevents entire detection run from failing on incomplete data

**6. Sort results by divergence descending**
- Rationale: Highest divergences are highest priority opportunities
- Matches pattern from cross-platform-arb detector
- Enables dashboard to show best opportunities first

## Deviations from Plan

None - plan executed exactly as written. TDD cycle completed successfully.

## Issues Encountered

**1. date-fns dependency missing**
- Problem: Imported `differenceInDays` from date-fns but package not installed
- Solution: Implemented manual day calculation in `daysBetween()` helper method
- Outcome: Avoided adding new dependency, tests verify calculation accuracy

**2. Mock constructor pattern in tests**
- Problem: Initial mock using `vi.fn().mockImplementation()` not recognized as constructor
- Solution: Changed to class-based mock: `MetaculusClient: class { searchQuestions = vi.fn() }`
- Outcome: Tests properly instantiate detector with mocked dependencies

## User Setup Required

None - detector uses existing MetaculusClient and MetaculusMatcher infrastructure.

## Next Phase Readiness

**Ready for Phase 04-05 (Dashboard Integration):**
- MetaculusDivergenceDetector implements standard detector pattern
- Returns MetaculusDivergenceOpportunity[] matching aggregator expectations
- Includes all fields needed for display (divergencePercent, forecastAge, stalenessWarning)
- Feature flag gating allows safe gradual rollout

**Ready for Phase 02-03 (Opportunity Aggregator):**
- Detector can be integrated into aggregator alongside cross-platform-arb
- Follows same error handling pattern (try/catch, return empty array on error)
- Logs summary statistics (opportunities found, questions checked, matches found)

**Feature Flag Status:**
- `featureFlags.metaculusDivergence` currently set to `false`
- Should remain disabled until Phase 04 complete and API integration tested
- Enable after dashboard integration (04-05) to test end-to-end

**Next Steps:**
- 04-05: Integrate MetaculusDivergenceDetector into dashboard
- 02-03: Add to opportunity aggregator (when feature flag enabled)
- Test with live Metaculus API once credentials configured

---
*Phase: 04-metaculus-integration*
*Completed: 2026-02-04*
