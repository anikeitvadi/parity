# Phase 3: Cross-Platform Arbitrage Enablement - Research

**Researched:** 2026-02-04
**Domain:** Settlement rule extraction and cross-platform oracle verification
**Confidence:** MEDIUM

## Summary

Phase 3 enables cross-platform arbitrage by building settlement rule parsers that extract and compare resolution criteria between Polymarket (UMA Optimistic Oracle) and Kalshi (CFTC-regulated centralized settlement). This research investigated the fundamental architectural differences between these platforms, the structure of their resolution metadata, and the risk of settlement divergence.

**Key findings:**
- Polymarket uses decentralized UMA oracle with 2-hour liveness, whitelisted proposers (since 2025), and escalation to token-holder voting
- Kalshi uses centralized CFTC-regulated settlement with deterministic official data sources and manual oversight
- Settlement divergence has caused confirmed double losses (2024 government shutdown case: Polymarket YES, Kalshi NO)
- Market APIs provide structured resolution metadata (Kalshi: `rules_primary`/`rules_secondary`, Polymarket: question text + UMA ancillary data)
- String similarity algorithms (Levenshtein, cosine) and NLP date parsing (Chrono) provide foundational tools for rule comparison

**Primary risks:**
1. Settlement divergence from different resolution criteria interpretation (eliminates arbitrage profit)
2. Timing differences (Polymarket 2h liveness vs Kalshi official data delay)
3. Oracle manipulation risk (2025 Ukraine whale incident: 25% voting power manipulated $7M market)

**Primary recommendation:** Build rule-based parser with string similarity scoring + manual override database. Start conservative with high-confidence matches only, progressively tune as settlement outcomes validate matching accuracy.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| string-similarity | 4.x | Text similarity scoring | Dice's coefficient implementation, better than Levenshtein for short texts |
| chrono-node | 2.x | Date/time extraction | Natural language date parser, supports multiple languages, actively maintained |
| zod | 3.x | Schema validation | Already in project, validates extracted settlement metadata |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| compromise | 14.x | NLP text processing | Optional: enhances keyword extraction from resolution rules |
| date-fns | 3.x | Date manipulation | Already in project, normalizes extracted dates for comparison |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| string-similarity | natural (Node NLP) | Natural is heavier (ML-based), overkill for short text comparison |
| chrono-node | Custom regex parser | Regex brittle for varied date formats ("Jan 20", "2026-01-20", "January 20th 2026") |
| Rule-based parser | OpenAI API for semantic comparison | Cost per comparison, latency, external dependency, privacy concerns |

**Installation:**
```bash
npm install string-similarity chrono-node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── parsers/
│   ├── settlement-parser.ts           # Main parser interface
│   ├── polymarket-parser.ts           # Polymarket-specific extraction
│   ├── kalshi-parser.ts               # Kalshi-specific extraction
│   └── similarity-scorer.ts           # Cross-platform comparison
├── services/
│   ├── settlement-comparator.ts       # Orchestrates parsing + comparison
│   └── settlement-override-db.ts      # Manual curation database
├── database/
│   └── schema.ts                      # Add settlement_comparisons table
└── types/
    └── settlement.ts                  # Settlement metadata types
```

### Pattern 1: Structured Metadata Extraction
**What:** Extract structured fields from API responses before applying NLP
**When to use:** Always - prefer structured data over text parsing when available
**Example:**
```typescript
// Kalshi provides structured rules
interface KalshiMarketRules {
  rules_primary: string;      // Main resolution criteria
  rules_secondary: string;    // Edge cases, clarifications
  strike_type: 'greater' | 'less' | 'between' | 'functional' | 'custom';
  expiration_value?: number;  // Settlement value
  settlement_source?: string; // Official data source
}

// Polymarket provides question + ancillary data (UMA contract)
interface PolymarketRules {
  question: string;           // Market question
  description?: string;       // Additional context
  outcomes: string[];         // Outcome labels
  // Note: UMA ancillary data stored on-chain, may need separate fetch
}

// Extract structured fields FIRST, then parse unstructured text
function extractKalshiCriteria(market: KalshiMarket): SettlementCriteria {
  return {
    question: market.title,
    primaryRule: market.rules_primary,
    secondaryRule: market.rules_secondary,
    dataSource: market.settlement_source,
    strikeType: market.strike_type,
    // Then parse dates/times from primaryRule text
    resolutionDate: parseDate(market.rules_primary),
  };
}
```

### Pattern 2: Multi-Level Similarity Scoring
**What:** Compare markets at multiple semantic levels (question, criteria, timing, data source)
**When to use:** Settlement rule comparison - no single metric captures full equivalence
**Example:**
```typescript
interface SimilarityScore {
  questionSimilarity: number;      // 0-1: Text similarity of main question
  criteriaMatch: number;           // 0-1: Resolution criteria alignment
  timingMatch: number;             // 0-1: Settlement date proximity
  dataSourceMatch: number;         // 0-1: Official source agreement
  overallConfidence: number;       // Weighted composite
}

function compareSettlementRules(
  poly: PolymarketRules,
  kalshi: KalshiRules
): SimilarityScore {
  const questionSim = stringSimilarity.compareTwoStrings(
    normalizeText(poly.question),
    normalizeText(kalshi.title)
  );

  const criteriaSim = compareCriteria(poly, kalshi);
  const timingSim = compareTimings(poly, kalshi);
  const sourceSim = compareDataSources(poly, kalshi);

  // Weighted average - tune weights based on settlement outcomes
  return {
    questionSimilarity: questionSim,
    criteriaMatch: criteriaSim,
    timingMatch: timingSim,
    dataSourceMatch: sourceSim,
    overallConfidence:
      questionSim * 0.3 +
      criteriaSim * 0.4 +  // Criteria most important
      timingSim * 0.2 +
      sourceSim * 0.1
  };
}
```

### Pattern 3: Manual Override Database
**What:** Curated database of known matches/mismatches with settlement outcomes
**When to use:** Always - builds institutional knowledge, improves over time
**Example:**
```typescript
// Database schema
interface SettlementComparison {
  id: number;
  polymarket_id: string;
  kalshi_ticker: string;
  comparison_date: number;
  question_similarity: number;
  criteria_match: number;
  timing_match: number;
  data_source_match: number;
  overall_confidence: number;
  manual_override: 'safe' | 'unsafe' | null;  // Human judgment
  settlement_outcome: 'matched' | 'diverged' | null;  // Actual result
  notes: string;
}

// Use historical outcomes to train confidence thresholds
function calculateSafetyThreshold(): number {
  const historical = getHistoricalComparisons();
  const diverged = historical.filter(c => c.settlement_outcome === 'diverged');

  // Find minimum confidence where divergence occurred
  // Set threshold above this (safety margin)
  const minDivergedConfidence = Math.min(...diverged.map(c => c.overall_confidence));
  return minDivergedConfidence + 0.1;  // 10% safety buffer
}
```

### Pattern 4: Progressive Enablement
**What:** Start with high-confidence matches only, expand as validation accumulates
**When to use:** New feature with real financial risk - validate conservatively
**Example:**
```typescript
// Phase 3.1: 0.9+ confidence only (extremely conservative)
const PHASE_3_1_THRESHOLD = 0.9;

// Phase 3.2: Lower to 0.8 after 10+ successful settlements
const PHASE_3_2_THRESHOLD = 0.8;
const REQUIRED_VALIDATIONS = 10;

function getActiveThreshold(): number {
  const validations = countSuccessfulSettlements();

  if (validations < REQUIRED_VALIDATIONS) {
    return PHASE_3_1_THRESHOLD;
  }

  return PHASE_3_2_THRESHOLD;
}

function shouldEnableArbitrage(similarity: SimilarityScore): boolean {
  const threshold = getActiveThreshold();

  // Additional safety checks
  if (similarity.overallConfidence < threshold) return false;
  if (similarity.criteriaMatch < 0.7) return false;  // Hard criteria requirement
  if (similarity.timingMatch < 0.5) return false;    // Must resolve around same time

  // Check manual override database
  const override = checkManualOverride(polyId, kalshiId);
  if (override === 'unsafe') return false;
  if (override === 'safe') return true;

  return true;
}
```

### Anti-Patterns to Avoid

- **Text-only comparison:** Don't rely solely on question similarity. "Will Trump win?" identical questions can have different resolution criteria (electoral college vs popular vote, certification date vs election day).

- **Ignoring data source divergence:** Polymarket uses blockchain oracles, Kalshi uses official government sources. Different data sources = settlement risk even if questions match.

- **Treating all arbitrage equally:** Some event types (binary outcomes with clear official sources) are safer than others (subjective judgments, complex multi-step conditions).

- **No feedback loop:** Without tracking settlement outcomes, you can't improve matching accuracy over time. Database must record actual divergence/match results.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date parsing from natural language | Regex for "Jan 20, 2026" | chrono-node | Handles 100+ date formats, timezones, relative dates ("2 weeks from now") |
| String similarity scoring | Custom edit distance | string-similarity | Dice coefficient optimized for short text, handles edge cases |
| Market question normalization | Manual .toLowerCase().trim() | Text preprocessing pipeline | Handles punctuation, stop words, unicode, contractions |
| Resolution criteria classification | Keywords + if/else chains | Rule-based parser with structured extraction | Maintainable, testable, extensible to new platforms |

**Key insight:** Settlement rule parsing isn't AI-hard, it's data structure hard. Most complexity comes from inconsistent metadata formats across platforms, not semantic understanding. Focus on structured extraction patterns, not ML models.

## Common Pitfalls

### Pitfall 1: False Confidence from Question Similarity
**What goes wrong:** 95%+ question similarity doesn't guarantee settlement alignment. Example: "Will there be a government shutdown?" - Polymarket settled on OPM announcement, Kalshi on actual 24h+ shutdown. Both had "government shutdown" in question, but criteria diverged.
**Why it happens:** Question text describes the *event*, not the *resolution criteria*. Criteria often buried in secondary rules or implied by data source.
**How to avoid:**
- Always extract and compare `rules_primary` (Kalshi) or UMA ancillary data (Polymarket)
- Weight criteria match higher than question match in composite score
- Flag markets with subjective resolution conditions as high-risk
**Warning signs:**
- High question similarity (>0.9) but low criteria similarity (<0.7)
- Different data sources (e.g., "betting markets" vs "official election results")
- Presence of words like "announcement", "perception", "generally considered"

### Pitfall 2: Timing Divergence Creates One-Sided Settlement
**What goes wrong:** Market resolves YES on Polymarket (fast 2h oracle) but NO on Kalshi (waits for official data). Arbitrageur loses both positions.
**Why it happens:** Polymarket's 2-hour liveness period allows proposals based on news reports. Kalshi waits for official source publication (can be days/weeks later). If initial report incorrect, markets diverge.
**How to avoid:**
- Extract and compare resolution timeframes from rules
- Flag markets with different settlement triggers ("within 24h of event" vs "upon official announcement")
- Require `timingMatch > 0.7` for cross-platform arbitrage
- Disable arbitrage for markets resolving before official data available
**Warning signs:**
- Polymarket question includes "immediately after" or "as reported by"
- Kalshi rules specify "official", "final", "certified" data
- Large timing gap between market close and expected data publication

### Pitfall 3: Oracle Manipulation Risk (Polymarket-Specific)
**What goes wrong:** UMA whale with significant voting power disputes correct proposal, forces favorable outcome. March 2025 example: 25% voting power manipulated $7M Ukraine market.
**Why it happens:** UMA is decentralized oracle - sufficient voting power can override correct resolution. Requires 51% to succeed, but even failed attempts cause delays and uncertainty.
**How to avoid:**
- Monitor UMA voting power distribution for markets in settlement
- Disable cross-platform arbitrage if resolution goes to dispute
- Consider market size vs whale manipulation incentive (small markets less risky)
- Prefer markets with clear, objective criteria (harder to dispute)
**Warning signs:**
- Market enters dispute phase (escalated to DVM vote)
- High-value markets (>$1M) with subjective outcomes
- Recent oracle manipulation news in prediction market ecosystem

### Pitfall 4: Regulatory Divergence Risk
**What goes wrong:** Different legal frameworks cause platforms to void/settle differently. 2026 Massachusetts example: Kalshi halted sports contracts, Polymarket continued.
**Why it happens:** Polymarket (decentralized, offshore) and Kalshi (CFTC-regulated, US-based) face different legal requirements. Regulatory action can force platform to void markets or settle unexpectedly.
**How to avoid:**
- Track regulatory news for both platforms
- Flag markets in categories facing legal challenges (sports betting, political markets)
- Require manual review for politically-sensitive markets
- Build kill-switch to disable cross-platform arb during regulatory uncertainty
**Warning signs:**
- Market category recently faced cease-and-desist orders
- News of pending lawsuits against either platform
- Market remains open on one platform but closed/voided on other

### Pitfall 5: API Metadata Staleness
**What goes wrong:** Settlement rules change after market creation, but cached API data shows old rules. Comparison based on outdated criteria.
**Why it happens:** Both platforms allow rule clarifications/updates. Polymarket stores updates in "bulletin board" transactions. Kalshi may update `rules_secondary` field. If system caches initial rules, misses updates.
**How to avoid:**
- Fetch fresh market metadata before every settlement comparison
- Track `updated_time` field (Kalshi) or bulletin board transactions (Polymarket)
- Alert if market rules changed after cross-platform match established
- Re-run comparison if rules updated within 48h of resolution
**Warning signs:**
- `updated_time` timestamp recent relative to market creation
- Polymarket description mentions "see bulletin for updates"
- Community discussion about "rule change" or "clarification"

## Code Examples

### Settlement Parser Interface
```typescript
// src/types/settlement.ts
export interface SettlementCriteria {
  platform: 'polymarket' | 'kalshi';
  marketId: string;
  question: string;
  primaryRule: string;
  secondaryRule?: string;
  outcomes: string[];
  resolutionDate?: Date;
  dataSource?: string;
  settlementType: 'binary' | 'scalar' | 'categorical';
  extracted: {
    dates: Date[];
    keywords: string[];
    entities: string[];
  };
}

export interface SettlementComparison {
  polymarketId: string;
  kalshiTicker: string;
  similarity: {
    question: number;
    criteria: number;
    timing: number;
    dataSource: number;
    overall: number;
  };
  safeForArbitrage: boolean;
  riskFactors: string[];
  comparedAt: Date;
}
```

### Polymarket Settlement Parser
```typescript
// src/parsers/polymarket-parser.ts
import Chrono from 'chrono-node';
import { SettlementCriteria } from '../types/settlement.js';

export class PolymarketSettlementParser {
  parse(market: PolymarketMarket): SettlementCriteria {
    // Extract dates from question and description
    const text = `${market.question} ${market.description || ''}`;
    const parsedDates = Chrono.parse(text);

    // Extract keywords (excluding stop words)
    const keywords = this.extractKeywords(market.question);

    // Extract named entities (people, places, organizations)
    const entities = this.extractEntities(text);

    return {
      platform: 'polymarket',
      marketId: market.id,
      question: market.question,
      primaryRule: market.description || market.question,
      outcomes: market.outcomes,
      resolutionDate: parsedDates[0]?.start?.date(),
      settlementType: 'binary',
      extracted: {
        dates: parsedDates.map(d => d.start.date()),
        keywords,
        entities,
      },
    };
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'will', 'be', 'is', 'in', 'on', 'at', 'to', 'for']);
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private extractEntities(text: string): string[] {
    // Simple capitalized word extraction
    // Could be enhanced with proper NER library
    const words = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    return [...new Set(words)];
  }
}
```

### Kalshi Settlement Parser
```typescript
// src/parsers/kalshi-parser.ts
import Chrono from 'chrono-node';
import { SettlementCriteria } from '../types/settlement.js';

export class KalshiSettlementParser {
  parse(market: KalshiMarket): SettlementCriteria {
    // Kalshi provides structured rules
    const text = `${market.title} ${market.rules_primary} ${market.rules_secondary || ''}`;
    const parsedDates = Chrono.parse(text);

    // Extract data source if mentioned
    const dataSource = this.extractDataSource(market.rules_primary);

    return {
      platform: 'kalshi',
      marketId: market.ticker,
      question: market.title,
      primaryRule: market.rules_primary,
      secondaryRule: market.rules_secondary,
      outcomes: ['yes', 'no'],
      resolutionDate: market.expiration_time ? new Date(market.expiration_time) : parsedDates[0]?.start?.date(),
      dataSource,
      settlementType: this.mapSettlementType(market.strike_type),
      extracted: {
        dates: parsedDates.map(d => d.start.date()),
        keywords: this.extractKeywords(market.rules_primary),
        entities: this.extractEntities(text),
      },
    };
  }

  private extractDataSource(text: string): string | undefined {
    // Look for phrases like "according to", "as reported by", "official data from"
    const patterns = [
      /according to ([^,.]+)/i,
      /as reported by ([^,.]+)/i,
      /official data from ([^,.]+)/i,
      /data source: ([^,.]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }

    return undefined;
  }

  private mapSettlementType(strikeType: string): 'binary' | 'scalar' | 'categorical' {
    if (strikeType === 'greater' || strikeType === 'less' || strikeType === 'between') {
      return 'scalar';
    }
    return 'binary';
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'will', 'be', 'is', 'in', 'on', 'at', 'to', 'for']);
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private extractEntities(text: string): string[] {
    const words = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    return [...new Set(words)];
  }
}
```

### Settlement Comparator
```typescript
// src/services/settlement-comparator.ts
import stringSimilarity from 'string-similarity';
import { PolymarketSettlementParser } from '../parsers/polymarket-parser.js';
import { KalshiSettlementParser } from '../parsers/kalshi-parser.js';
import { SettlementComparison } from '../types/settlement.js';

export class SettlementComparator {
  private polyParser = new PolymarketSettlementParser();
  private kalshiParser = new KalshiSettlementParser();

  async compare(
    polyMarket: PolymarketMarket,
    kalshiMarket: KalshiMarket
  ): Promise<SettlementComparison> {
    // Parse both markets
    const polyCriteria = this.polyParser.parse(polyMarket);
    const kalshiCriteria = this.kalshiParser.parse(kalshiMarket);

    // Calculate similarity scores
    const questionSim = stringSimilarity.compareTwoStrings(
      this.normalize(polyCriteria.question),
      this.normalize(kalshiCriteria.question)
    );

    const criteriaSim = stringSimilarity.compareTwoStrings(
      this.normalize(polyCriteria.primaryRule),
      this.normalize(kalshiCriteria.primaryRule)
    );

    const timingSim = this.compareTimings(polyCriteria, kalshiCriteria);
    const dataSourceSim = this.compareDataSources(polyCriteria, kalshiCriteria);

    // Weighted composite
    const overallSim =
      questionSim * 0.3 +
      criteriaSim * 0.4 +
      timingSim * 0.2 +
      dataSourceSim * 0.1;

    // Assess risk factors
    const riskFactors = this.assessRiskFactors(polyCriteria, kalshiCriteria);

    // Check manual override database
    const manualOverride = await this.checkManualOverride(polyMarket.id, kalshiMarket.ticker);

    // Determine if safe for arbitrage
    const safeForArbitrage = this.isSafeForArbitrage(
      overallSim,
      criteriaSim,
      timingSim,
      riskFactors,
      manualOverride
    );

    return {
      polymarketId: polyMarket.id,
      kalshiTicker: kalshiMarket.ticker,
      similarity: {
        question: questionSim,
        criteria: criteriaSim,
        timing: timingSim,
        dataSource: dataSourceSim,
        overall: overallSim,
      },
      safeForArbitrage,
      riskFactors,
      comparedAt: new Date(),
    };
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private compareTimings(poly: SettlementCriteria, kalshi: SettlementCriteria): number {
    if (!poly.resolutionDate || !kalshi.resolutionDate) return 0.5;

    const daysDiff = Math.abs(
      (poly.resolutionDate.getTime() - kalshi.resolutionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 0 days = 1.0, 7 days = 0.5, 14+ days = 0.0
    return Math.max(0, 1 - (daysDiff / 14));
  }

  private compareDataSources(poly: SettlementCriteria, kalshi: SettlementCriteria): number {
    if (!poly.dataSource || !kalshi.dataSource) return 0.5;

    return stringSimilarity.compareTwoStrings(
      this.normalize(poly.dataSource),
      this.normalize(kalshi.dataSource)
    );
  }

  private assessRiskFactors(poly: SettlementCriteria, kalshi: SettlementCriteria): string[] {
    const risks: string[] = [];

    // Timing risk
    if (!poly.resolutionDate || !kalshi.resolutionDate) {
      risks.push('Missing resolution date');
    } else {
      const daysDiff = Math.abs(
        (poly.resolutionDate.getTime() - kalshi.resolutionDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > 7) {
        risks.push(`Resolution dates differ by ${daysDiff.toFixed(0)} days`);
      }
    }

    // Data source divergence
    if (poly.dataSource && kalshi.dataSource) {
      const sourceSim = stringSimilarity.compareTwoStrings(
        this.normalize(poly.dataSource),
        this.normalize(kalshi.dataSource)
      );
      if (sourceSim < 0.5) {
        risks.push('Different data sources');
      }
    }

    // Subjective criteria detection
    const subjectiveKeywords = ['generally', 'considered', 'perceived', 'announcement', 'reported'];
    const rulesText = `${poly.primaryRule} ${kalshi.primaryRule}`.toLowerCase();
    for (const keyword of subjectiveKeywords) {
      if (rulesText.includes(keyword)) {
        risks.push(`Subjective criteria detected: "${keyword}"`);
        break;
      }
    }

    return risks;
  }

  private async checkManualOverride(polyId: string, kalshiId: string): Promise<'safe' | 'unsafe' | null> {
    // Query settlement_comparisons table for manual overrides
    // Return null if no override exists
    return null;  // Placeholder
  }

  private isSafeForArbitrage(
    overallSim: number,
    criteriaSim: number,
    timingSim: number,
    risks: string[],
    manualOverride: 'safe' | 'unsafe' | null
  ): boolean {
    // Manual override takes precedence
    if (manualOverride === 'unsafe') return false;
    if (manualOverride === 'safe') return true;

    // Phase 3.1 conservative thresholds
    const OVERALL_THRESHOLD = 0.9;
    const CRITERIA_THRESHOLD = 0.7;
    const TIMING_THRESHOLD = 0.5;

    // Must meet all thresholds
    if (overallSim < OVERALL_THRESHOLD) return false;
    if (criteriaSim < CRITERIA_THRESHOLD) return false;
    if (timingSim < TIMING_THRESHOLD) return false;

    // Any critical risk factors -> unsafe
    const criticalKeywords = ['different data sources', 'missing resolution date'];
    const hasCriticalRisk = risks.some(risk =>
      criticalKeywords.some(keyword => risk.toLowerCase().includes(keyword))
    );

    if (hasCriticalRisk) return false;

    return true;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual arbitrage without settlement verification | Automated settlement comparison before enabling arbitrage | 2024-2025 (after government shutdown divergence) | Prevents double-loss scenarios |
| UMA resolution anyone can propose | MOOV2 whitelisted proposers (37 approved addresses) | 2025 | Reduced spam proposals, improved resolution quality, but increased centralization |
| Text-only question matching | Multi-level similarity (question + criteria + timing + source) | 2024+ | Better captures settlement equivalence |
| Kalshi anyone can trade | CFTC-regulated exchange with KYC | 2022 | Regulatory compliance, but limits accessibility vs Polymarket |

**Deprecated/outdated:**
- **Polymarket OOV2:** Replaced by MOOV2 in 2025, anyone-can-propose model no longer used
- **Question-only matching:** Insufficient for settlement alignment, must compare criteria
- **Ignoring oracle risk:** March 2025 whale manipulation highlighted governance attack vector

## Open Questions

1. **How to access Polymarket UMA ancillary data on-chain?**
   - What we know: Resolution criteria stored as `ancillaryData` on UmaCtfAdapter contract
   - What's unclear: How to efficiently fetch this for all markets (requires on-chain queries)
   - Recommendation: Start with Gamma API question/description fields, add on-chain fetch in Phase 3.2 if needed

2. **What confidence threshold balances safety vs opportunity count?**
   - What we know: 0.9 overall + 0.7 criteria is conservative but may miss valid arbitrage
   - What's unclear: Historical divergence rate at different confidence levels (no public dataset)
   - Recommendation: Start at 0.9, build settlement outcome database over 1-2 months, tune based on data

3. **How to detect Kalshi rule updates after initial comparison?**
   - What we know: Kalshi provides `updated_time` field in API response
   - What's unclear: Does this timestamp update for rule clarifications, or only for major changes?
   - Recommendation: Track `updated_time` on every fetch, re-run comparison if changed within 48h of resolution

4. **Should we disable arbitrage during UMA dispute phase?**
   - What we know: Disputes take 48h for DVM voting, outcome uncertain during this period
   - What's unclear: Historical rate of disputes overturning initial proposals
   - Recommendation: Disable cross-platform arbitrage if Polymarket market enters dispute phase (conservative approach)

5. **How to weight different market categories by settlement risk?**
   - What we know: Binary outcomes with official data sources (elections, economic indicators) are lower risk than subjective outcomes (cultural predictions, social events)
   - What's unclear: Quantified risk by category (no historical settlement divergence data by type)
   - Recommendation: Start with single threshold across all categories, add category-specific weights in Phase 3.2 after collecting data

## Sources

### Primary (HIGH confidence)
- [Polymarket UMA Resolution Documentation](https://docs.polymarket.com/developers/resolution/UMA) - Official documentation on Optimistic Oracle mechanics
- [Kalshi Market Rules Help Center](https://help.kalshi.com/markets/markets-101/market-rules) - Official documentation on settlement process
- [Kalshi API - Get Market Endpoint](https://docs.kalshi.com/api-reference/market/get-market) - API schema including `rules_primary`, `rules_secondary`, settlement fields
- [Polymarket Data Feeds Documentation](https://docs.polymarket.com/developers/market-makers/data-feeds) - Gamma API structure and market metadata

### Secondary (MEDIUM confidence)
- [RockNBlock: Inside UMA Oracle](https://rocknblock.io/blog/how-prediction-markets-resolution-works-uma-optimistic-oracle-polymarket) - Technical deep-dive on UMA resolution workflow
- [UMA Blog: Managed Proposers](https://blog.uma.xyz/articles/managed-proposers) - MOOV2 update announcement and rationale
- [Medium: The Polymarket API by Jung-Hua Liu](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf) - API architecture and usage patterns (Jan 2026)
- [Prediction Market Arbitrage Guide 2026](https://newyorkcityservers.com/blog/prediction-market-arbitrage-guide) - Settlement divergence examples and risk factors
- [ChainCatcher: Hidden Profits in Prediction Markets](https://www.chaincatcher.com/en/article/2242638) - 2024 government shutdown divergence case study
- [Lines: Polymarket vs Kalshi comparison](https://www.lines.com/prediction-market) - Platform settlement mechanism differences

### Secondary (MEDIUM confidence) - NLP/String Libraries
- [GitHub: chrono - Natural Language Date Parser](https://github.com/wanasit/chrono) - Most popular JS date parsing library
- [GitHub: string-similarity - Dice's Coefficient Implementation](https://github.com/aceakash/string-similarity) - String comparison library
- [SpotIntelligence: Text Similarity in Python](https://spotintelligence.com/2022/12/19/text-similarity-python/) - Algorithm comparisons and use cases
- [MDN: Named Capturing Groups](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_capturing_group) - Regex pattern extraction documentation
- [InfoQ: ArkRegex Introduction](https://www.infoq.com/news/2026/01/arkregex-introduced-typescript/) - Type-safe regex library (Jan 2026)

### Tertiary (LOW confidence)
- Various web search results on prediction market settlement disputes - anecdotal examples, not verified through official sources
- Community discussions on settlement divergence - useful for identifying pitfall patterns but not authoritative

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Libraries well-established, but specific application to settlement parsing is novel domain
- Architecture: MEDIUM - Patterns follow proven NLP extraction approaches, but prediction market settlement comparison has limited prior art
- Pitfalls: HIGH - Well-documented historical incidents (government shutdown divergence, UMA whale manipulation, regulatory divergence)

**Research limitations:**
- No public dataset of historical settlement divergences by confidence level
- UMA on-chain ancillary data access pattern not fully verified
- Settlement outcome tracking requires building database over time (no existing source)

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - relatively stable domain, but regulatory landscape changing rapidly)
