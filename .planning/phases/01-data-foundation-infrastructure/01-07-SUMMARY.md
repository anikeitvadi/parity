---
phase: 01-data-foundation-infrastructure
plan: 07
subsystem: edge-detection
tags: [tdd, correlated-markets, pricing-inconsistency, binary-markets, multi-outcome, arbitrage]

dependency-graph:
  requires:
    - phase: 01-05
      provides: MarketMatcher class, Market type
    - phase: 01-06
      provides: Job scheduler infrastructure
  provides:
    - CorrelatedMarketsDetector class
    - CorrelatedOpportunity type
    - Binary market consistency detection (YES + NO = 100%)
    - Multi-outcome market consistency detection
    - Confidence scoring algorithm
    - Expected value calculation
  affects: [01-08, 02-01, 02-02]

tech-stack:
  added: []
  patterns:
    - TDD (Red-Green-Refactor)
    - Confidence scoring based on edge size
    - Liquidity filtering for quality opportunities
    - Expected value calculation for trade sizing

key-files:
  created:
    - src/detectors/correlated-markets.ts
    - tests/correlated-markets.test.ts
  modified: []

key-decisions:
  - "2% minimum edge threshold (accounts for fees and bid-ask spread)"
  - "$500 minimum liquidity filter for quality opportunities"
  - "Confidence scaling: 0.7-0.9 for 2-5% edge, 0.9-1.0 for >5% edge"
  - "Expected value calculation: EV = |priceSum - 1| for trade sizing"
  - "Single-platform only (cross-platform arb disabled until Phase 3)"

patterns-established:
  - "Detector pattern: constructor(config) -> detectFromMarkets(markets) -> opportunities[]"
  - "Opportunity interface: market, type, edgeSize, confidence, priceSum, expectedValue, timestamp"
  - "Validation pattern: check liquidity -> validate prices -> calculate edge -> filter threshold"
  - "Confidence calculation: linear interpolation between threshold ranges"

metrics:
  duration: 5m 25s
  completed: 2026-01-29
---

# Phase 1 Plan 7: Correlated Markets Consistency Detector Summary

**TDD implementation of CorrelatedMarketsDetector with binary/multi-outcome market consistency checks, 2% minimum edge threshold, $500 liquidity filter, and confidence scoring**

## Performance

- **Duration:** 5 min 25 sec
- **Started:** 2026-01-29T21:02:06Z
- **Completed:** 2026-01-29T21:07:31Z
- **Tasks:** 3 (TDD: RED, GREEN, REFACTOR)
- **Files created:** 2
- **Tests:** 34 passing

## Accomplishments

- TDD implementation with 34 comprehensive test cases
- Binary market consistency detection (YES + NO != 100%)
- Multi-outcome market consistency detection (sum != 100%)
- 2% minimum edge threshold to account for fees
- $500 minimum liquidity filter for quality opportunities
- Confidence scoring: 0.7-0.9 for 2-5% edge, 0.9-1.0 for >5%
- Expected value calculation for trade sizing
- Opportunities sorted by edge size (best first)
- Comprehensive input validation and edge case handling

## Task Commits

Each TDD phase was committed atomically:

1. **RED: Failing tests** - `06bdd17` (test)
   - 31 test cases covering all detection scenarios
   - Tests for binary, multi-outcome, liquidity, confidence, edge cases

2. **GREEN: Implementation** - `a688c83` (feat)
   - CorrelatedMarketsDetector class with all core methods
   - Passes all 31 tests

3. **REFACTOR: Cleanup** - `39b9641` (refactor)
   - Extract magic numbers to named constants
   - Add expectedValue field and calculation
   - Add debug logging for skipped markets
   - 3 additional tests for expectedValue

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/detectors/correlated-markets.ts` | 296 | CorrelatedMarketsDetector class with detection algorithm |
| `tests/correlated-markets.test.ts` | 470 | Comprehensive TDD test suite |

## Key Code References

```typescript
// CorrelatedMarketsDetector initialization
constructor(minEdgePercent: number = 2, minLiquidity: number = 500)

// Main detection method
detectFromMarkets(markets: Market[]): CorrelatedOpportunity[]

// Opportunity structure
interface CorrelatedOpportunity {
  market: Market;
  type: OpportunityType; // 'binary_overpriced' | 'binary_underpriced' | 'multi_overpriced' | 'multi_underpriced'
  edgeSize: number;       // Percentage points (e.g., 5 = 5%)
  confidence: number;     // 0.7-1.0
  priceSum: number;       // Sum of all outcome prices
  expectedValue: number;  // Decimal EV (e.g., 0.05 = 5%)
  timestamp: number;
}
```

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Minimum edge threshold | 2% | Accounts for fees and bid-ask spread (research-backed) |
| Liquidity threshold | $500 | Focus on liquid markets only |
| Confidence scoring | 0.7-0.9 for 2-5%, 0.9-1.0 for >5% | Higher edge = higher confidence |
| Expected value formula | `|priceSum - 1|` | Simple EV for position sizing |
| Single-platform scope | Yes | Cross-platform arb disabled until Phase 3 |

## Deviations from Plan

None - plan executed exactly as written.

TDD workflow proceeded smoothly with no auto-fixes required.

## Issues Encountered

**Parallel test file collision:** Tests for future plans (cross-platform-arb.test.ts, multi-outcome-arb.test.ts) existed from a parallel process, causing test failures due to missing imports. These files are for EDGE-02 and EDGE-05 which are Phase 3+ features.

**Resolution:** Ran specific test files to avoid import errors from future plan stubs. The untracked files don't affect this plan's functionality.

## User Setup Required

None - no external service configuration required.

## Verification Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Binary market consistency | PASS | 6 tests verify YES+NO sum checks |
| Multi-outcome consistency | PASS | 5 tests verify sum checks |
| Liquidity filtering | PASS | 5 tests verify $500 threshold |
| Confidence scoring | PASS | 3 tests verify 0.7-1.0 range |
| Edge cases | PASS | 5 tests for invalid inputs |
| Sorting | PASS | Test verifies edge size DESC |
| Expected value | PASS | 3 tests verify EV calculation |

## Next Phase Readiness

**Dependencies Satisfied:**
- CorrelatedMarketsDetector ready for integration with job scheduler
- CorrelatedOpportunity type ready for alert system
- Detection pattern established for other detectors

**Blockers/Concerns:**
- Cross-platform arbitrage (EDGE-02) remains disabled until Phase 3
- Real-world verification with live market data needed
- Integration with alert system (Phase 2) pending

---
*Phase: 01-data-foundation-infrastructure*
*Completed: 2026-01-29*
