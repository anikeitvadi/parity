# Phase 1: Data Foundation & Infrastructure - Research

**Researched:** 2026-01-29
**Domain:** Prediction Market Data Collection, Rate Limiting, Market Matching
**Confidence:** MEDIUM-HIGH

## Summary

Phase 1 requires building a reliable data collection system that continuously fetches market data from Polymarket and Kalshi, stores snapshots for historical analysis, and matches equivalent markets across platforms. The technical foundation uses Node.js 20+ with TypeScript, SQLite for storage, official CLOB client for Polymarket, REST API for Kalshi, and Bree for job scheduling.

The research reveals that Polymarket provides an official TypeScript CLOB client (v5.2.1) with clear rate limits: 60 orders/min sustained, 3,500/10s burst for trading endpoints, and 200 requests/10s for data endpoints. Kalshi implements tiered rate limits (Basic: 20 read/10 write per second) with special batch operation rules. Market matching across platforms is non-trivial due to naming variations and requires fuzzy matching plus manual verification. Correlated market detection leverages LLM-based semantic analysis combined with heuristics, as demonstrated by recent academic research documenting $40M+ in arbitrage profits.

The stack is well-established: better-sqlite3 for synchronous high-performance SQLite access with WAL mode, Pino for production logging, Zod for API response validation, and Bree for cron-based job scheduling with worker threads. Security follows standard practices: environment variables via dotenv (development only), secrets manager for production, hot wallet separation for blockchain interactions, and PM2 with systemd for continuous VPS operation.

**Primary recommendation:** Use official Polymarket CLOB client with conservative rate limiting (50% of documented limits), implement exponential backoff for all API calls, validate all external responses with Zod schemas, and store market snapshots in SQLite with WAL mode enabled. For market matching, start with exact text matching plus manual curation, defer advanced fuzzy matching to Phase 2.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 20+ LTS | Runtime environment | LTS provides stability for mission-critical applications |
| TypeScript | 5.5+ | Type safety | Required for Zod type inference and better-sqlite3 integration |
| @polymarket/clob-client | 5.2.1 | Polymarket API integration | Official client with typed interfaces, released Jan 13, 2026 |
| better-sqlite3 | Latest | SQLite database | 5x faster than alternatives, synchronous API eliminates callback complexity |
| bree | Latest | Job scheduler | Worker thread isolation, cron support, zero Redis/MongoDB dependency |
| pino | Latest | Logging | 5x faster than Winston, production-grade JSON logging |
| zod | Latest (v3+) | Schema validation | TypeScript-first validation at trust boundaries, type inference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | Latest | Environment variables (dev) | Local development only, never production |
| exponential-backoff | Latest | Retry logic | All external API calls requiring resilience |
| ethers | v6 | Blockchain wallet integration | Required for Polymarket authentication (hot wallet) |
| @ladjs/graceful | Latest | Graceful shutdown | PM2 integration, clean worker thread termination |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | PostgreSQL | Only needed for terabyte-scale data or >100 concurrent writes |
| Bree | node-cron | Bree provides worker thread isolation and better error handling |
| Pino | Winston | Pino is 5x faster, critical for high-frequency data collection |
| Kalshi REST | Kalshi FIX | FIX requires Premier tier, REST sufficient for 15-30 min polling |

**Installation:**
```bash
npm install @polymarket/clob-client ethers better-sqlite3 bree pino zod dotenv exponential-backoff @ladjs/graceful
npm install -D @types/node @types/better-sqlite3 typescript ts-node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── config/              # Environment variable validation (Zod schemas)
├── services/            # External API clients (Polymarket, Kalshi)
│   ├── polymarket.ts
│   └── kalshi.ts
├── database/            # SQLite schema and queries
│   ├── schema.ts
│   └── queries.ts
├── jobs/                # Bree worker thread jobs
│   ├── fetch-polymarket.ts
│   ├── fetch-kalshi.ts
│   └── match-markets.ts
├── utils/               # Rate limiters, retry logic, logger
│   ├── rate-limiter.ts
│   ├── retry.ts
│   └── logger.ts
└── index.ts             # Main entry point (Bree setup, graceful shutdown)
```

### Pattern 1: Rate-Limited API Client
**What:** Wrapper around API clients that enforces rate limits and exponential backoff
**When to use:** All external API interactions
**Example:**
```typescript
// Source: https://www.npmjs.com/package/exponential-backoff + rate limiter pattern
import { backOff } from 'exponential-backoff';

class RateLimitedClient {
  private lastRequest = 0;
  private requestCount = 0;
  private windowStart = Date.now();

  constructor(
    private maxRequestsPerWindow: number,
    private windowMs: number,
    private minDelayMs: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check rate limit
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitMs = this.windowMs - (now - this.windowStart);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return this.execute(fn);
    }

    // Enforce minimum delay
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minDelayMs) {
      await new Promise(resolve =>
        setTimeout(resolve, this.minDelayMs - timeSinceLastRequest)
      );
    }

    this.requestCount++;
    this.lastRequest = Date.now();

    // Execute with exponential backoff
    return backOff(() => fn(), {
      numOfAttempts: 5,
      startingDelay: 1000,
      timeMultiple: 2,
      maxDelay: 30000,
      jitter: 'full', // Add randomness to prevent thundering herd
      retry: (e: any) => {
        // Retry on rate limit or network errors
        return e.status === 429 || e.code === 'ECONNRESET';
      }
    });
  }
}

// Polymarket CLOB: 60 orders/min sustained, use 50% safety margin
const polymarketRateLimiter = new RateLimitedClient(
  30,      // 30 requests per minute (50% of 60)
  60_000,  // 1 minute window
  1_000    // 1 second minimum delay between requests
);

// Kalshi Basic tier: 20 read/sec
const kalshiRateLimiter = new RateLimitedClient(
  10,      // 10 requests per second (50% of 20)
  1_000,   // 1 second window
  100      // 100ms minimum delay
);
```

### Pattern 2: Bree Job Scheduler with Worker Threads
**What:** Isolated job execution with cron scheduling and graceful shutdown
**When to use:** Periodic data collection, market matching, cleanup tasks
**Example:**
```typescript
// Source: https://github.com/breejs/bree
import Bree from 'bree';
import Graceful from '@ladjs/graceful';
import path from 'path';

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  jobs: [
    {
      name: 'fetch-polymarket',
      interval: '15m', // Every 15 minutes
      timeout: '5m',   // Kill if exceeds 5 minutes
    },
    {
      name: 'fetch-kalshi',
      interval: '15m',
      timeout: '5m',
    },
    {
      name: 'match-markets',
      cron: '*/30 * * * *', // Every 30 minutes
      timeout: '10m',
    }
  ],
  errorHandler: (error, workerMetadata) => {
    logger.error({ error, worker: workerMetadata }, 'Job failed');
  },
  workerMessageHandler: (message, workerMetadata) => {
    logger.info({ message, worker: workerMetadata }, 'Job message');
  }
});

// Graceful shutdown on SIGTERM, SIGINT, pm2 reload
const graceful = new Graceful({ brees: [bree] });
graceful.listen();

await bree.start();
```

### Pattern 3: SQLite with WAL Mode and Transactions
**What:** High-performance SQLite setup for time-series market snapshots
**When to use:** Storing market data, order book snapshots, historical prices
**Example:**
```typescript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
import Database from 'better-sqlite3';

const db = new Database('markets.db');

// Enable WAL mode for concurrent reads during writes
db.pragma('journal_mode = WAL');

// Create schema with INTEGER timestamps for performance
db.exec(`
  CREATE TABLE IF NOT EXISTS market_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    market_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data TEXT NOT NULL,
    UNIQUE(platform, market_id, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time
    ON market_snapshots(platform, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_snapshots_market
    ON market_snapshots(market_id, timestamp DESC);
`);

// Use prepared statements for performance
const insertSnapshot = db.prepare(`
  INSERT OR IGNORE INTO market_snapshots (platform, market_id, timestamp, data)
  VALUES (?, ?, ?, ?)
`);

// Batch inserts in transactions for 10-100x speedup
const insertMany = db.transaction((snapshots: Snapshot[]) => {
  for (const snap of snapshots) {
    insertSnapshot.run(
      snap.platform,
      snap.marketId,
      Math.floor(snap.timestamp / 1000), // Unix timestamp
      JSON.stringify(snap.data)
    );
  }
});

// Usage
insertMany(marketSnapshots);
```

### Pattern 4: Zod API Response Validation
**What:** Runtime validation of external API responses with type inference
**When to use:** All API calls to Polymarket, Kalshi, or any external service
**Example:**
```typescript
// Source: https://zod.dev/
import { z } from 'zod';

// Define schema for Polymarket market response
const PolymarketMarketSchema = z.object({
  condition_id: z.string(),
  question: z.string(),
  end_date_iso: z.string(),
  outcomes: z.array(z.string()),
  tokens: z.array(z.object({
    token_id: z.string(),
    outcome: z.string(),
    price: z.string(),
  })),
  volume: z.string().optional(),
  liquidity: z.string().optional(),
});

type PolymarketMarket = z.infer<typeof PolymarketMarketSchema>;

// Validate at trust boundary (external API → application)
async function fetchPolymarketMarkets(): Promise<PolymarketMarket[]> {
  const response = await fetch('https://gamma-api.polymarket.com/markets');
  const rawData = await response.json();

  // Use safeParse to handle validation errors gracefully
  const result = z.array(PolymarketMarketSchema).safeParse(rawData);

  if (!result.success) {
    logger.error({ error: result.error }, 'Invalid Polymarket API response');
    throw new Error('API validation failed');
  }

  return result.data;
}
```

### Pattern 5: Pino Production Logger
**What:** High-performance structured JSON logging with context
**When to use:** All logging in production, especially high-frequency operations
**Example:**
```typescript
// Source: https://github.com/pinojs/pino
import pino from 'pino';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Never use pino-pretty in production (performance penalty)
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
  // Redact sensitive data
  redact: ['apiKey', 'privateKey', 'password'],
  // Add correlation IDs for distributed tracing
  base: {
    service: 'arbitrage-bot',
    environment: process.env.NODE_ENV
  }
});

// Use child loggers for context
const polymarketLogger = logger.child({ service: 'polymarket' });
const kalshiLogger = logger.child({ service: 'kalshi' });

// Structured logging
polymarketLogger.info({
  marketId: 'abc123',
  fetchTime: 142,
  marketCount: 50
}, 'Fetched Polymarket markets');

// Error logging with full context
try {
  await fetchMarkets();
} catch (error) {
  logger.error({
    error,
    operation: 'fetchMarkets',
    timestamp: Date.now()
  }, 'Market fetch failed');
}
```

### Anti-Patterns to Avoid
- **Synchronous blocking in main thread:** Use Bree worker threads for heavy operations (market matching, data processing)
- **Missing rate limiters:** Always wrap API clients with rate limiters, never call APIs directly
- **Hardcoded credentials:** Never commit API keys, use environment variables and validate with Zod
- **console.log in production:** Use Pino structured logging for performance and searchability
- **Ignoring API validation:** Always validate external API responses with Zod before using data
- **Missing graceful shutdown:** Always handle SIGTERM/SIGINT to prevent data corruption during deployments

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom token bucket | exponential-backoff + rate limiter pattern | Handles jitter, exponential backoff, 429 retries correctly |
| Job scheduling | setInterval loops | Bree | Worker thread isolation, prevents concurrent execution, graceful shutdown |
| Database transactions | Manual BEGIN/COMMIT | better-sqlite3 transactions | Automatic rollback on error, nested transaction support via savepoints |
| API response parsing | Manual JSON parsing | Zod validation | Type-safe, catches schema changes, clear error messages |
| Process management | Forever, nodemon | PM2 with systemd | Zero-downtime reloads, cluster mode, auto-restart on crash |
| Logging | Winston, console.log | Pino | 5x faster, async worker threads, built-in redaction |
| String similarity | Custom edit distance | FuzzyWuzzy/TheFuzz or Levenshtein | Production-tested, handles edge cases (abbreviations, typos) |
| Environment config | Manual process.env access | Dotenv + Zod validation | Early validation, clear error messages, type safety |

**Key insight:** Rate limiting and retry logic are deceptively complex. Production systems need jitter (randomness) to prevent thundering herd, exponential backoff with caps, and proper 429 handling. The exponential-backoff library handles all edge cases that custom implementations miss.

## Common Pitfalls

### Pitfall 1: Rate Limit Violations Leading to Bans
**What goes wrong:** Hitting rate limits causes 429 errors, repeated violations can result in temporary or permanent API bans
**Why it happens:** Polymarket CLOB has 60 orders/min sustained but 3,500/10s burst limit - developers test with bursts and don't account for sustained rate limits in production
**How to avoid:**
- Use 50% safety margin on all rate limits (30 requests/min for Polymarket)
- Implement exponential backoff with jitter on all API calls
- Monitor rate limiter metrics (requests per window, rejected requests)
- Never bypass rate limiters in production code
**Warning signs:** Seeing HTTP 429 errors in logs, intermittent API failures, increasing response times

### Pitfall 2: SQLite Lock Contention Without WAL Mode
**What goes wrong:** "Database is locked" errors during concurrent read/write operations, job failures
**Why it happens:** Default SQLite journal mode blocks all reads during writes, causing timeouts in high-frequency data collection
**How to avoid:**
- Enable WAL mode immediately after opening database: `db.pragma('journal_mode = WAL')`
- Use transactions for batch inserts (10-100x speedup)
- Never disable WAL mode in production
**Warning signs:** "SQLITE_BUSY" errors, slow write operations, worker thread timeouts

### Pitfall 3: Unvalidated API Responses Causing Runtime Crashes
**What goes wrong:** API schema changes cause TypeScript type assertions to fail at runtime, crashing the entire process
**Why it happens:** TypeScript types are compile-time only, APIs can change their response format without warning
**How to avoid:**
- Validate all external API responses with Zod schemas at trust boundaries
- Use safeParse instead of parse to handle validation errors gracefully
- Log validation failures with full context for debugging
- Never trust TypeScript types for external data
**Warning signs:** Sudden crashes after API updates, undefined property errors, unexpected null values

### Pitfall 4: Missing Graceful Shutdown Corrupting Database
**What goes wrong:** PM2 restart or deployment kills process mid-transaction, corrupting SQLite database or losing in-flight data
**Why it happens:** Node.js default behavior is immediate termination on SIGTERM, doesn't wait for operations to complete
**How to avoid:**
- Use @ladjs/graceful with Bree to handle SIGTERM/SIGINT/SIGHUP
- Implement cleanup logic in worker threads (close DB connections, flush logs)
- Never use process.exit(0) in worker threads
- Test deployments with pm2 reload (zero-downtime)
**Warning signs:** Database corruption after deployments, lost market snapshots, partial writes

### Pitfall 5: Hot Wallet Private Key Exposure
**What goes wrong:** Private key committed to Git, exposed in logs, or readable by other processes on VPS
**Why it happens:** Polymarket CLOB client requires ethers.js wallet with private key for authentication, developers store it in .env file and accidentally commit
**How to avoid:**
- Never commit .env files (add to .gitignore)
- Use secrets manager (AWS Secrets Manager, HashiCorp Vault) in production
- Separate hot wallet (small balance for API interactions) from cold wallet (main funds)
- Redact private keys in Pino logger configuration
- Use file permissions (chmod 600) for credential files on VPS
**Warning signs:** .env file in Git history, private keys in log files, unauthorized transactions

### Pitfall 6: Concurrent Job Execution Creating Duplicate Data
**What goes wrong:** Fetch job runs twice simultaneously, creating duplicate market snapshots and wasting API quota
**Why it happens:** Bree prevents this by default, but custom schedulers (node-cron, setInterval) don't have built-in protection
**How to avoid:**
- Use Bree's built-in concurrency prevention (default behavior)
- Query database at start of job to check last execution time
- Use UNIQUE constraints in SQLite schema to prevent duplicate inserts
- Never run multiple Bree instances pointing to same database
**Warning signs:** Duplicate rows in market_snapshots table, API quota exhausted faster than expected

### Pitfall 7: Market Matching False Positives
**What goes wrong:** Algorithm matches "Trump wins election" with "Trump wins Iowa primary", causing incorrect arbitrage signals
**Why it happens:** Simple string similarity (Levenshtein distance) matches on keywords without understanding semantic meaning
**How to avoid:**
- Start with manual curation and exact text matching for Phase 1
- Use LLM-based semantic matching (like DeepSeek-R1) for production (Phase 2)
- Always verify resolution criteria match exactly before executing cross-platform arbitrage
- Require human approval for new market matches
**Warning signs:** Arbitrage opportunities with >10% spread (likely false positive), markets resolving differently across platforms

## Code Examples

Verified patterns from official sources:

### Polymarket CLOB Client Authentication
```typescript
// Source: https://github.com/Polymarket/clob-client
import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';

// Load credentials from environment (validated with Zod)
const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
const creds = await createOrDeriveApiKey(privateKey);

// Initialize client with Polygon chain ID (137)
const signer = new ethers.Wallet(privateKey);
const clobClient = new ClobClient(
  'https://clob.polymarket.com',
  137,                    // Polygon chain ID
  signer,
  await creds,
  1,                      // Signature type (0=browser, 1=email/Magic)
  process.env.FUNDER      // Polymarket profile address
);

// Fetch all markets (uses Data API, not CLOB)
const markets = await clobClient.getMarkets();

// Get order book for specific market
const orderBook = await clobClient.getOrderBook(tokenID);
```

### Kalshi API Client with Rate Limiting
```typescript
// Source: https://docs.kalshi.com/getting_started/rate_limits
import axios from 'axios';

class KalshiClient {
  private baseUrl = 'https://api.elections.kalshi.com/trade-api/v2';
  private rateLimiter: RateLimitedClient;

  constructor(apiKey: string) {
    this.rateLimiter = new RateLimitedClient(
      10,     // 10 read requests per second (50% of Basic tier 20/sec)
      1_000,  // 1 second window
      100     // 100ms minimum delay
    );
  }

  async getMarkets() {
    return this.rateLimiter.execute(async () => {
      const response = await axios.get(`${this.baseUrl}/markets`);
      // Validate with Zod before returning
      return KalshiMarketsSchema.parse(response.data);
    });
  }

  async getOrderBook(marketId: string) {
    return this.rateLimiter.execute(async () => {
      const response = await axios.get(`${this.baseUrl}/markets/${marketId}/orderbook`);
      return KalshiOrderBookSchema.parse(response.data);
    });
  }
}
```

### Market Snapshot Storage with SQLite
```typescript
// Source: https://github.com/WiseLibs/better-sqlite3
import Database from 'better-sqlite3';

const db = new Database('markets.db');
db.pragma('journal_mode = WAL');

// Schema for time-series market snapshots
db.exec(`
  CREATE TABLE IF NOT EXISTS market_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    market_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,        -- Unix timestamp (seconds)
    question TEXT NOT NULL,
    outcomes TEXT NOT NULL,             -- JSON array
    prices TEXT NOT NULL,               -- JSON object {outcome: price}
    volume TEXT,
    liquidity TEXT,
    order_book_depth TEXT,              -- JSON object for bid/ask depth
    metadata TEXT,                      -- JSON for platform-specific fields
    UNIQUE(platform, market_id, timestamp)
  );

  CREATE INDEX idx_snapshots_platform_time
    ON market_snapshots(platform, timestamp DESC);

  CREATE INDEX idx_snapshots_market
    ON market_snapshots(market_id, timestamp DESC);

  CREATE TABLE IF NOT EXISTS market_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    polymarket_market_id TEXT NOT NULL,
    kalshi_market_id TEXT NOT NULL,
    match_type TEXT NOT NULL,          -- 'exact', 'fuzzy', 'manual'
    confidence REAL,                   -- 0.0-1.0 for fuzzy matches
    created_at INTEGER NOT NULL,
    verified_by TEXT,                  -- 'human' or 'algorithm'
    UNIQUE(polymarket_market_id, kalshi_market_id)
  );
`);

// Query: Get latest snapshot for market
const getLatestSnapshot = db.prepare(`
  SELECT * FROM market_snapshots
  WHERE market_id = ?
  ORDER BY timestamp DESC
  LIMIT 1
`);

// Query: Get all snapshots in time range
const getSnapshotsInRange = db.prepare(`
  SELECT * FROM market_snapshots
  WHERE platform = ? AND timestamp BETWEEN ? AND ?
  ORDER BY timestamp DESC
`);

// Query: Get markets with liquidity above threshold
const getLiquidMarkets = db.prepare(`
  SELECT DISTINCT market_id, question, liquidity
  FROM market_snapshots
  WHERE platform = ?
    AND timestamp > ?
    AND CAST(liquidity AS REAL) >= ?
  GROUP BY market_id
`);
```

### Correlated Market Detection (Basic)
```typescript
// Source: https://arxiv.org/html/2508.03474v1 (academic research)
// Phase 1: Start with exact text matching, defer LLM-based detection to Phase 2

interface Market {
  id: string;
  platform: string;
  question: string;
  outcomes: string[];
  endDate: string;
}

// Simple heuristic: same end date + high text similarity
function findPotentialMatches(
  polymarketMarkets: Market[],
  kalshiMarkets: Market[]
): Array<{ polymarket: Market; kalshi: Market; confidence: number }> {
  const matches: Array<any> = [];

  for (const pmMarket of polymarketMarkets) {
    for (const kMarket of kalshiMarkets) {
      // Filter 1: End dates must match (within 1 day)
      const pmDate = new Date(pmMarket.endDate);
      const kDate = new Date(kMarket.endDate);
      if (Math.abs(pmDate.getTime() - kDate.getTime()) > 86400_000) {
        continue;
      }

      // Filter 2: Questions must have high similarity
      const similarity = calculateSimilarity(
        pmMarket.question,
        kMarket.question
      );

      if (similarity > 0.8) {
        matches.push({
          polymarket: pmMarket,
          kalshi: kMarket,
          confidence: similarity
        });
      }
    }
  }

  return matches;
}

// Note: For Phase 1, require human verification of all matches
// Phase 2 will implement LLM-based semantic matching with DeepSeek-R1
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Winston logging | Pino logging | 2020+ | 5x performance improvement, critical for high-frequency operations |
| async SQLite (node-sqlite3) | Synchronous SQLite (better-sqlite3) | 2021+ | Eliminates callback hell, 5x faster, simpler error handling |
| Manual pm2 startup | PM2 + systemd integration | 2022+ | Zero-downtime deployments, automatic restart on system reboot |
| Manual rate limiting | exponential-backoff library | 2023+ | Proper jitter, cap handling, 429 retry logic |
| dotenv for production | Secrets manager (AWS/Vault) | 2024+ | Prevents credential leaks, rotation support, audit logs |
| Manual string matching | LLM-based semantic matching | 2025+ | Academic research shows 374 verified arbitrage pairs from 1,576 candidates |

**Deprecated/outdated:**
- **node-sqlite3 (async):** Replaced by better-sqlite3 (synchronous) - counterintuitive but faster due to reduced context switching
- **dotenv in production:** Security risk after 1M+ exposed secrets found in 2024 research, use secrets manager instead
- **Forever/nodemon for production:** PM2 provides zero-downtime reloads, cluster mode, monitoring
- **Manual API polling without rate limiters:** Modern APIs (Polymarket, Kalshi) enforce strict rate limits, requires sophisticated retry logic

## Open Questions

Things that couldn't be fully resolved:

1. **Polymarket Data API vs CLOB API separation**
   - What we know: CLOB client handles both trading and market data, documentation mentions separate "Data API" and "Gamma API"
   - What's unclear: Exact endpoint structure, whether getMarkets() uses CLOB or Data API under the hood, rate limits per API
   - Recommendation: Start with clob-client methods, monitor rate limit headers in responses, separate if needed

2. **Kalshi higher tier rate limits**
   - What we know: Basic tier is 20 read/10 write per second, Premier is 100/100, Prime is 400/400
   - What's unclear: How to request tier upgrade, what qualifies as "bona fide market activity", upgrade timeline
   - Recommendation: Start with Basic tier (sufficient for 15-30 min polling), request upgrade in Phase 2 if needed

3. **Market matching accuracy threshold**
   - What we know: Academic research found 374 true matches from 1,576 candidates (23.7% precision) using LLM, simple Levenshtein distance has unknown precision
   - What's unclear: What confidence threshold prevents false positives while maintaining coverage
   - Recommendation: Phase 1 uses exact matching + manual verification, Phase 2 implements LLM-based matching with 0.9 confidence threshold

4. **Order book depth calculation**
   - What we know: Both APIs provide order book data, requirement is $500 minimum liquidity threshold
   - What's unclear: How to calculate "depth" - sum of all bids/asks, depth at specific price levels, or volume-weighted
   - Recommendation: Start with sum of top 5 bid/ask levels, validate against platform UI, refine in Phase 2

5. **Hot wallet funding strategy**
   - What we know: Polymarket requires funded wallet for CLOB authentication, best practice is hot/cold separation
   - What's unclear: Minimum balance needed for API operations (if any), whether read-only operations require funding
   - Recommendation: Test with minimal balance ($1), monitor gas costs, implement auto-refill from cold wallet if needed

6. **Multi-outcome arbitrage implementation complexity**
   - What we know: Academic research documents profitable multi-leg positions, requires sophisticated pricing models
   - What's unclear: Whether EDGE-05 requirement is feasible in Phase 1 given complexity
   - Recommendation: Implement detection logic (identify opportunities), defer execution to Phase 3 per user's prior decisions

## Sources

### Primary (HIGH confidence)
- Context7: Not available for domain-specific libraries
- [Polymarket CLOB Documentation](https://docs.polymarket.com/developers/CLOB/introduction) - System architecture, fee structure
- [Polymarket clob-client GitHub](https://github.com/Polymarket/clob-client) - v5.2.1 released Jan 13, 2026, installation, usage examples
- [Kalshi Rate Limits Documentation](https://docs.kalshi.com/getting_started/rate_limits) - Exact tier limits, batch operation rules
- [better-sqlite3 GitHub API Docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) - WAL mode, transactions, prepared statements
- [Bree GitHub](https://github.com/breejs/bree) - Job scheduler setup, worker threads, graceful shutdown
- [Pino GitHub](https://github.com/pinojs/pino) - Production logging configuration
- [Zod Official Docs](https://zod.dev/) - Schema validation, type inference
- [Academic Paper: Arbitrage in Prediction Markets](https://arxiv.org/html/2508.03474v1) - Correlated market detection algorithms, $40M profits documented

### Secondary (MEDIUM confidence)
- [The Polymarket API: Architecture, Endpoints, and Use Cases (Medium, Jan 2026)](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf) - Rate limit specifics: 60 orders/min, 3,500/10s burst
- [Polymarket HFT: Rate Limits (QuantVPS, Jan 2026)](https://www.quantvps.com/blog/how-latency-impacts-polymarket-trading-performance) - Verified rate limits, HTTP 429 handling
- [Node.js Environment Variables (OneUpTime Blog, Jan 2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-production-environment-variables/view) - Dotenv vs secrets manager for production
- [PM2 Guide (Better Stack, 2025)](https://betterstack.com/community/guides/scaling-nodejs/pm2-guide/) - Systemd integration, zero-downtime reloads
- [Pino Logger Guide (SigNoz, 2026)](https://signoz.io/guides/pino-logger/) - Production best practices, 5x performance vs Winston
- [Prediction Market Arbitrage Guide (New York City Servers, Jan 2026)](https://newyorkcityservers.com/blog/prediction-market-arbitrage-guide) - Cross-platform strategies, settlement risk

### Tertiary (LOW confidence - marked for validation)
- [Handling Time Series Data in SQLite (MoldStud)](https://moldstud.com/articles/p-handling-time-series-data-in-sqlite-best-practices) - Schema design patterns
- [Building Robust API Clients with Zod (Leapcell)](https://leapcell.io/blog/building-robust-api-clients-with-typescript-and-zod) - Validation patterns
- [Sentry Alerting Guide (DrDroid)](https://drdroid.io/engineering-tools/guide-for-sentry-alerting) - Error notification setup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified from official sources, versions confirmed from npm/GitHub
- Architecture patterns: HIGH - Patterns extracted from official documentation and recent production guides
- Polymarket API specifics: MEDIUM - Official docs lack detail, supplemented with recent Medium article and community sources
- Kalshi API specifics: HIGH - Official documentation provides exact tier limits
- Rate limiting patterns: HIGH - exponential-backoff library well-documented, community patterns verified
- Market matching: LOW-MEDIUM - Academic research is authoritative but complex, simple approaches need validation
- Security practices: HIGH - Industry standard approaches, verified from multiple authoritative sources
- Pitfalls: MEDIUM-HIGH - Derived from documentation warnings and community experience

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days for stable infrastructure, APIs may update rate limits or endpoints)

**Critical validation needs:**
1. Test Polymarket CLOB client to determine if getMarkets() uses separate Data API rate limits
2. Verify Kalshi Basic tier rate limits with actual API calls (documentation is authoritative but test is prudent)
3. Validate market matching accuracy with manual review of first 50 matches
4. Test hot wallet minimum balance requirement for Polymarket CLOB operations
5. Confirm SQLite performance with 7 days of market snapshots (estimate 10k markets * 48 snapshots/day = 336k rows)
