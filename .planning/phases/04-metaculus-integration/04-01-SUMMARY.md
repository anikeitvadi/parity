---
phase: 04
plan: 01
subsystem: types-config
tags: [metaculus, types, zod, feature-flags, foundation]
requires: [03-01, 03-02, 03-03, 03-04, 03-05]
provides:
  - Metaculus type definitions with Zod validation
  - metaculusDivergence feature flag
  - Manual curation file for Metaculus matches
affects: [04-02, 04-03, 04-04, 04-05]
tech-stack:
  added: []
  patterns: [zod-schema-validation, feature-flag-gating]
key-files:
  created:
    - src/types/metaculus.ts
    - src/data/metaculus-matches.json
  modified:
    - src/config/feature-flags.ts
decisions:
  - decision: Use Zod validation for Metaculus API types
    rationale: Matches existing pattern in market.ts and settlement.ts
    date: 2026-02-04
  - decision: Create separate manual matches file for Metaculus
    rationale: Follows same pattern as MarketMatcher's manual-matches.json
    date: 2026-02-04
  - decision: Keep metaculusDivergence flag disabled
    rationale: Wait until Phase 4 complete and API integration tested
    date: 2026-02-04
metrics:
  duration: 3min
  completed: 2026-02-04
---

# Phase 04 Plan 01: Metaculus Foundation Types Summary

**One-liner:** Type-safe Metaculus API integration foundation with Zod schemas, feature flag, and manual curation file.

## What Was Built

Created foundational types and configuration for Metaculus superforecaster integration:

1. **Metaculus Types** (`src/types/metaculus.ts`):
   - `MetaculusQuestionSchema`: Zod schema for API response validation
   - `MetaculusQuestion`: TypeScript type inferred from schema
   - `MetaculusMatch`: Matched pair of Metaculus question and prediction market
   - `ForecastStaleness`: Freshness assessment for forecast data
   - `MetaculusDivergenceOpportunity`: Detected divergence between superforecasters and market

2. **Feature Flag Update** (`src/config/feature-flags.ts`):
   - Updated `metaculusDivergence` documentation to require `METACULUS_TOKEN` env var
   - Remains `false` until Phase 4 implementation complete

3. **Manual Curation File** (`src/data/metaculus-matches.json`):
   - Initialized as empty array `[]`
   - Ready for manually verified Metaculus-to-market matches
   - Same pattern as `manual-matches.json` used by MarketMatcher

## Implementation Details

### Type Design

**MetaculusQuestionSchema** validates API responses with:
- Question metadata (id, title, description, type)
- Timestamps (created_time, resolve_time) in ISO 8601 format
- Status tracking (open, closed, resolved)
- Optional predictions (community_prediction, pro_prediction) with median (q2) and timestamp

**MetaculusMatch** links questions to markets with:
- Match confidence score (0-1)
- Match method (exact, high_similarity, manual)
- Verification flag for manual curation
- Timestamp tracking

**ForecastStaleness** assesses data freshness:
- Boolean fresh indicator
- Age in days
- Last update timestamp
- Optional warning message

**MetaculusDivergenceOpportunity** represents detector output:
- Type discriminator (`'metaculus_divergence'`)
- Question and market identifiers
- Prediction vs price comparison
- Divergence percentage
- Staleness tracking

### Type Patterns

Followed existing codebase patterns:
- JSDoc comments for all exported types
- Zod schema for runtime validation (like `market.ts`, `settlement.ts`)
- Type inference from Zod schema
- Platform enum reuse: `'polymarket' | 'kalshi'`

## Technical Decisions

### Decision: Zod Validation for API Types
**Context:** Need runtime validation for Metaculus API responses
**Options:**
- Pure TypeScript types (compile-time only)
- Zod schemas (runtime validation)
- JSON Schema

**Choice:** Zod schemas

**Rationale:**
- Matches existing patterns in `market.ts` and `settlement.ts`
- Runtime validation catches API changes early
- Type inference keeps DX smooth (no duplicate definitions)
- Already in tech stack (no new dependency)

### Decision: Separate Manual Matches File
**Context:** Need manual curation for high-confidence Metaculus matches
**Options:**
- Reuse existing `manual-matches.json`
- Create dedicated `metaculus-matches.json`
- Store in database

**Choice:** Dedicated `metaculus-matches.json`

**Rationale:**
- Separation of concerns (cross-platform arb vs Metaculus divergence)
- Matches MarketMatcher pattern (proven to work)
- JSON file easier to edit than database
- Version control tracks curation changes

### Decision: Keep Feature Flag Disabled
**Context:** When to enable `metaculusDivergence` flag
**Options:**
- Enable now (types ready)
- Enable after API client built
- Enable after full Phase 4 complete

**Choice:** Enable after full Phase 4 complete

**Rationale:**
- Types alone don't make feature functional
- Need API client, detector, and testing first
- Conservative enablement prevents premature alerts
- Matches pattern from Phase 3 (enabled settlement verification only after full implementation)

## Testing & Verification

### Verification Results
✅ TypeScript compiles without errors (`npx tsc --noEmit`)
✅ All 331 existing tests pass
✅ `MetaculusQuestionSchema` can be imported
✅ Feature flag exists and returns `false`
✅ Manual matches file created at correct path

### Test Impact
- No new tests needed (pure type definitions)
- No existing tests broken
- Types ready for use in Phase 4 implementation

## Dependencies & Integration

### Phase Dependencies
**Requires:** Phase 3 complete (settlement verification for arbitrage safety)
**Enables:** Phase 4 implementation:
- 04-02: Metaculus API client
- 04-03: Question-to-market matcher
- 04-04: Metaculus divergence detector
- 04-05: Dashboard integration

### Type Exports
All types available via:
```typescript
import {
  MetaculusQuestionSchema,
  // Types inferred from imports in consuming code:
  // MetaculusQuestion, MetaculusMatch,
  // ForecastStaleness, MetaculusDivergenceOpportunity
} from './types/metaculus.js';
```

### Feature Flag Usage
```typescript
import { isFeatureEnabled } from './config/feature-flags.js';

if (isFeatureEnabled('metaculusDivergence')) {
  // Phase 4 detector enabled
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

### Blockers
None. Ready for Phase 4 implementation.

### Prerequisites for 04-02 (API Client)
✅ Types defined with Zod validation
✅ Feature flag exists for gating
⏳ Need `METACULUS_TOKEN` environment variable (user setup)

### Environment Setup Required
User must obtain Metaculus API token:
1. Visit https://metaculus.com/aib
2. Generate API Token
3. Set `METACULUS_TOKEN` environment variable

## Files Changed

### Created (2 files)
- `src/types/metaculus.ts` (144 lines) - Complete type definitions
- `src/data/metaculus-matches.json` (1 line) - Empty array for curation

### Modified (1 file)
- `src/config/feature-flags.ts` - Updated metaculusDivergence documentation

## Metrics

**Execution Time:** ~3 minutes
**Commits:** 2 (one per task)
**Tests Added:** 0
**Tests Passing:** 331/331
**TypeScript Errors:** 0

## Success Criteria

✅ All Metaculus types defined with Zod validation
✅ Feature flag ready for Phase 4 gating
✅ Manual matches curation file ready for use
✅ No breaking changes to existing code

## What's Next

**Immediate Next Plan:** 04-02 - Metaculus API Client

**Phase 4 Roadmap:**
1. ✅ **04-01**: Foundation types (this plan)
2. **04-02**: API client with rate limiting
3. **04-03**: Question-to-market matcher
4. **04-04**: Divergence detector with staleness checks
5. **04-05**: Dashboard integration

**Success Metric for Phase 4:**
Detect when superforecaster consensus significantly diverges from market price, enabling contrarian bets backed by expert analysis.
