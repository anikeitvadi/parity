---
phase: 01-data-foundation-infrastructure
plan: 04
subsystem: data-collection
tags: [kalshi, rest-api, rate-limiting, authentication]
dependency-graph:
  requires: [01-01, 01-03]
  provides: [kalshi-client, market-fetcher, orderbook-fetcher]
  affects: [02-01, 02-02, 03-01]
tech-stack:
  added: []
  patterns: [api-client-pattern, rate-limiter, zod-validation]
key-files:
  created: []
  modified: [src/config/env.ts, src/services/kalshi.ts]
decisions:
  - id: kalshi-required-credentials
    choice: "Kalshi credentials are required (not optional)"
    why: "Kalshi is a core data source for cross-platform arbitrage"
  - id: kalshi-use-demo
    choice: "KALSHI_USE_DEMO flag for demo API"
    why: "Enables testing without production credentials"
  - id: cents-to-probability
    choice: "Convert Kalshi prices from cents (1-99) to 0-1 scale"
    why: "Normalize with Polymarket format for downstream matching"
metrics:
  duration: 10m 26s
  completed: 2026-01-29
---

# Phase 1 Plan 4: Kalshi REST API Integration Summary

**One-liner:** Kalshi REST client with API key auth, rate limiting (10/sec), and market/orderbook fetchers normalized to common format.

## What Was Built

### Task 1: Environment Configuration Update
- Added `KALSHI_API_KEY` and `KALSHI_API_SECRET` as required fields (min 10 chars)
- Added `KALSHI_USE_DEMO` optional flag for demo API mode
- Updated `.env.example` with Kalshi credential placeholders and comments

### Task 2: Kalshi REST Client with Authentication
- **KalshiClient class** in `src/services/kalshi.ts`
- Base URL switches between prod/demo based on `KALSHI_USE_DEMO`
- Authentication via headers: `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-SECRET`, `KALSHI-ACCESS-TIMESTAMP`
- Rate limiter: 10 requests/second with 100ms minimum delay (50% of Basic tier)
- Error handling: 401 (auth failed), 429 (rate limit), network errors with retry

### Task 3: Market and Order Book Fetchers
- **getActiveMarkets()**: Fetches open markets, validates with Zod, normalizes to common Market type
- **getOrderBook(ticker)**: Fetches bid/ask levels, calculates depth (sum of first 5 levels)
- Zod schemas for response validation: `KalshiMarketSchema`, `KalshiOrderBookSchema`
- Price normalization: Kalshi cents (1-99) converted to 0-1 scale

## Key Code References

```typescript
// src/services/kalshi.ts - Client initialization
constructor() {
  this.baseUrl = env.KALSHI_USE_DEMO ? KALSHI_DEMO_API : KALSHI_PROD_API;
  this.apiKey = env.KALSHI_API_KEY;
  this.apiSecret = env.KALSHI_API_SECRET;
  this.rateLimiter = createKalshiLimiter();
}

// Rate limiter configuration
export function createKalshiLimiter(): RateLimiter {
  return new RateLimiter(10, 1_000, 100, 'kalshi'); // 10/sec, 100ms min delay
}

// Price normalization
const yesPrice = market.yes_ask !== null ? market.yes_ask / 100 : 0.5;
```

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Credential requirement | Required (not optional) | Kalshi is core data source for cross-platform matching |
| Demo API support | KALSHI_USE_DEMO flag | Enables testing without production credentials |
| Price normalization | Cents to 0-1 scale | Match Polymarket format for downstream comparison |
| Order book depth | Sum of first 5 levels | Consistent with Polymarket approach, focuses on liquid depth |
| Rate limiting | 10/sec, 100ms delay | 50% safety margin of Basic tier (20/sec) |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| KalshiClient authenticates with API key/secret | PASS | Headers set in request() method (lines 109-112) |
| getActiveMarkets() returns array of markets | PASS | Returns Promise<Market[]> with Zod validation |
| getOrderBook() returns bid/ask data | PASS | Returns OrderBook with bids, asks, depth |
| Rate limiting enforces 100ms delay | PASS | createKalshiLimiter() config (100ms minDelayMs) |
| Market data normalized to common format | PASS | normalizeMarket() converts to Market type |

## Files Modified

| File | Changes |
|------|---------|
| src/config/env.ts | Added KALSHI_API_KEY, KALSHI_API_SECRET (required), KALSHI_USE_DEMO (optional) |
| src/services/kalshi.ts | Updated constructor to use KALSHI_USE_DEMO for API URL selection |
| .env.example | Added Kalshi credential placeholders with documentation |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 4702c2b | feat | integrate Kalshi REST API with authentication (all 3 tasks) |

## Next Phase Readiness

**Provides for downstream:**
- `KalshiClient` class for fetching Kalshi market data
- `getActiveMarkets()` for market discovery
- `getOrderBook()` for liquidity analysis
- Normalized `Market` type compatible with Polymarket format

**Dependencies satisfied:**
- Plan 02-01 (Market Matching) can now compare Kalshi and Polymarket markets
- Plan 03-01 (Settlement Parser) will need Kalshi market data

**Open items:**
- Kalshi API credentials need to be configured in .env file
- Demo API (demo-api.kalshi.com) can be used for testing
