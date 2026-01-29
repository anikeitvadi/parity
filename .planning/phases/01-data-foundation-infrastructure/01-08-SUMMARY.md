---
phase: 01-data-foundation-infrastructure
plan: 08
subsystem: detection
tags: [arbitrage, multi-outcome, fee-calculation, tdd, polymarket, kalshi]

# Dependency graph
requires:
  - phase: 01-05
    provides: Cross-platform market matcher for data
  - phase: 01-06
    provides: Job scheduler for detection timing
provides:
  - MultiOutcomeArbDetector class for single-platform arbitrage detection
  - ArbOpportunity type for opportunity reporting
  - Fee calculation utilities (calculateTotalFees, calculateNetEdge, calculateBuyEdge, calculateSellEdge)
  - Near-miss tracking for edge monitoring
affects: [01-09, 02-scoring, phase-2-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD workflow (RED-GREEN-REFACTOR)
    - Extracted fee calculation utilities for reuse
    - Near-miss logging for monitoring

key-files:
  created:
    - src/detectors/multi-outcome-arb.ts
    - tests/multi-outcome-arb.test.ts
  modified:
    - src/utils/logger.ts

key-decisions:
  - "Skip binary markets (2 outcomes) - handled by correlated detector"
  - "Fee formula: outcomeCount * feePercent (default 2% per trade)"
  - "Minimum net edge 0.5% after fees for opportunity flagging"
  - "Minimum $500 liquidity per outcome required"
  - "30-minute max snapshot age for freshness"
  - "Confidence scoring: 0.9-1.0 high edge (>3%), 0.7-0.9 moderate (1-3%)"

patterns-established:
  - "TDD workflow: Write failing tests, implement to pass, refactor"
  - "Fee utilities exported for Phase 2 scoring reuse"
  - "Near-miss tracking for monitoring opportunities just below threshold"
  - "detectorLogger child logger for detector components"

# Metrics
duration: 6min
completed: 2026-01-29
---

# Phase 1 Plan 8: Multi-Outcome Arbitrage Detector Summary

**TDD-built multi-outcome arbitrage detector with buy/sell detection, fee adjustment, liquidity validation, and near-miss tracking**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-29T21:02:06Z
- **Completed:** 2026-01-29T21:08:33Z
- **Tasks:** 3 (TDD: RED-GREEN-REFACTOR)
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

- MultiOutcomeArbDetector class detecting buy arb (sum < 100%) and sell arb (sum > 100%)
- Fee adjustment formula: outcomeCount * feePercent with minimum net edge threshold
- Liquidity validation ensuring all outcomes meet $500 minimum
- Confidence scoring based on edge size and liquidity depth
- Near-miss tracking for monitoring almost-profitable opportunities
- Extracted fee calculation utilities for Phase 2 scoring reuse
- 29 comprehensive tests covering all edge cases

## Task Commits

Each TDD phase was committed atomically:

1. **RED: Failing tests** - `39fd820` (test)
   - 29 test cases for buy/sell arb, fees, liquidity, confidence, edge cases
2. **GREEN: Implementation** - `ba82ca4` (feat)
   - MultiOutcomeArbDetector class with all required functionality
3. **REFACTOR: Utilities & logging** - `edb2ad4` (refactor)
   - Extracted fee utilities, added near-miss tracking, detectorLogger

## Files Created/Modified

- `src/detectors/multi-outcome-arb.ts` (561 lines) - MultiOutcomeArbDetector class and fee utilities
- `tests/multi-outcome-arb.test.ts` (647 lines) - Comprehensive test suite with 29 tests
- `src/utils/logger.ts` - Added detectorLogger child logger

## Decisions Made

1. **Skip binary markets (2 outcomes)** - Binary markets are handled by the correlated detector (Plan 01-07). This detector focuses on 3+ outcome markets where multi-way arbitrage is more complex.

2. **Fee formula: outcomeCount * feePercent** - Each outcome trade incurs fees. For Polymarket's ~2% fee, a 3-outcome arb pays 6% in fees, requiring larger gross edges to be profitable.

3. **Minimum net edge 0.5%** - After fees, opportunities below 0.5% net edge are too thin to be reliable. This provides a safety margin against price movement during execution.

4. **$500 minimum liquidity per outcome** - Based on user's capital constraint, ensures all outcomes can be executed at expected prices.

5. **30-minute snapshot freshness** - Arb opportunities are time-sensitive. Stale data leads to false positives.

6. **Confidence scoring tiers** - High edge (>3% net) gets 0.9-1.0, moderate (1-3%) gets 0.7-0.9, providing signal strength for alert prioritization.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test expectation for moderate edge confidence**
- **Found during:** GREEN phase
- **Issue:** Test created 4% net edge market expecting "moderate" (1-3%) confidence range
- **Fix:** Adjusted test to use 2% net edge (8% gross - 6% fees)
- **Files modified:** tests/multi-outcome-arb.test.ts
- **Verification:** Test passes with correct confidence score
- **Committed in:** ba82ca4 (part of GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test fix to align expected data with test assertion. No scope creep.

## Issues Encountered

None - TDD workflow executed smoothly with tests driving implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Multi-outcome arbitrage detection ready for integration with scheduler
- Fee utilities exported for Phase 2 scoring system
- Near-miss tracking provides monitoring data for edge opportunities
- Complements correlated detector (01-07) and cross-platform detector (01-10)

---
*Phase: 01-data-foundation-infrastructure*
*Completed: 2026-01-29*
