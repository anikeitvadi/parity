---
phase: 04-metaculus-integration
plan: 02
subsystem: api
tags: [metaculus, axios, axios-retry, rate-limiting, api-client]

# Dependency graph
requires:
  - phase: 04-01
    provides: MetaculusQuestion types and Zod schemas
provides:
  - MetaculusClient class with rate limiting and exponential backoff
  - Question search and retrieval methods
  - 429 rate limit handling with 5 retries
affects: [04-03, 04-04]

# Tech tracking
tech-stack:
  added: [axios-retry@4.5.0]
  patterns: [exponential backoff with jitter, token-based API authentication]

key-files:
  created:
    - src/services/metaculus-client.ts
    - tests/services/metaculus-client.test.ts
  modified: []

key-decisions:
  - "Use axios-retry with exponentialDelay for built-in jitter"
  - "5 retries for rate limit (429) and network errors"
  - "Token-based authentication with env var fallback"
  - "30-second timeout for API requests"
  - "Validate all API responses with Zod schemas"

patterns-established:
  - "Rate-limited API client pattern with retry configuration"
  - "Child logger for component-specific logging"
  - "URL ID extraction for convenience methods"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 04-02: Metaculus API Client Summary

**Metaculus API client with exponential backoff, 5-retry rate limiting, and Zod validation for superforecaster data fetching**

## Performance

- **Duration:** 3 minutes
- **Started:** 2026-02-04T18:32:52Z
- **Completed:** 2026-02-04T18:35:59Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- MetaculusClient supports searchQuestions() with filters (status, type, limit, offset)
- Automatic retry on 429 rate limits with exponential backoff and jitter
- Token authentication via constructor or METACULUS_TOKEN env var
- URL-based question retrieval via getQuestionByUrl()
- 19 unit tests with mocked axios responses (350 total tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install axios-retry dependency** - `d923a36` (chore)
2. **Task 2: Create MetaculusClient with rate limiting** - `bac3992` (feat)
3. **Task 3: Add basic MetaculusClient tests** - `bac3992` (feat)

**Plan metadata:** (pending)

_Note: Tasks 2 and 3 committed together as they represent the implementation and its tests_

## Files Created/Modified
- `src/services/metaculus-client.ts` - MetaculusClient class with axios-retry configuration
- `tests/services/metaculus-client.test.ts` - 19 unit tests covering constructor, search, retrieval, URL parsing
- `package.json` - Added axios-retry@4.5.0 dependency
- `package-lock.json` - Locked axios-retry and axios versions

## Decisions Made

1. **axios-retry with exponentialDelay** - Uses built-in exponential backoff with jitter instead of custom implementation. Simpler, well-tested, follows best practices.

2. **5 retries on 429 and network errors** - Aggressive retry strategy balances API reliability with eventual failure. Matches Kalshi/Polymarket client patterns.

3. **Token authentication from env or constructor** - Flexibility for testing (constructor) and production (env var). Throws early if neither provided.

4. **30-second timeout** - Longer than typical API clients (Kalshi uses default). Metaculus API can be slow, especially for search queries.

5. **Zod validation on all responses** - Catches schema changes early. Matches established pattern from Phase 04-01.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed existing patterns from kalshi.ts and polymarket.ts.

## User Setup Required

**Environment variable needed for API access:**
- `METACULUS_TOKEN` - API token for Metaculus (obtain from https://www.metaculus.com/accounts/profile/)

Client will throw clear error if token not provided.

## Next Phase Readiness

**Ready for 04-03 (Question-to-market matcher):**
- MetaculusClient can fetch open binary questions
- Search parameters support filtering by status and type
- Responses include community_prediction and pro_prediction when available

**Ready for 04-04 (Metaculus divergence detector):**
- Client handles rate limits gracefully
- Prediction data validated and typed
- Logging integrated for debugging

**No blockers or concerns.**

---
*Phase: 04-metaculus-integration*
*Completed: 2026-02-04*
