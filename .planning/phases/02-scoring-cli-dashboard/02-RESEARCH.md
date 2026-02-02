# Phase 2: Scoring Engine & CLI Dashboard - Research

**Researched:** 2026-02-02
**Domain:** Opportunity Scoring + Terminal UI Dashboard
**Confidence:** HIGH

## Summary

Phase 2 transforms raw detector outputs into actionable, scored opportunities displayed in an interactive CLI dashboard. The scoring engine combines multiple factors (edge size, confidence, liquidity, time-to-resolution, fees) into a composite 1-10 score with Kelly criterion position sizing. The CLI dashboard provides real-time visibility with watch mode, filtering, and drill-down capabilities.

The research validates that **Ink** is the best modern choice for interactive terminal UIs in Node.js, with **@inkjs/ui** providing ready-made selection components. For simpler table display, **cli-table3** with **chalk** remains the lightweight proven option. The scoring algorithm should use a weighted linear combination with half-Kelly (capped at 10%) for position sizing.

**Primary recommendation:** Use Ink with @inkjs/ui for the interactive dashboard, implement a modular scoring engine with configurable weights, and employ recursive setTimeout for watch mode polling.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ink | ^5.0.0 | React-based terminal UI framework | Modern, React paradigm, excellent TypeScript support, used by GitHub Copilot CLI, Cloudflare Wrangler |
| @inkjs/ui | ^2.0.0 | Pre-built interactive components | Official components: Select, Spinner, Badge, ProgressBar with theming |
| chalk | ^5.0.0 | Terminal string styling | De facto standard, 40M weekly downloads, ESM native |
| cli-table3 | ^0.6.0 | Unicode table formatting | Maintained fork, cell spanning, ANSI color support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| yoga-layout-prebuilt | ^1.10.0 | Flexbox for terminals | Bundled with Ink, enables CSS-like layouts |
| figures | ^6.0.0 | Unicode symbols | Checkmarks, crosses, arrows for status display |
| wrap-ansi | ^9.0.0 | Word wrap with ANSI | Long text in table cells |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ink | blessed/neo-blessed | blessed is more powerful but unmaintained; use for complex dashboards with charts |
| ink | blessed-contrib | Has charts/gauges but dated (2019); use if visual charts needed |
| @inkjs/ui | ink-select-input | Simpler but fewer features; use for minimal selection needs |
| cli-table3 | tty-table | More features but heavier; use if Asian character support critical |

**Installation:**
```bash
npm install ink @inkjs/ui chalk cli-table3
npm install -D @types/cli-table3
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── scoring/
│   ├── index.ts               # Public API exports
│   ├── composite-scorer.ts    # Main scoring algorithm
│   ├── factors/
│   │   ├── edge-factor.ts     # Edge size scoring
│   │   ├── confidence-factor.ts
│   │   ├── liquidity-factor.ts
│   │   ├── time-factor.ts     # Time to resolution
│   │   └── fee-factor.ts      # Fee-adjusted profit
│   ├── kelly.ts               # Kelly criterion position sizing
│   └── types.ts               # Scoring interfaces
├── dashboard/
│   ├── index.tsx              # Dashboard entry point
│   ├── components/
│   │   ├── OpportunityTable.tsx
│   │   ├── OpportunityDetail.tsx
│   │   ├── FilterBar.tsx
│   │   └── StatusBar.tsx
│   ├── hooks/
│   │   ├── useOpportunities.ts   # Data fetching/polling
│   │   └── useDeduplication.ts   # 4-6 hour dedup
│   └── utils/
│       └── formatters.ts         # Price/edge formatting
├── aggregator/
│   ├── opportunity-aggregator.ts # Combine detector outputs
│   └── deduplicator.ts           # Track seen opportunities
└── cli.ts                        # Entry point with commander
```

### Pattern 1: Unified Opportunity Interface
**What:** Normalize all detector outputs to a common interface for scoring
**When to use:** Always - enables single scoring/display pipeline

```typescript
// Source: Derived from existing detector patterns
interface UnifiedOpportunity {
  // Identity
  id: string;                    // Unique hash of market+type+direction
  type: OpportunityType;         // 'multi_outcome' | 'correlated' | 'cross_platform'
  platform: Platform | 'cross';  // Where to execute
  marketId: string;
  marketQuestion: string;

  // Edge metrics (0-1 scale)
  grossEdge: number;             // Before fees
  netEdge: number;               // After fees

  // Confidence (0-1 scale)
  detectorConfidence: number;    // From detector
  matchConfidence?: number;      // For cross-platform only

  // Liquidity
  minLiquidity: number;          // USD, bottleneck liquidity
  liquidityDepth: number;        // How many levels

  // Timing
  detectedAt: number;            // Unix timestamp
  closeDate?: string;            // Market expiration

  // Raw data for detail view
  raw: ArbOpportunity | CorrelatedOpportunity | CrossPlatformOpportunity;
}
```

### Pattern 2: Factor-Based Scoring with Weights
**What:** Modular scoring factors combined with configurable weights
**When to use:** When requirements may evolve (add/remove factors)

```typescript
// Source: Requirements RATE-02 through RATE-05
interface ScoringFactor {
  name: string;
  weight: number;           // 0-1, should sum to 1 across factors
  calculate(opp: UnifiedOpportunity): number;  // Returns 0-10
}

const DEFAULT_WEIGHTS = {
  edgeSize: 0.35,          // Primary signal
  confidence: 0.25,        // Signal reliability
  liquidity: 0.20,         // Can we actually execute?
  timeToResolution: 0.10,  // Urgency
  feeAdjustedProfit: 0.10, // Net profitability
};

function compositeScore(opp: UnifiedOpportunity, weights = DEFAULT_WEIGHTS): number {
  const factors = [
    { score: edgeSizeFactor(opp), weight: weights.edgeSize },
    { score: confidenceFactor(opp), weight: weights.confidence },
    { score: liquidityFactor(opp), weight: weights.liquidity },
    { score: timeFactor(opp), weight: weights.timeToResolution },
    { score: profitFactor(opp), weight: weights.feeAdjustedProfit },
  ];

  return factors.reduce((sum, f) => sum + f.score * f.weight, 0);
}
```

### Pattern 3: Recursive setTimeout for Watch Mode
**What:** Self-scheduling refresh that avoids call stacking
**When to use:** Always for polling - safer than setInterval

```typescript
// Source: Node.js best practices for polling
class WatchMode {
  private timeoutId: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private refreshFn: () => Promise<void>,
    private intervalMs: number = 300000  // 5 min default
  ) {}

  start(): void {
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async scheduleNext(): Promise<void> {
    if (!this.running) return;

    const startTime = Date.now();
    try {
      await this.refreshFn();
    } catch (error) {
      // Log but don't crash watch mode
    }

    const elapsed = Date.now() - startTime;
    const nextDelay = Math.max(0, this.intervalMs - elapsed);

    this.timeoutId = setTimeout(() => this.scheduleNext(), nextDelay);
  }
}
```

### Pattern 4: Hash-Based Deduplication
**What:** Track seen opportunities by content hash to avoid re-alerting
**When to use:** CLI-05 requirement (4-6 hour dedup window)

```typescript
// Source: Requirement CLI-05
import crypto from 'crypto';

interface SeenOpportunity {
  hash: string;
  firstSeen: number;
  lastSeen: number;
  highestScore: number;
}

class OpportunityDeduplicator {
  private seen = new Map<string, SeenOpportunity>();
  private dedupWindowMs: number;

  constructor(dedupWindowHours: number = 4) {
    this.dedupWindowMs = dedupWindowHours * 60 * 60 * 1000;
  }

  private hashOpportunity(opp: UnifiedOpportunity): string {
    // Hash on immutable properties only
    const key = `${opp.type}:${opp.marketId}:${opp.platform}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }

  isDuplicate(opp: UnifiedOpportunity): boolean {
    const hash = this.hashOpportunity(opp);
    const existing = this.seen.get(hash);

    if (!existing) return false;

    const age = Date.now() - existing.firstSeen;
    return age < this.dedupWindowMs;
  }

  record(opp: UnifiedOpportunity, score: number): void {
    const hash = this.hashOpportunity(opp);
    const existing = this.seen.get(hash);

    if (existing) {
      existing.lastSeen = Date.now();
      existing.highestScore = Math.max(existing.highestScore, score);
    } else {
      this.seen.set(hash, {
        hash,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        highestScore: score,
      });
    }
  }

  prune(): void {
    const now = Date.now();
    for (const [hash, entry] of this.seen) {
      if (now - entry.firstSeen > this.dedupWindowMs) {
        this.seen.delete(hash);
      }
    }
  }
}
```

### Anti-Patterns to Avoid
- **Coupling scoring to display:** Keep scoring pure functions, separate from Ink components
- **setInterval for polling:** Use recursive setTimeout to prevent call stacking when refresh takes longer than interval
- **Hardcoded weights:** Use configuration object to allow tuning without code changes
- **Monolithic detail view:** Break into composable components (EdgeBreakdown, LiquidityView, etc.)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal styling | String concatenation with ANSI codes | chalk | Cross-platform, theme support, composable |
| Table formatting | Manual spacing/alignment | cli-table3 | Unicode box drawing, ANSI support, cell spanning |
| Interactive selection | Raw stdin handling | @inkjs/ui Select | Keyboard handling, scrolling, accessibility |
| Flexbox in terminal | Manual position calculation | Ink's Box component | Yoga layout engine, CSS-like props |
| Loading spinners | ASCII animation loop | @inkjs/ui Spinner | Multiple styles, label support, proper cleanup |
| Kelly calculation | Custom formula | Validated formula below | Edge cases with f>1, negative edges |

**Key insight:** Terminal UI has many subtle edge cases (wide characters, ANSI code length, cursor position). Libraries handle these; hand-rolling does not.

## Common Pitfalls

### Pitfall 1: Score Inflation from Small Edges
**What goes wrong:** Small edges (1-2%) get high scores if liquidity/confidence are good
**Why it happens:** Linear scaling treats 1% and 10% edge too similarly
**How to avoid:** Apply minimum threshold ($0.05 net profit) BEFORE scoring, use logarithmic scaling for edge factor
**Warning signs:** Seeing score 7+ opportunities with <3% net edge

```typescript
// Prevention: threshold check before scoring
const MIN_PROFIT_THRESHOLD = 0.05;  // $0.05 minimum per research

function shouldScore(opp: UnifiedOpportunity): boolean {
  // Assume $100 unit trade
  const profit = opp.netEdge * 100;
  return profit >= MIN_PROFIT_THRESHOLD * 100;  // $5 minimum on $100
}
```

### Pitfall 2: Kelly Criterion Over-Sizing
**What goes wrong:** Full Kelly suggests 40%+ of bankroll on high-confidence opportunities
**Why it happens:** Kelly optimizes for long-term growth, not drawdown
**How to avoid:** Use half-Kelly with hard 10% cap
**Warning signs:** Position sizes exceeding 15% of bankroll

### Pitfall 3: Stale Data in Watch Mode
**What goes wrong:** Dashboard shows outdated opportunities because refresh failed silently
**Why it happens:** Network errors swallowed, no staleness indicator
**How to avoid:** Display "last updated" timestamp, dim/warn on stale data (>30 min)
**Warning signs:** Acting on opportunity that no longer exists

### Pitfall 4: Cross-Platform Arb Shown Despite Disabled Flag
**What goes wrong:** CrossPlatformArbDetector output appears in dashboard
**Why it happens:** Aggregator doesn't check feature flag, only detector does
**How to avoid:** Double-check feature flag in aggregator AND detector
**Warning signs:** Any cross-platform opportunity appearing before Phase 3

### Pitfall 5: Terminal Rendering Flicker
**What goes wrong:** Dashboard flickers on refresh, losing scroll position
**Why it happens:** Full re-render on each data update
**How to avoid:** Ink handles this automatically; don't use raw stdout writes
**Warning signs:** Visible screen clear/redraw, cursor jumping

## Code Examples

Verified patterns from official sources and existing codebase:

### Kelly Criterion with Half-Kelly and Cap
```typescript
// Source: Research findings + RATE requirements
interface KellyInput {
  /** Estimated edge (0-1), e.g., 0.05 = 5% edge */
  edge: number;
  /** Confidence in edge estimate (0-1) */
  confidence: number;
  /** Total bankroll in USD */
  bankroll: number;
  /** Kelly fraction to use (0.5 = half-Kelly) */
  fraction?: number;
  /** Maximum position as fraction of bankroll */
  maxPosition?: number;
}

interface KellyOutput {
  /** Suggested position size in USD */
  positionSize: number;
  /** Position as percentage of bankroll */
  positionPercent: number;
  /** Whether cap was applied */
  cappedBy: 'none' | 'kelly' | 'max';
}

function calculateKelly(input: KellyInput): KellyOutput {
  const {
    edge,
    confidence,
    bankroll,
    fraction = 0.5,      // Half-Kelly default (SIZE-03)
    maxPosition = 0.10,  // 10% cap default (SIZE-04)
  } = input;

  // Kelly formula: f* = edge / odds
  // For binary: odds = 1 (even money equivalent)
  // Adjusted by confidence
  const adjustedEdge = edge * confidence;

  // Handle edge cases
  if (adjustedEdge <= 0) {
    return { positionSize: 0, positionPercent: 0, cappedBy: 'kelly' };
  }

  // Full Kelly fraction
  const fullKelly = adjustedEdge;

  // Apply fractional Kelly
  const fractionalKelly = fullKelly * fraction;

  // Apply maximum cap
  const cappedFraction = Math.min(fractionalKelly, maxPosition);

  // Determine what limited the position
  let cappedBy: KellyOutput['cappedBy'] = 'none';
  if (cappedFraction < fractionalKelly) {
    cappedBy = 'max';
  } else if (fractionalKelly < fullKelly * fraction) {
    cappedBy = 'kelly';
  }

  const positionSize = bankroll * cappedFraction;

  return {
    positionSize: Math.round(positionSize * 100) / 100,  // Round to cents
    positionPercent: cappedFraction * 100,
    cappedBy,
  };
}
```

### Edge Size Scoring Factor
```typescript
// Source: Requirements RATE-02, research $0.05 minimum threshold
function edgeSizeFactor(opp: UnifiedOpportunity): number {
  const netEdge = opp.netEdge * 100;  // Convert to percentage

  // Thresholds based on research
  // 5% threshold (RATE-06), realistic max ~20% for good opportunities
  if (netEdge < 5) return 1;      // Below threshold
  if (netEdge < 7) return 3;      // Marginal
  if (netEdge < 10) return 5;     // Decent
  if (netEdge < 15) return 7;     // Good
  if (netEdge < 20) return 9;     // Excellent
  return 10;                       // Exceptional (rare)
}
```

### Ink Dashboard with Select Component
```tsx
// Source: Ink + @inkjs/ui documentation
import React, { useState } from 'react';
import { render, Box, Text } from 'ink';
import { Select, Spinner, Badge } from '@inkjs/ui';

interface OpportunityRow {
  id: string;
  score: number;
  market: string;
  edge: string;
  type: string;
  size: string;
}

function Dashboard({ opportunities }: { opportunities: OpportunityRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (loading) {
    return <Spinner label="Refreshing opportunities..." />;
  }

  if (opportunities.length === 0) {
    return <Text color="yellow">No opportunities found above threshold</Text>;
  }

  const options = opportunities.map(opp => ({
    label: formatRow(opp),
    value: opp.id,
  }));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Opportunities</Text>
        <Text dimColor> (use arrow keys, Enter for details)</Text>
      </Box>

      <Select
        options={options}
        onChange={(value) => setSelected(value)}
      />

      {selected && (
        <OpportunityDetail id={selected} />
      )}
    </Box>
  );
}

function formatRow(opp: OpportunityRow): string {
  const scoreColor = opp.score >= 7 ? 'green' : opp.score >= 5 ? 'yellow' : 'gray';
  return `[${opp.score.toFixed(1)}] ${opp.market.slice(0, 40).padEnd(40)} ${opp.edge.padStart(6)} ${opp.type.padEnd(12)} ${opp.size}`;
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 7) return <Badge color="green">{score.toFixed(1)}</Badge>;
  if (score >= 5) return <Badge color="yellow">{score.toFixed(1)}</Badge>;
  return <Badge color="gray">{score.toFixed(1)}</Badge>;
}
```

### Color-Coded Table with cli-table3
```typescript
// Source: cli-table3 + chalk documentation
import Table from 'cli-table3';
import chalk from 'chalk';

function formatOpportunityTable(opportunities: ScoredOpportunity[]): string {
  const table = new Table({
    head: [
      chalk.bold('Score'),
      chalk.bold('Market'),
      chalk.bold('Edge'),
      chalk.bold('Type'),
      chalk.bold('Size'),
    ],
    colWidths: [8, 45, 10, 15, 12],
    style: { head: [], border: [] },
  });

  for (const opp of opportunities) {
    const scoreCell = formatScore(opp.score);
    const edgeCell = formatEdge(opp.netEdge);

    table.push([
      scoreCell,
      opp.marketQuestion.slice(0, 42),
      edgeCell,
      opp.type,
      `$${opp.positionSize.toFixed(0)}`,
    ]);
  }

  return table.toString();
}

function formatScore(score: number): string {
  const text = score.toFixed(1);
  if (score >= 7) return chalk.green.bold(text);
  if (score >= 5) return chalk.yellow(text);
  return chalk.dim(text);
}

function formatEdge(edge: number): string {
  const pct = (edge * 100).toFixed(1) + '%';
  if (edge >= 0.15) return chalk.green(pct);
  if (edge >= 0.10) return chalk.yellow(pct);
  return pct;
}
```

### Opportunity Aggregator
```typescript
// Source: Derived from existing detector interfaces
import { MultiOutcomeArbDetector, ArbOpportunity } from '../detectors/multi-outcome-arb.js';
import { CorrelatedMarketsDetector, CorrelatedOpportunity } from '../detectors/correlated-markets.js';
import { CrossPlatformArbDetector, CrossPlatformOpportunity } from '../detectors/cross-platform-arb.js';
import { featureFlags } from '../config/feature-flags.js';

interface AggregatedResult {
  opportunities: UnifiedOpportunity[];
  errors: Array<{ detector: string; error: Error }>;
  timestamp: number;
}

class OpportunityAggregator {
  private multiOutcome = new MultiOutcomeArbDetector();
  private correlated = new CorrelatedMarketsDetector();
  private crossPlatform = new CrossPlatformArbDetector();

  async aggregate(): Promise<AggregatedResult> {
    const opportunities: UnifiedOpportunity[] = [];
    const errors: AggregatedResult['errors'] = [];

    // Multi-outcome arbitrage (both platforms)
    for (const platform of ['polymarket', 'kalshi'] as const) {
      try {
        const results = await this.multiOutcome.detect(platform);
        opportunities.push(...results.map(r => this.normalizeMultiOutcome(r)));
      } catch (error) {
        errors.push({ detector: `multi-outcome-${platform}`, error: error as Error });
      }
    }

    // Correlated markets (requires market data - fetch from DB)
    try {
      const markets = await this.getRecentMarkets();
      const results = this.correlated.detectFromMarkets(markets);
      opportunities.push(...results.map(r => this.normalizeCorrelated(r)));
    } catch (error) {
      errors.push({ detector: 'correlated', error: error as Error });
    }

    // Cross-platform (only if feature enabled - Phase 3+)
    if (featureFlags.crossPlatformArb) {
      try {
        const results = await this.crossPlatform.detect();
        opportunities.push(...results.map(r => this.normalizeCrossPlatform(r)));
      } catch (error) {
        errors.push({ detector: 'cross-platform', error: error as Error });
      }
    }

    return {
      opportunities,
      errors,
      timestamp: Date.now(),
    };
  }

  private normalizeMultiOutcome(opp: ArbOpportunity): UnifiedOpportunity {
    return {
      id: `mo:${opp.platform}:${opp.marketId}`,
      type: 'multi_outcome',
      platform: opp.platform as Platform,
      marketId: opp.marketId,
      marketQuestion: opp.question,
      grossEdge: opp.grossEdge / 100,
      netEdge: opp.netEdge / 100,
      detectorConfidence: opp.confidence,
      minLiquidity: opp.minLiquidity,
      liquidityDepth: opp.outcomeCount,
      detectedAt: opp.timestamp * 1000,
      raw: opp,
    };
  }

  private normalizeCorrelated(opp: CorrelatedOpportunity): UnifiedOpportunity {
    return {
      id: `cor:${opp.market.platform}:${opp.market.id}`,
      type: 'correlated',
      platform: opp.market.platform,
      marketId: opp.market.id,
      marketQuestion: opp.market.question,
      grossEdge: opp.edgeSize / 100,
      netEdge: opp.expectedValue,
      detectorConfidence: opp.confidence,
      minLiquidity: opp.market.liquidity ?? 0,
      liquidityDepth: opp.market.outcomes.length,
      detectedAt: opp.timestamp,
      closeDate: opp.market.closeDate,
      raw: opp,
    };
  }

  private normalizeCrossPlatform(opp: CrossPlatformOpportunity): UnifiedOpportunity {
    return {
      id: `xp:${opp.polymarketId}:${opp.kalshiTicker}`,
      type: 'cross_platform',
      platform: 'cross',
      marketId: `${opp.polymarketId}|${opp.kalshiTicker}`,
      marketQuestion: `Cross-platform: ${opp.polymarketId}`,
      grossEdge: opp.grossEdge,
      netEdge: opp.netEdge,
      detectorConfidence: opp.opportunityConfidence,
      matchConfidence: opp.matchConfidence,
      minLiquidity: Math.min(opp.polymarketLiquidity, opp.kalshiLiquidity),
      liquidityDepth: 2,
      detectedAt: opp.detectedAt,
      raw: opp,
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| blessed (unmaintained) | neo-blessed or Ink | 2020+ | Ink is actively maintained, TypeScript-first |
| cli-table/cli-table2 | cli-table3 | 2020 | Better Unicode, maintained |
| setInterval polling | recursive setTimeout | Always preferred | Prevents call stacking |
| Full Kelly betting | Fractional Kelly (quarter to half) | Industry standard | ~75% growth with 50% less drawdown |
| Arbitrary position caps | Research-based 10% cap | Per quant research | Aligns with professional practices |

**Deprecated/outdated:**
- **blessed original:** Unmaintained since 2017, use neo-blessed or Ink
- **cli-table / cli-table2:** Unmaintained, use cli-table3
- **vorpal:** Abandoned, use commander + Ink

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal scoring weights**
   - What we know: Weights should favor edge size and confidence
   - What's unclear: Exact optimal values require backtesting on real opportunities
   - Recommendation: Start with suggested defaults, track outcomes, tune weights

2. **Deduplication window length**
   - What we know: 4-6 hours per requirements
   - What's unclear: Whether this should vary by opportunity type
   - Recommendation: Start with 4 hours, extend if users complain about re-alerts

3. **Ink vs cli-table3 for main display**
   - What we know: Both work; Ink better for interactivity, cli-table3 simpler
   - What's unclear: Performance with 100+ rows
   - Recommendation: Use Ink with Select for primary view; cli-table3 for non-interactive output mode

## Sources

### Primary (HIGH confidence)
- [Ink GitHub](https://github.com/vadimdemedes/ink) - React for CLI, hooks, components
- [ink-ui GitHub](https://github.com/vadimdemedes/ink-ui) - Select, Spinner, Badge components
- [cli-table3 GitHub](https://github.com/cli-table/cli-table3) - Table formatting API
- [Node.js Timers Documentation](https://nodejs.org/api/timers.html) - setTimeout/setInterval

### Secondary (MEDIUM confidence)
- [npm-compare: ink vs blessed](https://npm-compare.com/blessed,ink) - Library comparison
- [LogRocket: Ink UI Guide](https://blog.logrocket.com/using-ink-ui-react-build-interactive-custom-clis/) - Component patterns
- [Kelly Criterion Research](https://logicinv.com/blog/algorithmic-trading/how-to-implement-kelly-criterion-in-your-trading-algorithms/) - Implementation guidance
- Project research files (QUANT-ARBITRAGE-ANALYSIS.md, LATEST-MARKET-INTEL.md)

### Tertiary (LOW confidence)
- WebSearch results for polling patterns - validate with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified via npm trends, GitHub activity, official docs
- Architecture: HIGH - Based on existing codebase patterns and established practices
- Scoring algorithm: MEDIUM - Formula standard, weights need tuning
- Pitfalls: HIGH - Derived from quant research and real failure modes

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days for stable libraries)
