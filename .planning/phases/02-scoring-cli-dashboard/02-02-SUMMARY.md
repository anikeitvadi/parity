---
phase: 02-scoring-cli-dashboard
plan: 02
subsystem: scoring
tags: [kelly-criterion, position-sizing, risk-management]

dependency-graph:
  requires: []
  provides:
    - kelly-criterion-position-sizing
    - half-kelly-default
    - bankroll-cap-enforcement
  affects:
    - 02-03 (alert system may use Kelly for position recommendations)
    - 02-04 (CLI dashboard may display position sizing)

tech-stack:
  added: []
  patterns:
    - TDD (Red-Green-Refactor)
    - Pure function calculation
    - Configurable defaults with override capability

file-tracking:
  key-files:
    created:
      - src/scoring/kelly.ts
      - tests/kelly.test.ts
    modified: []

decisions:
  - id: D-0202-01
    decision: Use strict < 0.1 confidence threshold
    rationale: Confidence of exactly 0.1 should still allow small position
    impact: Minimum confidence to bet is exactly 0.10, not 0.11

  - id: D-0202-02
    decision: Round positionPercent to 4 decimal places
    rationale: Avoid floating-point precision issues (4.000000000000001 vs 4)
    impact: Clean percentage values in output

metrics:
  duration: 12 minutes
  completed: 2026-02-02
---

# Phase 02 Plan 02: Kelly Criterion Position Sizing Summary

**One-liner:** Half-Kelly position sizing with 10% cap, returning 0 for zero/negative edge or low confidence (<0.1).

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 51e0821 | test | Add failing tests for Kelly criterion (RED phase) |
| 6957784 | feat | Implement Kelly criterion position sizing (GREEN phase) |

## What Was Built

### Kelly Criterion Calculator (`src/scoring/kelly.ts`)

Implements SIZE-01 through SIZE-04 requirements:

```typescript
interface KellyInput {
  edge: number;           // 0-1 scale (e.g., 0.10 = 10% edge)
  confidence: number;     // 0-1 scale
  bankroll: number;       // USD
  fraction?: number;      // Default 0.5 (half-Kelly)
  maxPosition?: number;   // Default 0.10 (10% cap)
}

interface KellyOutput {
  positionSize: number;      // USD, rounded to cents
  positionPercent: number;   // 0-100 scale
  cappedBy: 'none' | 'kelly' | 'max';
}

function calculateKelly(input: KellyInput): KellyOutput
```

**Formula:**
- Full Kelly: `f* = edge * confidence`
- Fractional Kelly: `f = f* * fraction`
- Final: `min(f, maxPosition) * bankroll`

**Examples with $500 bankroll:**
| Edge | Confidence | Result | Capped By |
|------|------------|--------|-----------|
| 10% | 0.80 | $20 (4%) | none |
| 10% | 0.90 | $22.50 (4.5%) | none |
| 25% | 0.90 | $50 (10%) | max |
| 0% | any | $0 | kelly |
| any | <0.10 | $0 | kelly |

### Test Coverage (`tests/kelly.test.ts`)

24 comprehensive tests covering:
- Standard calculations (4 tests)
- 10% bankroll cap enforcement (3 tests)
- Edge cases: zero/negative edge, low confidence (7 tests)
- Configurable parameters: fraction, maxPosition (5 tests)
- Different bankroll sizes (3 tests)
- Type exports (2 tests)

## TDD Execution

**RED Phase:** Wrote 24 failing tests that defined expected behavior
- Tests failed with "Cannot find module '../src/scoring/kelly.js'"
- Commit: `51e0821`

**GREEN Phase:** Implemented minimal code to pass all tests
- Fixed floating-point precision issue in positionPercent
- Commit: `6957784`

**REFACTOR Phase:** No changes needed
- Code was already clean with JSDoc documentation
- Constants properly named (DEFAULT_FRACTION, DEFAULT_MAX_POSITION, MIN_CONFIDENCE_THRESHOLD)
- Types exported for reuse

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

### D-0202-01: Confidence Threshold Boundary
- **Context:** Plan specified "very low confidence (<0.1)" returns 0
- **Decision:** Use strict `< 0.1` comparison
- **Result:** Confidence of exactly 0.10 can still bet (1% position with 20% edge)

### D-0202-02: Floating-Point Precision Handling
- **Context:** Tests failed with `4.000000000000001 !== 4`
- **Decision:** Round positionPercent: `Math.round(finalFraction * 100 * 10000) / 10000`
- **Result:** Clean percentage values, tests pass

## Verification

```bash
npm test -- --run tests/kelly.test.ts
# Result: 24/24 tests passing
```

## Next Phase Readiness

**Ready for:**
- 02-03: Alert system can use Kelly for position recommendations
- 02-04: CLI dashboard can display position sizing

**Dependencies satisfied:**
- SIZE-01: Kelly criterion calculates optimal position size
- SIZE-02: Inputs (edge, confidence, bankroll) defined
- SIZE-03: Half-Kelly default (fraction = 0.5)
- SIZE-04: 10% bankroll cap (maxPosition = 0.10)

**Exports available:**
```typescript
import { calculateKelly, KellyInput, KellyOutput } from './scoring/kelly.js';
```
