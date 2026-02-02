---
phase: 02-scoring-cli-dashboard
plan: 01
subsystem: scoring
tags: [scoring, factors, weighted-average, threshold, tdd]
dependency-graph:
  requires: [01-08]
  provides: [scoring-engine, unified-opportunity-type]
  affects: [02-02, 02-03, 02-04]
tech-stack:
  added: []
  patterns: [modular-factors, pure-functions, weighted-scoring]
key-files:
  created:
    - src/scoring/types.ts
    - src/scoring/factors/edge-factor.ts
    - src/scoring/factors/confidence-factor.ts
    - src/scoring/factors/liquidity-factor.ts
    - src/scoring/factors/time-factor.ts
    - src/scoring/factors/fee-factor.ts
    - src/scoring/composite-scorer.ts
    - src/scoring/index.ts
    - tests/scoring.test.ts
  modified: []
decisions:
  - id: SCORE-01
    choice: "5% minimum net edge threshold"
    rationale: "$0.05 minimum profit on $100 trade covers execution overhead"
  - id: SCORE-02
    choice: "Weighted average with configurable weights"
    rationale: "Allows tuning based on backtesting without code changes"
  - id: SCORE-03
    choice: "Pure functions for all scoring factors"
    rationale: "Testability, predictability, no side effects"
metrics:
  duration: 18m
  completed: 2026-02-02
---

# Phase 2 Plan 1: Scoring Engine Summary

**One-liner:** Modular weighted scoring engine with 5% net edge threshold and configurable factor weights (edge 35%, confidence 25%, liquidity 20%, time 10%, profit 10%).

## What Was Built

### Scoring Engine Architecture

Created a modular scoring system that rates opportunities on a 1-10 scale using five weighted factors:

1. **Edge Factor (35%)** - Scores based on net edge percentage thresholds:
   - <5%: 1-2 (below threshold)
   - 5-7%: 3-4 (marginal)
   - 7-10%: 5-6 (decent)
   - 10-15%: 7-8 (good)
   - 15-20%: 9 (excellent)
   - >20%: 10 (exceptional)

2. **Confidence Factor (25%)** - Detector confidence scaled to 0-10:
   - Single-platform: `detectorConfidence * 10`
   - Cross-platform: `(detectorConfidence * matchConfidence) * 10`

3. **Liquidity Factor (20%)** - USD liquidity thresholds:
   - <$500: 0 (below minimum)
   - $500-1K: 3
   - $1K-5K: 5
   - $5K-10K: 7
   - $10K-50K: 9
   - >$50K: 10

4. **Time Factor (10%)** - Days to resolution:
   - <1 day: 10 (urgent)
   - 1-3 days: 8
   - 3-7 days: 6
   - 7-30 days: 4
   - >30 days: 2 (long-term)
   - No date: 5 (neutral)

5. **Profit Factor (10%)** - Fee-adjusted profit:
   - Score = min(netEdge * 100, 10)

### Minimum Threshold Enforcement

Opportunities with net edge < 5% (i.e., < $0.05 profit on $100 trade) are rejected before scoring. This prevents low-quality opportunities from reaching users.

### Custom Weight Support

```typescript
const customScorer = new CompositeScorer({
  edgeSize: 0.50,      // Prioritize raw profitability
  confidence: 0.20,
  liquidity: 0.15,
  timeToResolution: 0.10,
  feeAdjustedProfit: 0.05,
});
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Threshold | 5% net edge minimum | Research-backed: edges <5% eaten by fees and execution overhead |
| Factor pattern | Pure functions | Testable, no side effects, deterministic |
| Weight validation | validateWeights() utility | Catches misconfigured weights that don't sum to 1.0 |
| Score range | 1-10 (clamped) | Human-interpretable scale, matches user expectations |

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/scoring/types.ts` | 169 | UnifiedOpportunity, ScoredOpportunity, ScoringWeights interfaces |
| `src/scoring/composite-scorer.ts` | 259 | Main scoring algorithm with CompositeScorer class |
| `src/scoring/factors/edge-factor.ts` | 62 | Edge size scoring logic |
| `src/scoring/factors/confidence-factor.ts` | 50 | Confidence scoring logic |
| `src/scoring/factors/liquidity-factor.ts` | 57 | Liquidity scoring logic |
| `src/scoring/factors/time-factor.ts` | 79 | Time to resolution scoring |
| `src/scoring/factors/fee-factor.ts` | 44 | Fee-adjusted profit scoring |
| `src/scoring/index.ts` | 76 | Public API exports |
| `tests/scoring.test.ts` | 719 | Comprehensive test suite (71 tests) |

## Test Coverage

71 tests covering:
- Individual factor scoring (edge, confidence, liquidity, time, profit)
- Minimum threshold enforcement
- Composite weighted average calculation
- Custom weights behavior
- Edge cases (zero values, max values, missing data)
- Example scenarios from plan specification
- Type exports validation
- Weight validation

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 478c3ff | test | Add failing tests for scoring engine (RED) |
| 85ad44e | feat | Implement scoring engine (GREEN) |
| cee7927 | refactor | Add weight validation and tuning guide (REFACTOR) |

## Deviations from Plan

None - plan executed exactly as written.

## Integration Notes

### For Plan 02-02 (Kelly Position Sizing)

The `ScoredOpportunity` interface includes placeholder fields:
- `positionSize: number` - USD position size (placeholder: 0)
- `positionPercent: number` - % of bankroll (placeholder: 0)

These will be populated by Kelly criterion calculations in plan 02-02.

### For Plan 02-03 (Opportunity Aggregator)

The `UnifiedOpportunity` interface normalizes detector outputs:
- Multi-outcome arb detector output maps to `type: 'multi_outcome'`
- Correlated markets detector maps to `type: 'correlated'`
- Cross-platform arb (Phase 3+) maps to `type: 'cross_platform'`

### Public API

```typescript
import {
  scoreOpportunity,        // Quick scoring with defaults
  CompositeScorer,         // Reusable scorer with custom weights
  meetsMinimumThreshold,   // Pre-check before scoring
  validateWeights,         // Weight configuration validation
  DEFAULT_WEIGHTS,         // Research-backed weight defaults
  MIN_NET_EDGE_THRESHOLD,  // 0.05 (5%)
} from './scoring';
```

## Next Phase Readiness

- **Ready for 02-02:** Scoring engine provides scores needed for Kelly position sizing
- **Ready for 02-03:** UnifiedOpportunity type ready for aggregator normalization
- **No blockers:** All tests pass, clean build

## Performance Characteristics

- All factor functions are pure and O(1)
- No database or network calls in scoring path
- Suitable for batch scoring with `scoreAll()` method
- Memory-efficient: no caching needed for pure functions
