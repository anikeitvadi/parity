---
phase: 02-scoring-cli-dashboard
plan: 04
subsystem: cli-dashboard
tags: [ink, react, cli, interactive-ui, terminal]

dependency-graph:
  requires:
    - 02-01 (scoring engine)
    - 02-02 (kelly criterion)
    - 02-03 (opportunity aggregator)
  provides:
    - interactive-cli-dashboard
    - opportunity-table-display
    - detail-view-navigation
    - watch-mode-auto-refresh
  affects:
    - 02-05 (WhatsApp integration may share scoring display logic)

tech-stack:
  added:
    - ink@6.6.0 (React for CLI)
    - "@inkjs/ui@2.0.0" (Select component)
    - meow@14.0.0 (CLI argument parsing)
    - react@19.2.4 (peer dependency for Ink v6)
    - chalk@5.6.2 (terminal colors)
    - cli-table3@0.6.5 (table formatting utility)
    - tsx@4.21.0 (TypeScript runner)
  patterns:
    - React functional components with hooks
    - useInput for keyboard handling
    - useRef for stable references
    - Controlled state for navigation

file-tracking:
  key-files:
    created:
      - src/dashboard/App.tsx
      - src/dashboard/index.tsx
      - src/dashboard/components/OpportunityTable.tsx
      - src/dashboard/components/OpportunityDetail.tsx
      - src/dashboard/components/StatusBar.tsx
      - src/dashboard/components/index.ts
      - src/cli.tsx
    modified:
      - package.json (dependencies and scripts)
      - tsconfig.json (jsx config)
      - src/scoring/composite-scorer.ts (Kelly integration)

decisions:
  - id: D-0204-01
    decision: Use standard react-jsx without jsxImportSource
    rationale: Ink v6 uses React 19 and React's standard JSX runtime, not a custom one
    impact: Simpler tsconfig, works with existing React ecosystem

  - id: D-0204-02
    decision: Integrate Kelly criterion into scoreOpportunity function
    rationale: Plan 02-02 created Kelly calculator but left integration as placeholder
    impact: scoreOpportunity now accepts bankroll parameter and returns position sizing

  - id: D-0204-03
    decision: Use .tsx extension for cli entry point
    rationale: CLI renders JSX element, requires JSX transpilation
    impact: Dashboard scripts updated to point to src/cli.tsx

metrics:
  duration: 33 minutes
  completed: 2026-02-02
---

# Phase 02 Plan 04: CLI Dashboard Summary

**One-liner:** Interactive Ink-based terminal UI with opportunity table, detail views, keyboard navigation, and watch mode auto-refresh.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 8b127e4 | chore | Install Ink and configure JSX for CLI dashboard |
| 19763da | feat | Create dashboard components with Ink |
| a4d56ad | feat | Create App and CLI entry point with Kelly integration |

## What Was Built

### CLI Dashboard (`src/dashboard/`)

Interactive terminal UI built with Ink v6 and @inkjs/ui:

```
npm run dashboard [options]

Options:
  --bankroll, -b   Total capital for position sizing (default: 500)
  --min-score, -m  Minimum score to display (default: 0)
  --watch, -w      Enable watch mode with auto-refresh
  --interval, -i   Refresh interval in seconds (default: 300)
```

**Main Components:**

| Component | Purpose | File |
|-----------|---------|------|
| `App` | Main orchestration, state, data fetching | `App.tsx` |
| `OpportunityTable` | Interactive list with Select | `components/OpportunityTable.tsx` |
| `OpportunityDetail` | Detailed view with score breakdown | `components/OpportunityDetail.tsx` |
| `StatusBar` | Update time, counts, errors | `components/StatusBar.tsx` |

### Features Implemented

**CLI-01: Table Display**
- Opportunities shown in tabular format with columns: SCORE, MARKET, EDGE, TYPE, SIZE
- Sorted by score descending
- Shows "No opportunities above threshold" when empty

**CLI-02: Score Color Coding**
- Score 7+: Green (high confidence)
- Score 5-6: Yellow (medium confidence)
- Score <5: Dim (low confidence)

**CLI-03: Interactive Navigation**
- Arrow keys: Move selection up/down
- Enter: View opportunity details
- b / Escape: Return to list view
- r: Refresh data
- q / Ctrl+C: Quit

**CLI-04: Watch Mode**
- `--watch` flag enables auto-refresh
- `--interval` configures refresh frequency (default: 300s)
- Status bar shows time since last update

### Kelly Integration Fix

Discovered during execution: Plan 02-02 created `calculateKelly()` but left integration as a placeholder in `composite-scorer.ts`.

**Fixed by updating `scoreOpportunity`:**
```typescript
// Before (broken - expected weights, got bankroll)
export function scoreOpportunity(
  opportunity: UnifiedOpportunity,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredOpportunity | null

// After (integrated Kelly)
export function scoreOpportunity(
  opportunity: UnifiedOpportunity,
  bankroll: number = 500,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredOpportunity | null
```

Position sizing now calculated using Kelly criterion with half-Kelly default.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kelly criterion not integrated**
- **Found during:** Task 3
- **Issue:** `scoreOpportunity` had placeholder values (positionSize: 0, positionPercent: 0)
- **Fix:** Integrated `calculateKelly()` into `CompositeScorer.score()` method
- **Files modified:** `src/scoring/composite-scorer.ts`
- **Commit:** a4d56ad

**2. [Rule 3 - Blocking] CLI file needed JSX support**
- **Found during:** Task 3
- **Issue:** `src/cli.ts` contained JSX but had .ts extension
- **Fix:** Renamed to `src/cli.tsx` and updated package.json scripts
- **Files modified:** `src/cli.tsx`, `package.json`
- **Commit:** a4d56ad

**3. [Rule 3 - Blocking] Missing peer dependencies**
- **Found during:** Task 1-2
- **Issue:** Ink v6 requires React 19 and @types/react
- **Fix:** Installed react and @types/react
- **Files modified:** `package.json`
- **Commits:** 8b127e4, 19763da

## Verification

```bash
# Help text works
npm run dashboard -- --help
# Output: Full CLI help with options, navigation, examples

# Type-check passes
npx tsc --noEmit
# Result: No errors

# All tests pass (including updated scoring)
npm run test:run
# Result: 260/260 tests passing
```

## Next Phase Readiness

**Ready for:**
- 02-05: WhatsApp integration can share opportunity display logic

**Dependencies satisfied:**
- CLI-01: Table display with sorting
- CLI-02: Score-based color coding
- CLI-03: Interactive navigation
- CLI-04: Watch mode with configurable interval

**Usage:**
```bash
# Basic usage
npm run dashboard

# With custom settings
npm run dashboard -- --bankroll 1000 --min-score 5 --watch --interval 60
```

**Note:** Dashboard will show "No opportunities" until database has market data. Run data collection jobs first to populate.
