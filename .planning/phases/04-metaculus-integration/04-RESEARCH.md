# Phase 4: Metaculus Integration - Research

**Researched:** 2026-02-04
**Domain:** Metaculus API integration, superforecaster consensus divergence detection, and forecast-to-market question matching
**Confidence:** MEDIUM

## Summary

Phase 4 adds Metaculus superforecaster consensus as a signal source to identify markets where expert forecasters disagree with market prices. The Metaculus platform aggregates predictions from skilled forecasters (currently outperforming AI by ~20% on Brier scores), providing a potential edge signal when their consensus diverges from Polymarket/Kalshi odds by >5%.

The primary technical challenges are: (1) matching Metaculus questions to equivalent prediction market events using text similarity without false positives, (2) accessing superforecaster-tier consensus data vs community prediction (API structure unclear from public docs), and (3) detecting forecast staleness since Metaculus questions can go weeks without updates.

Research confirms that Metaculus provides a Python SDK (`forecasting-tools`) with TypeScript equivalents needed, uses token-based authentication (METACULUS_TOKEN from https://metaculus.com/aib), and returns structured question objects with forecast distributions. The existing market-matcher.ts provides proven patterns for cross-platform matching (Jaccard similarity, manual override database, confidence scoring) that extend naturally to Metaculus questions.

**Key findings:**
- Metaculus API documented at metaculus.com/api/ (OpenAPI 3.0 spec) with token authentication
- Python `forecasting-tools` library provides reference implementation for API patterns
- Superforecaster Brier score: 0.081 vs GPT-4.5: 0.101 (AI-human parity predicted Nov 2026)
- Recent study: Polymarket 67% accuracy, Kalshi 78% accuracy on 2,500 markets ($2.5B volume)
- Question matching uses embedding-based similarity (DBSCAN, cosine 0.85) with 4.9% error rate
- Text similarity alone insufficient - requires multi-level scoring like settlement comparison (Phase 3)

**Primary recommendation:** Extend existing MarketMatcher patterns to Metaculus questions with conservative matching thresholds (0.8+ overall confidence), track forecast timestamps for staleness warnings (>7 days), and use manual override database to tune false positive rate below 30%.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | 1.x | HTTP client | Already in project, needed for Metaculus API requests |
| axios-retry | 4.x | Exponential backoff | Standard for API rate limit handling, configurable max retries |
| string-similarity | 4.x | Text similarity | Already in project (Phase 3), proven for market matching |
| zod | 3.x | Schema validation | Already in project, validates Metaculus API responses |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @openai/openai | 4.x | Embeddings API (optional) | Phase 4.2: Semantic matching for ambiguous questions |
| chrono-node | 2.x | Date extraction | Already in project (Phase 3), parses resolution dates from questions |
| date-fns | 3.x | Date manipulation | Already in project, calculates forecast staleness |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axios + axios-retry | got + p-retry | Got is lightweight but axios already standardized in project |
| String similarity | OpenAI embeddings only | Embeddings cost $0.13/1M tokens, overkill for initial matching, use as fallback |
| Manual matching DB | Fully automated semantic matching | Zero false positives preferred over match count, manual curation builds confidence |

**Installation:**
```bash
npm install axios-retry
# Optional Phase 4.2:
# npm install @openai/openai
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── metaculus-client.ts          # API client with rate limiting
│   ├── metaculus-matcher.ts         # Question-to-market matching
│   └── metaculus-divergence.ts      # Divergence detector (implements detector interface)
├── parsers/
│   └── metaculus-parser.ts          # Extract forecast data from API response
├── types/
│   └── metaculus.ts                 # Metaculus question/forecast types
├── data/
│   └── metaculus-matches.json       # Manual curation file
└── config/
    └── feature-flags.ts             # Update: metaculusDivergence = true
```

### Pattern 1: Metaculus API Client with Rate Limiting
**What:** Wrapper around Metaculus API with exponential backoff and token auth
**When to use:** All Metaculus API interactions - enforces rate limits, retry logic
**Example:**
```typescript
// src/services/metaculus-client.ts
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from '../utils/logger.js';

export interface MetaculusQuestion {
  id: number;
  title: string;
  description: string;
  type: 'binary' | 'numeric' | 'multiple_choice' | 'date';
  created_time: string;
  resolve_time: string;
  status: 'open' | 'closed' | 'resolved';
  community_prediction?: {
    q2: number;  // Median prediction
    timestamp: string;
  };
  // Superforecaster tier may be in separate endpoint
  pro_prediction?: {
    q2: number;
    timestamp: string;
  };
}

export interface MetaculusSearchParams {
  limit?: number;
  offset?: number;
  status?: 'open' | 'closed' | 'resolved';
  forecast_type?: 'binary' | 'numeric';
  order_by?: string;
}

export class MetaculusClient {
  private client: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;

    // Create axios instance with defaults
    this.client = axios.create({
      baseURL: 'https://www.metaculus.com/api',
      timeout: 30000,
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Configure exponential backoff for rate limits
    axiosRetry(this.client, {
      retries: 5,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Retry on 429 (rate limit) and 5xx errors
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn({
          retryCount,
          status: error.response?.status,
          url: requestConfig.url,
        }, 'Retrying Metaculus API request');
      },
    });
  }

  /**
   * Search for open binary questions
   */
  async searchQuestions(params: MetaculusSearchParams = {}): Promise<MetaculusQuestion[]> {
    try {
      const response = await this.client.get('/questions/', {
        params: {
          limit: params.limit || 100,
          offset: params.offset || 0,
          status: params.status || 'open',
          forecast_type: params.forecast_type,
          order_by: params.order_by || '-created_time',
        },
      });

      return response.data.results || [];
    } catch (error) {
      logger.error({ error }, 'Failed to search Metaculus questions');
      throw error;
    }
  }

  /**
   * Get question by ID with full details
   */
  async getQuestion(id: number): Promise<MetaculusQuestion> {
    try {
      const response = await this.client.get(`/questions/${id}/`);
      return response.data;
    } catch (error) {
      logger.error({ error, questionId: id }, 'Failed to fetch Metaculus question');
      throw error;
    }
  }

  /**
   * Get question by URL
   */
  async getQuestionByUrl(url: string): Promise<MetaculusQuestion> {
    // Extract question ID from URL
    const match = url.match(/questions\/(\d+)/);
    if (!match) {
      throw new Error(`Invalid Metaculus URL: ${url}`);
    }

    const id = parseInt(match[1], 10);
    return this.getQuestion(id);
  }
}
```

### Pattern 2: Multi-Level Question Matching
**What:** Extend Phase 3 market matcher patterns to Metaculus questions
**When to use:** Matching Metaculus forecasts to Polymarket/Kalshi markets
**Example:**
```typescript
// src/services/metaculus-matcher.ts
import stringSimilarity from 'string-similarity';
import { MetaculusQuestion } from './metaculus-client.js';
import { Market } from '../types/market.js';
import { logger } from '../utils/logger.js';

export interface MetaculusMatch {
  metaculusQuestion: MetaculusQuestion;
  market: Market;
  confidence: number;
  similarity: {
    title: number;
    description: number;
    timing: number;
    overall: number;
  };
  method: 'exact_match' | 'high_similarity' | 'manual_curated';
}

interface ManualMatch {
  metaculus_id: number;
  platform: 'polymarket' | 'kalshi';
  market_id: string;
  verified: boolean;
  notes?: string;
}

export class MetaculusMatcher {
  private manualMatches: ManualMatch[] = [];
  private minConfidence: number;

  constructor(manualMatchesPath?: string, minConfidence: number = 0.8) {
    this.minConfidence = minConfidence;
    // Load manual matches from JSON file
    this.loadManualMatches(manualMatchesPath || 'src/data/metaculus-matches.json');
  }

  /**
   * Match Metaculus questions to markets across platforms
   */
  matchToMarkets(
    questions: MetaculusQuestion[],
    markets: Market[]
  ): MetaculusMatch[] {
    const matches: MetaculusMatch[] = [];

    // Filter to binary questions only (for now)
    const binaryQuestions = questions.filter(q => q.type === 'binary');

    for (const question of binaryQuestions) {
      // Check manual matches first
      const manualMatch = this.findManualMatch(question.id);
      if (manualMatch) {
        const market = markets.find(m =>
          m.platform === manualMatch.platform &&
          m.id === manualMatch.market_id
        );

        if (market) {
          matches.push({
            metaculusQuestion: question,
            market,
            confidence: 1.0,
            similarity: { title: 1.0, description: 1.0, timing: 1.0, overall: 1.0 },
            method: 'manual_curated',
          });
          continue;
        }
      }

      // Algorithmic matching
      for (const market of markets) {
        const similarity = this.calculateSimilarity(question, market);

        if (similarity.overall >= this.minConfidence) {
          matches.push({
            metaculusQuestion: question,
            market,
            confidence: similarity.overall,
            similarity,
            method: similarity.overall === 1.0 ? 'exact_match' : 'high_similarity',
          });
        }
      }
    }

    logger.info({
      questionsCount: binaryQuestions.length,
      marketsCount: markets.length,
      matchesFound: matches.length,
      manualMatches: matches.filter(m => m.method === 'manual_curated').length,
    }, 'Metaculus matching complete');

    return matches;
  }

  /**
   * Calculate multi-level similarity score
   */
  private calculateSimilarity(
    question: MetaculusQuestion,
    market: Market
  ): { title: number; description: number; timing: number; overall: number } {
    // Title similarity
    const titleSim = stringSimilarity.compareTwoStrings(
      this.normalizeText(question.title),
      this.normalizeText(market.question)
    );

    // Description similarity (if available)
    const descSim = question.description && market.metadata?.description
      ? stringSimilarity.compareTwoStrings(
          this.normalizeText(question.description),
          this.normalizeText(market.metadata.description as string)
        )
      : 0.5; // Neutral if missing

    // Timing similarity - must resolve around same time
    const timingSim = this.compareTimings(
      new Date(question.resolve_time),
      new Date(market.closeDate)
    );

    // Weighted composite - title most important, timing critical
    const overall = titleSim * 0.5 + descSim * 0.3 + timingSim * 0.2;

    return {
      title: titleSim,
      description: descSim,
      timing: timingSim,
      overall,
    };
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private compareTimings(date1: Date, date2: Date): number {
    const daysDiff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

    // 0 days = 1.0, 7 days = 0.7, 14 days = 0.5, 30+ days = 0.0
    if (daysDiff <= 7) return 1.0 - (daysDiff / 14);
    if (daysDiff <= 30) return 0.5 - ((daysDiff - 14) / 32);
    return 0.0;
  }

  private findManualMatch(metaculusId: number): ManualMatch | undefined {
    return this.manualMatches.find(m =>
      m.metaculus_id === metaculusId && m.verified
    );
  }

  private loadManualMatches(path: string): void {
    // Implementation similar to MarketMatcher.loadManualMatches()
    // Read JSON file, parse, store in this.manualMatches
  }
}
```

### Pattern 3: Forecast Staleness Detection
**What:** Track forecast timestamps and warn when predictions are >7 days old
**When to use:** Every Metaculus divergence alert - stale forecasts are less actionable
**Example:**
```typescript
// src/services/metaculus-divergence.ts
import { differenceInDays } from 'date-fns';

export interface ForecastStaleness {
  isFresh: boolean;
  daysOld: number;
  lastUpdate: Date;
  warning?: string;
}

export class MetaculusDivergenceDetector {
  private readonly STALE_THRESHOLD_DAYS = 7;

  /**
   * Check if forecast is stale and needs warning
   */
  checkStaleness(forecastTimestamp: string): ForecastStaleness {
    const lastUpdate = new Date(forecastTimestamp);
    const now = new Date();
    const daysOld = differenceInDays(now, lastUpdate);

    const isFresh = daysOld <= this.STALE_THRESHOLD_DAYS;

    const staleness: ForecastStaleness = {
      isFresh,
      daysOld,
      lastUpdate,
    };

    if (!isFresh) {
      if (daysOld <= 14) {
        staleness.warning = 'Forecast is 7-14 days old - may not reflect recent events';
      } else if (daysOld <= 30) {
        staleness.warning = 'Forecast is 2-4 weeks old - significant staleness risk';
      } else {
        staleness.warning = `Forecast is ${daysOld} days old - likely outdated`;
      }
    }

    return staleness;
  }

  /**
   * Detect divergence between Metaculus forecast and market price
   */
  detectDivergence(
    metaculusPrediction: number,  // 0-1 scale
    marketPrice: number,           // 0-1 scale
    forecastTimestamp: string,
    minDivergencePercent: number = 5
  ): {
    hasDivergence: boolean;
    divergencePercent: number;
    staleness: ForecastStaleness;
    actionable: boolean;
  } {
    const divergencePercent = Math.abs(metaculusPrediction - marketPrice) * 100;
    const hasDivergence = divergencePercent >= minDivergencePercent;
    const staleness = this.checkStaleness(forecastTimestamp);

    // Only actionable if divergence exists AND forecast is fresh
    const actionable = hasDivergence && staleness.isFresh;

    return {
      hasDivergence,
      divergencePercent,
      staleness,
      actionable,
    };
  }
}
```

### Pattern 4: Detector Interface Implementation
**What:** Implement detector interface like existing cross-platform arb detector
**When to use:** Integration with OpportunityAggregator (Phase 2)
**Example:**
```typescript
// src/detectors/metaculus-divergence.ts
import { MetaculusClient } from '../services/metaculus-client.js';
import { MetaculusMatcher } from '../services/metaculus-matcher.js';
import { featureFlags } from '../config/feature-flags.js';
import { logger } from '../utils/logger.js';

export interface MetaculusDivergenceOpportunity {
  type: 'metaculus_divergence';
  metaculusId: number;
  metaculusTitle: string;
  marketId: string;
  marketPlatform: 'polymarket' | 'kalshi';
  marketQuestion: string;
  metaculusPrediction: number;
  marketPrice: number;
  divergencePercent: number;
  matchConfidence: number;
  forecastTimestamp: string;
  forecastAge: number;
  isFresh: boolean;
  stalenessWarning?: string;
  detectedAt: number;
}

export class MetaculusDivergenceDetector {
  private client: MetaculusClient;
  private matcher: MetaculusMatcher;
  private minDivergence: number;

  constructor(
    token: string,
    minDivergence: number = 5,
    matcherConfidence: number = 0.8
  ) {
    this.client = new MetaculusClient(token);
    this.matcher = new MetaculusMatcher(undefined, matcherConfidence);
    this.minDivergence = minDivergence;
  }

  /**
   * Detect opportunities from Metaculus divergence
   */
  async detect(markets: import('../types/market.js').Market[]): Promise<MetaculusDivergenceOpportunity[]> {
    // Check feature flag
    if (!featureFlags.metaculusDivergence) {
      logger.debug('Metaculus divergence detector disabled by feature flag');
      return [];
    }

    const opportunities: MetaculusDivergenceOpportunity[] = [];

    try {
      // Fetch open binary questions from Metaculus
      const questions = await this.client.searchQuestions({
        status: 'open',
        forecast_type: 'binary',
        limit: 100,
      });

      // Match questions to markets
      const matches = this.matcher.matchToMarkets(questions, markets);

      // Check each match for divergence
      for (const match of matches) {
        const prediction = match.metaculusQuestion.community_prediction?.q2;
        const predictionTime = match.metaculusQuestion.community_prediction?.timestamp;

        if (!prediction || !predictionTime) {
          continue; // Skip if no forecast available
        }

        // Market price for "Yes" outcome
        const marketPrice = match.market.prices['Yes'] || match.market.prices['yes'];
        if (!marketPrice) {
          continue;
        }

        // Calculate divergence
        const divergencePercent = Math.abs(prediction - marketPrice) * 100;

        if (divergencePercent >= this.minDivergence) {
          // Check staleness
          const forecastDate = new Date(predictionTime);
          const ageInDays = Math.floor(
            (Date.now() - forecastDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          const isFresh = ageInDays <= 7;

          opportunities.push({
            type: 'metaculus_divergence',
            metaculusId: match.metaculusQuestion.id,
            metaculusTitle: match.metaculusQuestion.title,
            marketId: match.market.id,
            marketPlatform: match.market.platform,
            marketQuestion: match.market.question,
            metaculusPrediction: prediction,
            marketPrice,
            divergencePercent,
            matchConfidence: match.confidence,
            forecastTimestamp: predictionTime,
            forecastAge: ageInDays,
            isFresh,
            stalenessWarning: !isFresh
              ? `Forecast is ${ageInDays} days old`
              : undefined,
            detectedAt: Date.now(),
          });
        }
      }

      logger.info({
        questionsChecked: questions.length,
        matchesFound: matches.length,
        divergencesDetected: opportunities.length,
        freshOpportunities: opportunities.filter(o => o.isFresh).length,
      }, 'Metaculus divergence detection complete');

    } catch (error) {
      logger.error({ error }, 'Metaculus divergence detector failed');
      throw error;
    }

    return opportunities;
  }
}
```

### Anti-Patterns to Avoid

- **Trusting community prediction over superforecasters:** Metaculus community prediction includes all users. If API provides pro/superforecaster tier, use that instead - current research shows superforecasters significantly outperform crowd.

- **Ignoring forecast staleness:** Metaculus questions can go weeks without updates. A 10% divergence with a 30-day-old forecast is not actionable - recent events may have changed the landscape.

- **Text-only question matching:** Like Phase 3 settlement comparison, question titles alone are insufficient. Must compare resolution dates, criteria from descriptions, and validate matches manually before trusting.

- **No false positive tracking:** Without a feedback database, you can't measure whether matches were valid. Track alert ratings from users to tune confidence thresholds over time.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff retry logic | Custom sleep() + loop | axios-retry | Handles jitter, max retries, 429 detection, already battle-tested |
| Semantic question matching | Custom word vectors | string-similarity first, OpenAI embeddings if needed | Text similarity catches 80%+ matches, embeddings expensive for 100s of questions |
| Date comparison/staleness | Manual timestamp math | date-fns | Handles timezones, DST, edge cases, already in project |
| Question matching validation | Manual spreadsheet review | Database with ratings + feedback loop | Systematic tracking improves thresholds, catches patterns |

**Key insight:** Question matching is the same problem as market matching (Phase 3) - extend proven patterns rather than building new matching logic. The 78% Kalshi accuracy vs 67% Polymarket accuracy suggests matching quality matters more than matching quantity.

## Common Pitfalls

### Pitfall 1: Superforecaster Data Access Uncertainty
**What goes wrong:** API documentation doesn't clearly specify how to access superforecaster-tier consensus vs community prediction. Using community prediction dilutes signal quality.
**Why it happens:** Metaculus has multiple prediction tiers (community, pro, superforecaster) but public API docs focus on basic usage. Superforecaster access may require special permissions or separate endpoints.
**How to avoid:**
- Start with `community_prediction` field from question object (confirmed available)
- Check if `pro_prediction` field exists in responses (mentioned in forecasting-tools docs)
- Test with actual API calls to verify what data is accessible with standard token
- If superforecaster data unavailable, use community prediction with higher divergence threshold (10% instead of 5%)
**Warning signs:**
- No `pro_prediction` or `superforecaster_prediction` field in API responses
- Documentation mentions "research partner" access for advanced features
- Forecast quality seems lower than expected (check Brier scores if available)

### Pitfall 2: False Positive Question Matches
**What goes wrong:** Text similarity matches questions about different events. Example: "Will Trump win Michigan?" (Metaculus) matches "Will Trump win?" (Polymarket covering national election). Divergence alert is false - they're measuring different outcomes.
**Why it happens:** Short question titles share keywords without capturing full context. Resolution dates can match even when questions are about different aspects of same event.
**How to avoid:**
- Require 0.8+ overall confidence for automated matching (conservative vs 0.7 for cross-platform)
- Weight title similarity at 50% (not 100%) - description and timing provide critical context
- Build manual override database from day 1, track which matches generate valid vs invalid alerts
- Review first 20 divergence alerts manually to measure false positive rate
- If false positive rate >30%, increase confidence threshold or add manual review step
**Warning signs:**
- Users mark divergence alerts as "not relevant" or "different question"
- High divergence but markets resolve to same outcome (suggests match was invalid)
- Question titles share keywords but descriptions reveal different resolution criteria

### Pitfall 3: Stale Forecast Divergence
**What goes wrong:** System flags 8% divergence between 3-week-old Metaculus forecast and current market price. Market already adjusted to recent news that forecast predates. Alert is technically correct but not actionable.
**Why it happens:** Metaculus questions don't update continuously like markets. Active tournaments get frequent updates, but general questions may sit dormant for weeks.
**How to avoid:**
- Track `timestamp` field on community_prediction object
- Calculate days since last update (date-fns differenceInDays)
- Flag forecasts >7 days old with staleness warning in alert
- Consider excluding forecasts >14 days old entirely (or raising divergence threshold)
- Display forecast age prominently in CLI dashboard
**Warning signs:**
- Divergence alerts fail to generate profitable opportunities (market was right, forecast outdated)
- Forecast timestamp significantly predates market price movement
- Metaculus question has low activity (few recent comments or predictions)

### Pitfall 4: Rate Limiting Without Backoff
**What goes wrong:** System hammers Metaculus API checking 100+ questions, gets 429 rate limit error, entire detection cycle fails. No opportunities detected despite valid divergences existing.
**Why it happens:** Public documentation doesn't specify rate limits. Common pattern: 100 requests/minute or 1000/hour for free tier. Checking questions in tight loop exceeds limit.
**How to avoid:**
- Use axios-retry with exponential backoff configured from start
- Implement request batching (check 20 questions, sleep 1 second, repeat)
- Cache question data for 15+ minutes (forecast staleness makes real-time unnecessary)
- Monitor 429 responses in logs and adjust batch size/timing
- Consider fetching only open questions with recent activity (filter by updated_time)
**Warning signs:**
- axios errors with status 429 in logs
- Metaculus detector consistently returns 0 opportunities (may be failing silently)
- API response times increase over time (approaching rate limit threshold)

### Pitfall 5: Betting Against the Market Without Context
**What goes wrong:** Metaculus superforecasters predict 65% but market at 70% (5% divergence). System flags opportunity. User acts on signal but loses - market had access to information forecasters didn't (breaking news, insider knowledge, late-breaking poll).
**Why it happens:** Markets are real-time and information-efficient. Metaculus forecasters are skilled but may lack immediate access to market-moving information. 5% divergence might be the market's "information premium" not forecast error.
**How to avoid:**
- Present divergence as "signal for investigation" not "guaranteed edge"
- Include forecast age prominently (fresh forecasts more reliable)
- Track historical accuracy: do >5% divergences actually predict market movement?
- Consider requiring larger divergences for older forecasts (7% if >3 days old, 10% if >7 days)
- Build feedback loop: did market move toward Metaculus prediction after alert?
**Warning signs:**
- Divergence alerts consistently fail to generate profit (market prices were justified)
- Users report "the market was right" on most divergences
- No evidence of market converging toward Metaculus prediction after time passes

## Code Examples

### Metaculus Question Type
```typescript
// src/types/metaculus.ts
import { z } from 'zod';

// Zod schema for runtime validation
export const MetaculusQuestionSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['binary', 'numeric', 'multiple_choice', 'date']),
  created_time: z.string(),
  resolve_time: z.string(),
  status: z.enum(['open', 'closed', 'resolved']),
  community_prediction: z.object({
    q2: z.number().min(0).max(1), // Median (0-1 for binary)
    timestamp: z.string(),
  }).optional(),
  pro_prediction: z.object({
    q2: z.number().min(0).max(1),
    timestamp: z.string(),
  }).optional(),
});

export type MetaculusQuestion = z.infer<typeof MetaculusQuestionSchema>;

// Match between Metaculus question and market
export interface MetaculusToMarketMatch {
  metaculusId: number;
  metaculusTitle: string;
  platform: 'polymarket' | 'kalshi';
  marketId: string;
  marketQuestion: string;
  matchConfidence: number;
  matchMethod: 'exact' | 'high_similarity' | 'manual';
  matchedAt: number;
  verified?: boolean;
}
```

### Complete Divergence Detector
```typescript
// Full detector implementation with all safety checks
// (See Pattern 4 above for complete code)
```

### Manual Match Database
```json
// src/data/metaculus-matches.json
[
  {
    "metaculus_id": 12345,
    "platform": "polymarket",
    "market_id": "0xabc...",
    "verified": true,
    "notes": "Trump Michigan primary - exact match",
    "added_at": "2026-02-01",
    "verified_by": "manual_review"
  },
  {
    "metaculus_id": 12346,
    "platform": "kalshi",
    "market_id": "TRUMP-WIN",
    "verified": false,
    "notes": "Potential match but different resolution date - needs verification",
    "added_at": "2026-02-02"
  }
]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Humans-only forecasting | AI approaching human superforecaster parity | 2024-2026 | GPT-4.5 Brier 0.101 vs superforecaster 0.081, parity expected Nov 2026 |
| Anyone can forecast | Tiered prediction (community, pro, superforecaster) | 2023+ | Signal quality improves with restricted forecaster pools |
| Manual question matching | Embedding-based clustering + LLM verification | 2025-2026 | DBSCAN + cosine 0.85 + Claude Haiku achieves 4.9% error rate |
| Text similarity only | Multi-level scoring (title + description + timing) | 2024+ | Reduces false positive matches (similar to Phase 3 settlement comparison) |
| Prediction markets unregulated | Kalshi CFTC-regulated, accuracy tracking | 2022+ | Kalshi 78% accuracy vs Polymarket 67% on 2,500 markets |

**Deprecated/outdated:**
- **Crowd-only forecasting:** Superforecaster tier consistently outperforms general community (20% better Brier scores)
- **Question matching without validation:** Recent research shows 3.9% question quality issues even with automated validation - manual review critical
- **Ignoring forecast timestamps:** Staleness makes divergence signals unreliable, must track and warn

## Open Questions

1. **How to access superforecaster-tier predictions via API?**
   - What we know: `community_prediction` field confirmed available in API responses
   - What's unclear: Whether `pro_prediction` or similar field exists for superforecaster-only consensus
   - Recommendation: Test with actual API token, use community prediction initially, investigate pro tier access in Phase 4.2

2. **What confidence threshold balances false positives vs match count?**
   - What we know: Phase 3 uses 0.7 for cross-platform matching, recent study shows prediction markets 67-78% accurate
   - What's unclear: Optimal threshold for Metaculus matching (different domain than settlement comparison)
   - Recommendation: Start at 0.8 overall confidence, measure false positive rate on first 20 alerts, tune based on data

3. **How frequently do Metaculus forecasts update?**
   - What we know: Tournaments update frequently (100s of forecasters), general questions can be dormant
   - What's unclear: Distribution of update frequency across question types
   - Recommendation: Track `timestamp` on every fetch, flag >7 day staleness, consider excluding >14 days old

4. **What divergence threshold is actually predictive?**
   - What we know: Success criteria requires >5% divergence for flagging
   - What's unclear: Historical data on whether 5% divergences predict market movement toward Metaculus consensus
   - Recommendation: Start with 5%, track outcomes (did market converge?), adjust threshold based on signal quality

5. **Should we match to both Polymarket and Kalshi separately?**
   - What we know: Kalshi 78% accurate vs Polymarket 67% in recent study
   - What's unclear: Whether divergence signals are more reliable on one platform
   - Recommendation: Match to both, track performance separately, may prioritize Kalshi if signals stronger

## Sources

### Primary (HIGH confidence)
- [Metaculus API 2.0.0 OAS3](https://www.metaculus.com/api/) - Official OpenAPI specification
- [Metaculus forecasting-tools GitHub](https://github.com/Metaculus/forecasting-tools) - Official Python SDK with reference implementation
- [Metaculus bot template GitHub](https://github.com/Metaculus/metac-bot-template) - Setup guide and authentication patterns
- [arXiv: Automating Forecasting Question Generation](https://arxiv.org/html/2601.22444) - Question matching methodology (DBSCAN cosine 0.85, 4.9% error rate)

### Secondary (MEDIUM confidence)
- [TIME: AI Learning to Predict the Future](https://time.com/7318577/ai-model-forecasting-predict-future-metaculus/) - GPT-4.5 Brier 0.101 vs superforecaster 0.081
- [DL News: Polymarket and Kalshi Reliability Study](https://www.dlnews.com/articles/markets/polymarket-kalshi-prediction-markets-not-so-reliable-says-study/) - Polymarket 67%, Kalshi 78% accuracy on 2,500 markets
- [SSRN: Exploring Decentralized Prediction Markets](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5910522) - Accuracy, skill, and bias analysis
- [Ayrshare: API Rate Limit Handling Guide](https://www.ayrshare.com/complete-guide-to-handling-rate-limits-prevent-429-errors/) - Exponential backoff best practices
- [Shadecoder: Semantic Textual Similarity Guide](https://www.shadecoder.com/topics/semantic-textual-similarity-a-comprehensive-guide-for-2025) - Hybrid approaches and calibration
- [Best Prediction Market APIs for Developers](https://newyorkcityservers.com/blog/best-prediction-market-apis) - Metaculus API access patterns

### Tertiary (LOW confidence)
- Various web search results on Metaculus tournaments and AI forecasting benchmark - useful for context but not used for architectural decisions
- Community discussions on forecast staleness - anecdotal, needs verification with actual API usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - axios/axios-retry/string-similarity already proven in project, Metaculus SDK provides clear patterns
- Architecture: MEDIUM - Extends Phase 3 market matcher patterns (proven), but Metaculus-specific matching untested in production
- Pitfalls: MEDIUM - Superforecaster data access uncertain until tested, false positive rate must be validated with real usage

**Research limitations:**
- Superforecaster-tier API access not confirmed through official documentation (may require testing)
- No historical dataset of Metaculus-to-market divergence outcomes (must build during Phase 4)
- Rate limiting specifics not documented (must discover through usage)
- Optimal confidence thresholds require tuning with real data (conservative 0.8 is starting point)

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - API relatively stable, but AI forecasting landscape evolving rapidly with approaching Nov 2026 parity date)
