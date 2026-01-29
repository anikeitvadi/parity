# Architecture Patterns: Prediction Market Edge Scanner

**Domain:** Prediction market trading bot (edge detection, no auto-trading)
**Researched:** 2026-01-29
**Confidence:** MEDIUM (verified with multiple sources, domain-specific patterns confirmed)

## Recommended Architecture

Based on research into prediction market bots, arbitrage systems, and market scanners in 2026, the optimal architecture follows an **event-driven, modular design** with five core layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     Alert Layer (Layer 5)                    │
│              WhatsApp notifications for 8+ rated             │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Opportunity Scoring (Layer 4)               │
│         Rates opportunities 1-10 based on multiple           │
│         factors: edge size, confidence, liquidity, fees      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                   Edge Detection (Layer 3)                   │
│   Cross-platform arb │ Metaculus div │ Longshot bias        │
│   News lag          │ Political overreaction                │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                Data Processing Layer (Layer 2)               │
│    Normalize, enrich, correlate data from multiple sources   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Data Collection Layer (Layer 1)             │
│   Polymarket API │ Kalshi API │ Metaculus │ News sources    │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural principle:** Data flows bottom-up (collection → detection → scoring → alert), with no trading execution. Human remains the decision-maker.

## Component Boundaries

| Component | Responsibility | Communicates With | Data In | Data Out |
|-----------|---------------|-------------------|---------|----------|
| **Market Data Collector** | Fetch market data from Polymarket & Kalshi via REST/WebSocket APIs | Data Processing Layer, Storage | None (triggered by scheduler) | Raw market snapshots (prices, volumes, spreads) |
| **Reference Data Collector** | Fetch comparison data (Metaculus forecasts, news events) | Data Processing Layer, Storage | None (triggered by scheduler) | External predictions, news events with timestamps |
| **Storage Layer** | Persist time-series market data, historical snapshots, detected opportunities | All collectors, all analyzers | Market snapshots, opportunities, metadata | Queryable historical data |
| **Data Processor** | Normalize cross-platform data, calculate derived metrics (spreads, divergences) | All collectors (input), Edge Detectors (output) | Raw market data from multiple sources | Normalized, enriched market state |
| **Cross-Platform Arbitrage Detector** | Identify same-outcome markets with price differences across platforms | Data Processor, Scoring Engine | Normalized market data | Arbitrage opportunities with estimated spread |
| **Metaculus Divergence Detector** | Compare prediction market prices to Metaculus community forecasts | Data Processor, Scoring Engine | Market prices + Metaculus forecasts | Divergence signals with confidence |
| **Longshot Bias Detector** | Identify mispriced long-odds outcomes based on historical patterns | Data Processor, Scoring Engine | Market odds + historical outcomes | Longshot opportunities with expected value |
| **News Lag Detector** | Detect markets that haven't adjusted to recent news events | Reference Data Collector, Data Processor, Scoring Engine | Market prices + news event timestamps | News-driven opportunities |
| **Political Overreaction Detector** | Identify politically-charged markets with emotion-driven pricing | Data Processor, Scoring Engine | Market prices + sentiment signals | Overreaction opportunities |
| **Opportunity Scoring Engine** | Rate each opportunity 1-10 based on edge size, confidence, liquidity, fee impact | All detectors, Alert Manager | Raw opportunity signals | Scored, ranked opportunities |
| **Alert Manager** | Filter opportunities by score threshold (8+), format and send WhatsApp alerts | Scoring Engine, WhatsApp Integration | Scored opportunities | Filtered alerts ready for delivery |
| **WhatsApp Integration** | Send formatted alerts via WhatsApp API (Twilio or Business API) | Alert Manager | Formatted alert messages | Delivery confirmations |
| **Scheduler** | Trigger market scans every 15-30 minutes, manage continuous operation | All collectors | Time/interval configuration | Execution triggers |
| **Monitoring & Logging** | Track system health, API rate limits, detection accuracy, alert delivery | All components | System metrics, logs | Dashboards, error alerts |

### Component Interaction Patterns

**Primary Data Flow (Normal Operation):**
1. Scheduler triggers Market Data Collector + Reference Data Collector every 15-30 min
2. Collectors fetch data via APIs, write to Storage Layer
3. Data Processor reads new data, normalizes and enriches it
4. All Edge Detectors run in parallel on processed data
5. Scoring Engine rates all detected opportunities
6. Alert Manager filters by threshold (8+) and sends to WhatsApp Integration
7. Human receives alert, makes trading decision manually

**Secondary Flows:**
- **Backfill on startup**: Storage Layer loads recent historical data for context
- **Error handling**: Monitoring Layer tracks failures, alerts on repeated issues
- **Rate limit management**: Collectors implement exponential backoff, respect API limits

## Data Flow

### 1. Collection Phase (Every 15-30 minutes)

**Market Data Collection:**
- Polymarket: Use WebSocket (wss://ws-live-data.polymarket.com) for real-time data instead of REST polling to eliminate rate limits
- Kalshi: Use REST API for market data endpoint (`/markets`) or WebSocket for high-frequency updates
- Store: Market ID, outcome probabilities, bid/ask spreads, volume, liquidity depth, timestamp

**Reference Data Collection:**
- Metaculus: REST API to fetch community predictions for correlated questions
- News APIs: Track breaking news events with timestamps (for lag detection)
- Store: Forecast values, confidence intervals, event timestamps

### 2. Processing Phase

**Normalization:**
- Convert Polymarket (decimal odds) and Kalshi (percentage probabilities) to common format
- Handle different market structures (binary vs multi-outcome)
- Calculate derived metrics: implied probabilities, arbitrage-free bounds, fee-adjusted prices

**Enrichment:**
- Match markets across platforms by outcome similarity
- Link markets to relevant Metaculus questions
- Associate markets with recent news events (time-based correlation)

### 3. Detection Phase (Parallel Execution)

Each detector runs independently on processed data:

**Cross-Platform Arbitrage:**
- Input: Normalized prices for matching outcomes on Polymarket & Kalshi
- Logic: Identify price differences > fee threshold (5%)
- Output: Arbitrage opportunities with estimated profit after fees

**Metaculus Divergence:**
- Input: Market prices + Metaculus community forecasts
- Logic: Calculate divergence magnitude, weight by Metaculus track record
- Output: Divergence signals with confidence scores

**Longshot Bias:**
- Input: Market odds for long-shot outcomes (e.g., <10% probability)
- Logic: Compare to historical calibration data (are 5% events actually 10%?)
- Output: Mispriced longshots with expected value estimates

**News Lag:**
- Input: Market prices + breaking news event timestamps
- Logic: Detect markets that haven't moved despite relevant news (15-min lag)
- Output: Opportunities with time-sensitivity flags

**Political Overreaction:**
- Input: Market prices + political event triggers (debates, polls)
- Logic: Identify extreme short-term price movements (>10% in <1 hour)
- Output: Mean-reversion opportunities with volatility indicators

### 4. Scoring Phase

**Opportunity Scoring (1-10 scale):**

Rating formula considers:
- **Edge Size (30% weight)**: Larger price discrepancies score higher
- **Confidence (25% weight)**: Based on data quality, source reliability, historical pattern strength
- **Liquidity (25% weight)**: Available volume for the opportunity (can you actually trade $500?)
- **Fee Impact (20% weight)**: Net profit after platform fees, slippage estimates

Formula: `Score = (EdgeSize * 0.3) + (Confidence * 0.25) + (Liquidity * 0.25) + ((1 - FeeImpact) * 0.2)`

Scale each factor to 0-10 before applying weights.

### 5. Alert Phase

**Filtering:**
- Only opportunities with score ≥8 trigger alerts
- Deduplicate: Don't re-alert on same opportunity within 4 hours
- Batch: If multiple 8+ opportunities exist, send one consolidated alert

**Alert Format:**
```
🎯 High-Value Edge Detected (Score: 9.2/10)

Market: Will Trump win 2024 primary?
Platform: Polymarket vs Kalshi
Edge Type: Cross-platform arbitrage
Expected Profit: 8.5% (after fees)
Liquidity: $2,300 available
Action: Buy YES on Kalshi (62%), Sell YES on Polymarket (71%)

Confidence: HIGH | Time-sensitive: 30 min
```

**Delivery:**
- Use WhatsApp Business API or Twilio for reliable delivery
- Track delivery confirmations
- Fall back to SMS if WhatsApp fails

## Patterns to Follow

### Pattern 1: Event-Driven Data Pipeline
**What:** Decouple components using event/message passing rather than direct function calls.
**When:** Handling asynchronous data from multiple sources (APIs, WebSockets).
**Why:** Improves modularity, allows parallel detection, easier to add new edge detectors.
**Example:**
```typescript
// Event bus pattern
eventBus.on('market-data-updated', (data) => {
  // All detectors subscribe to this event
  crossPlatformDetector.analyze(data);
  metaculusDetector.analyze(data);
  longshotDetector.analyze(data);
});

eventBus.on('opportunity-detected', (opp) => {
  scoringEngine.score(opp);
});

eventBus.on('opportunity-scored', (scored) => {
  if (scored.score >= 8) {
    alertManager.send(scored);
  }
});
```

### Pattern 2: Time-Series Storage for Market Data
**What:** Use specialized time-series database (InfluxDB, QuestDB, TimescaleDB) for market data storage.
**When:** Storing high-frequency price snapshots (every 15-30 min) for analysis and backtesting.
**Why:** Optimized for time-ordered data, efficient compression, fast range queries for historical analysis.
**Example:**
```sql
-- InfluxDB-style schema
measurement: market_snapshot
tags: platform, market_id, outcome
fields: price, volume, spread, timestamp
```

### Pattern 3: Modular Edge Detection with Strategy Pattern
**What:** Each edge detector is an independent module implementing a common interface.
**When:** Building multiple detection strategies that may be enabled/disabled independently.
**Why:** Easy to test individual detectors, simple to add new strategies, clear separation of concerns.
**Example:**
```typescript
interface EdgeDetector {
  name: string;
  analyze(marketData: ProcessedMarket[]): Opportunity[];
}

class CrossPlatformArbDetector implements EdgeDetector {
  name = 'cross-platform-arbitrage';
  analyze(data) { /* implementation */ }
}

// Easy to add new detectors
class NewEdgeDetector implements EdgeDetector {
  name = 'new-edge-type';
  analyze(data) { /* implementation */ }
}
```

### Pattern 4: Graceful Degradation on API Failures
**What:** System continues operating with partial data if one API fails.
**When:** Dealing with external APIs that may have downtime or rate limits.
**Why:** Prevents complete system failure from one failing dependency.
**Example:**
```typescript
async function collectMarketData() {
  const results = await Promise.allSettled([
    fetchPolymarket(),
    fetchKalshi(),
    fetchMetaculus()
  ]);

  // Process successful results, log failures
  const data = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  if (data.length === 0) {
    throw new Error('All data sources failed');
  }

  // Continue with partial data
  return data;
}
```

### Pattern 5: Exponential Backoff for Rate Limiting
**What:** Implement exponential backoff when hitting API rate limits.
**When:** Making frequent API calls to external services (Polymarket, Kalshi).
**Why:** Respects API limits, prevents bans, automatically recovers from temporary rate limit errors.
**Example:**
```typescript
async function fetchWithBackoff(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (error.status === 429) { // Rate limited
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Synchronous Sequential Data Collection
**What:** Fetching data from Polymarket, then Kalshi, then Metaculus sequentially.
**Why bad:** Wastes time waiting for each API call to complete. With 3 APIs taking 1-2s each, you waste 3-6 seconds per scan cycle.
**Instead:** Use Promise.all() or Promise.allSettled() to fetch from all APIs in parallel. Reduces collection time from 6s to 2s.

### Anti-Pattern 2: REST Polling Instead of WebSockets
**What:** Using REST API GET requests every 30 seconds to check for price updates.
**Why bad:** Slower, higher latency (30s avg), wastes API rate limit quota, misses rapid price movements.
**Instead:** Use WebSocket connections (wss://ws-live-data.polymarket.com for Polymarket) for real-time price streams. Only use REST for initial bootstrap and reference data that changes slowly.

### Anti-Pattern 3: Storing Everything in Flat Files (CSV)
**What:** Saving market snapshots to CSV files and reading entire files for analysis.
**Why bad:** Doesn't scale beyond small datasets, inefficient queries ("find all snapshots for market X in last 24h"), hard to handle concurrent writes.
**Instead:** Use time-series database (InfluxDB, TimescaleDB, QuestDB) optimized for time-ordered data with built-in compression and fast range queries.

### Anti-Pattern 4: Hardcoded Opportunity Thresholds
**What:** Using fixed values like "alert if spread >5%" without considering market conditions.
**Why bad:** Generates false positives in volatile markets, misses opportunities in stable markets, doesn't adapt to changing fee structures.
**Instead:** Make thresholds configurable and dynamically adjust based on recent volatility, time-of-day patterns, and historical false-positive rates.

### Anti-Pattern 5: Missing Deduplication Logic
**What:** Alerting on the same opportunity every scan cycle (every 15-30 min).
**Why bad:** Floods user with duplicate alerts, causes alert fatigue, user starts ignoring all alerts.
**Instead:** Track sent alerts with TTL (4-6 hours). Only re-alert if opportunity materially changes (score increases by 2+ points, price spread widens significantly).

### Anti-Pattern 6: No Rate Limit Handling
**What:** Making API calls without tracking rate limits or handling 429 errors.
**Why bad:** Gets your API key banned/throttled, causes system downtime, loses data during rate-limit periods.
**Instead:** Implement rate limit tracking (track requests per window), exponential backoff on 429 errors, and respect API documentation limits.

### Anti-Pattern 7: Monolithic Detection Logic
**What:** One giant function that checks all edge types in a single code path.
**Why bad:** Hard to test individual strategies, can't disable problematic detectors, difficult to debug which logic flagged an opportunity.
**Instead:** Use modular strategy pattern where each edge detector is independent and can be enabled/disabled individually.

## Build Order & Dependencies

### Phase 1: Data Foundation (Foundation - no dependencies)
**Components:**
1. Storage Layer (time-series database setup)
2. Market Data Collector (Polymarket + Kalshi REST APIs)
3. Scheduler (basic cron/interval-based triggering)
4. Monitoring & Logging (basic health checks)

**Why first:** Need reliable data collection before any analysis. This validates API access, rate limits, data quality.

**Deliverable:** System that collects market snapshots every 30 minutes and stores them.

### Phase 2: Data Processing (Depends on Phase 1)
**Components:**
1. Data Processor (normalization, enrichment)
2. Reference Data Collector (Metaculus, news APIs)

**Why second:** Need raw data flowing before you can normalize it. This phase makes data usable for detection.

**Deliverable:** Unified view of markets across platforms with enriched metadata.

### Phase 3: First Edge Detector (Depends on Phase 2)
**Components:**
1. Cross-Platform Arbitrage Detector (simplest, highest confidence edge type)

**Why third:** Start with simplest, most reliable edge type to validate detection → scoring → alert pipeline.

**Deliverable:** Working end-to-end pipeline that detects and logs arbitrage opportunities.

### Phase 4: Scoring & Alerting (Depends on Phase 3)
**Components:**
1. Opportunity Scoring Engine
2. Alert Manager
3. WhatsApp Integration

**Why fourth:** Now that you have opportunities, implement scoring and alerting infrastructure.

**Deliverable:** System that sends WhatsApp alerts for high-scored arbitrage opportunities.

### Phase 5: Additional Edge Detectors (Depends on Phase 2, 4)
**Components:**
1. Metaculus Divergence Detector
2. Longshot Bias Detector
3. News Lag Detector
4. Political Overreaction Detector

**Why fifth:** Add more edge types incrementally. Each detector is independent, so prioritize by expected value.

**Deliverable:** Full suite of edge detectors feeding the scoring engine.

### Phase 6: Optimization & Monitoring (Depends on Phase 5)
**Components:**
1. WebSocket connections (replace REST polling)
2. Enhanced monitoring (accuracy tracking, alert effectiveness)
3. Dynamic threshold tuning
4. Performance optimization

**Why last:** System is fully functional, now optimize for speed, reliability, and accuracy.

**Deliverable:** Production-ready system running continuously with minimal manual intervention.

## Dependency Graph

```
Storage Layer ──────────┐
                        ├──> Data Processor ──┐
Market Data Collector ──┤                     ├──> Edge Detectors ──> Scoring Engine ──> Alert Manager ──> WhatsApp
                        │                     │
Reference Collector ────┘                     │
                                              │
Scheduler ────────────────────────────────────┘

Monitoring & Logging ──────> (observes all components)
```

**Critical path:** Storage → Collector → Processor → Detector → Scoring → Alert

## Scalability Considerations

| Concern | Current (1 user, $500) | Future (10 users, $5K each) | Future (100 users, SaaS) |
|---------|------------------------|----------------------------|--------------------------|
| **Data Collection** | REST API every 30 min | WebSocket real-time | WebSocket + multiple instances |
| **Storage** | SQLite + InfluxDB OSS | InfluxDB OSS | InfluxDB Cloud (hosted) |
| **Detection** | Single process, sequential | Single process, parallel | Distributed workers (queue-based) |
| **Alerting** | WhatsApp to one number | WhatsApp to multiple numbers | Multi-channel (WhatsApp, Telegram, Email) |
| **Monitoring** | Manual log checks | Basic dashboards (Grafana) | Full observability (Datadog, New Relic) |
| **Cost** | ~$0/month (free tiers) | ~$20-50/month | ~$200-500/month |

**Key scaling trigger:** If scanning >100 markets or supporting >10 concurrent users, consider distributed architecture with message queue (Redis, RabbitMQ) between components.

## Technology Stack Implications

Based on this architecture, the stack should include:

**Required:**
- Time-series database (InfluxDB, QuestDB, or TimescaleDB)
- REST API client library with retry logic
- WebSocket client library (for Polymarket real-time data)
- Task scheduler (Node.js: node-cron, Python: APScheduler)
- WhatsApp API integration (Twilio or WhatsApp Business API)

**Recommended:**
- Event bus library (Node.js: EventEmitter, Python: PyPubSub)
- Logging framework with structured logs (Winston, Pino)
- Configuration management (environment variables + validation)

## Sources

**HIGH Confidence (Official Docs & Direct API Access):**
- [Polymarket API Documentation - Overview](https://docs.polymarket.com/developers/gamma-markets-api/overview) - Official Gamma market data API structure
- [The Polymarket API: Architecture, Endpoints, and Use Cases](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf) - Architecture breakdown (Jan 2026)
- [Kalshi API Quick Start: Market Data](https://docs.kalshi.com/getting_started/quick_start_market_data) - Official Kalshi REST API documentation

**MEDIUM Confidence (Multiple Industry Sources, 2025-2026):**
- [News-Driven Polymarket Bots: Trading Breaking Events Automatically](https://www.quantvps.com/blog/news-driven-polymarket-bots) - Five-layer architecture pattern
- [Architectural Design Patterns for High-Frequency Algo Trading Bots](https://medium.com/@halljames9963/architectural-design-patterns-for-high-frequency-algo-trading-bots-c84f5083d704) - Event-driven architecture patterns (Nov 2025)
- [Crypto Arbitrage Bot Development: What to Expect in 2026](https://pixelplex.io/blog/crypto-arbitrage-bot-development/) - Component breakdown and cost estimates
- [How to Build an AI Trading Bot: A Complete Developer's Guide](https://www.alchemy.com/blog/how-to-build-an-ai-trading-bot) - Core architecture layers
- [Scaling a trading bot with a time-series database | QuestDB](https://questdb.com/blog/scaling-trading-bot-with-time-series-database/) - Time-series storage patterns
- [Best Time-Series Databases For Trading Systems In 2025](https://arunangshudas.com/blog/top-3-time-series-databases-for-algorithmic-trading/) - Database comparison

**MEDIUM Confidence (WhatsApp & Alert Systems):**
- [How to Use WhatsApp for Automated Stock Trading Alerts - TimelinesAI](https://timelines.ai/how-to-use-whatsapp-for-automated-stock-trading-alerts/) - Integration methods
- [Our complete cron job guide for 2026 - UptimeRobot](https://uptimerobot.com/knowledge-hub/cron-monitoring/cron-job-guide/) - Scheduling patterns

**LOW Confidence (General Market Scanner Patterns):**
- [Market Scanner and Idea Generation Tools | TrendSpider](https://trendspider.com/product/find-high-quality-trading-ideas/) - Market scanner features
- [Real-Time Data Integration Statistics – 39 Key Facts Every Data Leader Should Know in 2026](https://www.integrate.io/blog/real-time-data-integration-growth-rates/) - Event-driven architecture trends
