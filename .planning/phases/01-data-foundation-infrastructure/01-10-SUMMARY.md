---
phase: 01-data-foundation-infrastructure
plan: 10
subsystem: detection
tags: [cross-platform-arb, arbitrage, feature-flags, tdd, polymarket, kalshi, settlement-risk]

dependency-graph:
  requires:
    - phase: 01-05
      provides: MarketMatcher, MatchedPair type
    - phase: 01-06
      provides: matched_markets table, getRecentMatches, getLatestSnapshot
  provides:
    - CrossPlatformArbDetector class (DISABLED until Phase 3)
    - CrossPlatformOpportunity type
    - Feature flags configuration (featureFlags)
    - Fee calculation utilities
    - Settlement risk assessment (always HIGH in Phase 1)
  affects: [02-01, 02-02, 03-01]

tech-stack:
  added: []
  patterns:
    - TDD (Red-Green-Refactor)
    - Feature flag pattern for gating risky functionality
    - Settlement risk assessment stub (Phase 3 implementation)
    - Configurable detector thresholds (fees, liquidity, edge)

key-files:
  created:
    - src/config/feature-flags.ts
    - src/detectors/cross-platform-arb.ts
    - tests/cross-platform-arb.test.ts
  modified: []

key-decisions:
  - "crossPlatformArb flag disabled by default until Phase 3 settlement verification"
  - "Default fees: Polymarket 2%, Kalshi 7% (9% total)"
  - "Minimum 10% net edge threshold after fees to cover settlement risk"
  - "Settlement risk always HIGH in Phase 1 (no parser yet)"
  - "$500 minimum liquidity threshold per platform"
  - "30-minute max snapshot age before considered stale"
  - "0.5 minimum match confidence from MarketMatcher"

patterns-established:
  - "Feature flag check at start of detect() before any database queries"
  - "Warning log when detector disabled for visibility"
  - "Opportunity confidence scoring based on edge + liquidity"
  - "Graceful error handling returning empty array"

metrics:
  duration: 5min 21s
  completed: 2026-01-29
---

# Phase 1 Plan 10: Cross-Platform Arbitrage Detector Summary

**CrossPlatformArbDetector with TDD, DISABLED by feature flag until Phase 3 settlement verification, with configurable fees (2% Poly, 7% Kalshi) and 10% minimum net edge**

## Performance

- **Duration:** 5 min 21 sec
- **Started:** 2026-01-29T21:02:03Z
- **Completed:** 2026-01-29T21:07:24Z
- **Tasks:** 2 (TDD: RED, GREEN)
- **Files created:** 3
- **Tests:** 23 passing

## Accomplishments

- Feature flags config with crossPlatformArb: false (DISABLED until Phase 3)
- TDD implementation with 23 comprehensive test cases
- CrossPlatformArbDetector class with configurable parameters
- Fee calculation: Polymarket 2% + Kalshi 7% = 9% total fees
- Minimum 10% net edge threshold (covers fees + settlement risk)
- Settlement risk always HIGH in Phase 1 (no settlement parser)
- Liquidity validation on both platforms ($500 minimum)
- Stale data filtering (>30 min old snapshots skipped)
- Opportunity confidence scoring based on edge + liquidity depth

## Task Commits

Each TDD phase was committed atomically:

1. **RED: Failing tests** - `13de5ff` (test)
   - 23 test cases covering all detector requirements
   - Feature flag enforcement tests
   - Fee calculation tests
   - Liquidity, staleness, and edge case tests

2. **GREEN: Implementation** - `66f8797` (feat)
   - feature-flags.ts with crossPlatformArb: false
   - CrossPlatformArbDetector class
   - All 23 tests passing

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/config/feature-flags.ts` | 56 | Feature flag configuration for gating risky functionality |
| `src/detectors/cross-platform-arb.ts` | 403 | CrossPlatformArbDetector with fee/liquidity validation |
| `tests/cross-platform-arb.test.ts` | 1117 | Comprehensive TDD test suite |

## Key Code References

```typescript
// Feature flags (DISABLED until Phase 3)
export const featureFlags = {
  crossPlatformArb: false,  // DISABLED until Phase 3
  metaculusDivergence: false,  // DISABLED until Phase 4
  whaleTracking: false,  // DISABLED until Phase 6
};

// Detector initialization with defaults
constructor(
  minNetEdge: number = 10,      // Minimum 10% net edge
  minLiquidity: number = 500,   // $500 per platform
  polymarketFee: number = 2,    // 2% Polymarket fee
  kalshiFee: number = 7         // 7% Kalshi fee
)

// Feature flag check at start of detect()
if (!featureFlags.crossPlatformArb) {
  detectorLogger.warn('Cross-platform arb detector disabled...');
  return [];
}
```

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature flag disabled | crossPlatformArb: false | Settlement divergence causes double losses - wait for Phase 3 parser |
| Default Polymarket fee | 2% | Standard trading fee on CLOB |
| Default Kalshi fee | 7% | Taker fee (maker is 3%) |
| Minimum net edge | 10% | Must cover 9% fees + settlement risk buffer |
| Minimum liquidity | $500 | Focus on markets where $500 capital can execute |
| Max snapshot age | 30 minutes | Stale prices lead to false opportunities |
| Min match confidence | 0.5 | Below this, market match is too unreliable |
| Settlement risk | Always HIGH | No settlement parser until Phase 3 |

## Deviations from Plan

None - plan executed exactly as written. TDD workflow proceeded smoothly.

## Issues Encountered

- **Vitest mock hoisting:** Initial test file had `vi.mock` calls referencing variables defined after them. Fixed by defining mock functions before `vi.mock` calls and using factory function pattern.

## User Setup Required

None - no external service configuration required. The detector is DISABLED by feature flag and will not perform any operations until Phase 3 enables it.

## Verification Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Feature flag disabled by default | PASS | `featureFlags.crossPlatformArb === false` |
| Returns empty array when disabled | PASS | Test: "should return empty array when feature flag is disabled" |
| Logs warning when disabled | PASS | Test: "should log warning when feature flag is disabled" |
| No DB queries when disabled | PASS | Test: "should not query database when feature flag is disabled" |
| Detects arb when enabled | PASS | Test: "should detect arbitrage when price divergence exceeds threshold" |
| Fee calculation correct | PASS | Test: "should apply default fees (Polymarket 2%, Kalshi 7%)" |
| Liquidity validation | PASS | Tests for both platforms' liquidity checks |
| Stale data filtering | PASS | Test: "should skip opportunities when snapshot data is stale" |
| Settlement risk HIGH | PASS | Test: "should always return HIGH settlement risk in Phase 1" |

## Next Phase Readiness

**Dependencies Satisfied:**
- CrossPlatformArbDetector ready for Phase 2 alert integration (when enabled in Phase 3)
- Feature flags pattern established for other disabled detectors
- Fee calculation utilities reusable for Phase 2 scoring

**Blockers/Concerns:**
- Detector is DISABLED until Phase 3 settlement verification operational
- Phase 3 must implement settlement rule parser before enabling
- Cross-platform arb is HIGH RISK until settlement divergence can be detected

**Phase 3 Requirements for Enabling:**
1. Implement settlement rule extraction (Polymarket UMA oracle vs Kalshi resolution)
2. Compare settlement mechanisms for matched markets
3. Only enable crossPlatformArb flag after verification operational
4. Update assessSettlementRisk() to use actual comparison

---
*Phase: 01-data-foundation-infrastructure*
*Completed: 2026-01-29*
