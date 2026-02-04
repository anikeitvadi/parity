# Roadmap: Prediction Market Edge Scanner

**Created:** 2026-01-29
**Depth:** Standard
**Total Phases:** 6

## Overview

This roadmap delivers a prediction market edge scanner that identifies profitable opportunities across Polymarket, Kalshi, and Metaculus. The system follows a layered architecture (Data -> Processing -> Detection -> Scoring -> Display) with critical safety measures: rate limiting from day 1, cross-platform arbitrage disabled until settlement verification, and human-in-the-loop via CLI dashboard. Each phase delivers a complete, verifiable capability.

## Phases

### Phase 1: Data Foundation & Infrastructure
**Goal:** Reliable data collection from Polymarket and Kalshi with security, rate limiting, and storage infrastructure

**Dependencies:** None (foundation)

**Plans:** 10 plans

**Requirements:**
- INFR-01: VPS deployment with continuous operation
- INFR-02: Secure credential storage (environment variables)
- INFR-03: Hot wallet separation for on-chain interactions
- INFR-04: Logging and error alerting
- INFR-05: Graceful API failure and rate limit handling
- DATA-01: Polymarket API integration (all markets and odds)
- DATA-02: Kalshi API integration (all markets and odds)
- DATA-04: Market matching across platforms
- DATA-05: Order book depth fetching for liquidity assessment
- DATA-07: Market snapshot storage for historical analysis
- DATA-08: Rate limiting with exponential backoff
- EDGE-02: Cross-platform arbitrage detector (built in Phase 1, DISABLED until Phase 3)
- EDGE-04: Correlated market consistency detector
- EDGE-05: Multi-outcome arbitrage detector

**Success Criteria:**
1. System continuously scans Polymarket and Kalshi every 15-30 minutes without API throttling
2. User can query stored market snapshots for any active market from the past 7 days
3. Order book depth is available for liquidity filtering (minimum $500 threshold enforced)
4. Cross-platform market matching identifies 50+ equivalent events across platforms
5. System recovers gracefully from API failures without manual intervention

Plans:
- [x] 01-01-PLAN.md - Project foundation (TypeScript, logger, rate limiter)
- [x] 01-02-PLAN.md - Database layer (SQLite with WAL mode) [TDD]
- [x] 01-03-PLAN.md - Polymarket integration (CLOB client, market + order book fetching)
- [x] 01-04-PLAN.md - Kalshi integration (REST client, market + order book fetching)
- [x] 01-05-PLAN.md - Market matching (cross-platform matcher) [TDD]
- [x] 01-06-PLAN.md - Job scheduler (Bree with periodic data collection)
- [x] 01-07-PLAN.md - Correlated markets detector (consistency checker) [TDD]
- [x] 01-08-PLAN.md - Multi-outcome arbitrage detector [TDD]
- [x] 01-09-PLAN.md - Production deployment (VPS + PM2 + hot wallet)
- [x] 01-10-PLAN.md - Cross-platform arbitrage detector (DISABLED until Phase 3) [TDD]

---

### Phase 2: Scoring Engine & CLI Dashboard
**Goal:** Rate opportunities 1-10 and display via CLI dashboard with position sizing guidance

**Dependencies:** Phase 1 (requires market data and edge detection)

**Plans:** 5 plans

**Requirements:**
- RATE-01: Composite 1-10 opportunity scoring
- RATE-02: Edge size factor (price divergence magnitude)
- RATE-03: Confidence factor (signal strength)
- RATE-04: Liquidity factor (fill probability at target price)
- RATE-05: Time to resolution factor (urgency)
- RATE-06: Fee-adjusted profit potential (>5% threshold)
- RATE-07: Tiered display (7+ highlighted, 5-6 normal, <5 dimmed)
- CLI-01: Interactive terminal dashboard with table display
- CLI-02: Filter by minimum score, edge type, platform
- CLI-03: Detail view for individual opportunities (market link, reasoning, risks)
- CLI-04: Watch mode with auto-refresh (configurable interval)
- CLI-05: Deduplication (same opportunity not re-highlighted within 4-6 hours)
- SIZE-01: Kelly criterion position size calculation
- SIZE-02: Inputs: edge estimate, bankroll, confidence level
- SIZE-03: Fractional Kelly output (half-Kelly for safety)
- SIZE-04: Configurable cap (10% bankroll max per trade)
- TRCK-01: Log all opportunities with timestamp, edge type, rating, market details

**Success Criteria:**
1. `npm run dashboard` displays live opportunities table sorted by score
2. Each row shows: score, market name, edge %, edge type, suggested position size
3. User can press Enter on a row to see detailed breakdown (link, reasoning, risks)
4. Watch mode refreshes every 5 minutes by default, configurable via flag
5. High-score opportunities (7+) visually highlighted in terminal

Plans:
- [x] 02-01-PLAN.md - Scoring engine (factors, composite scorer) [TDD]
- [x] 02-02-PLAN.md - Kelly criterion position sizing [TDD]
- [x] 02-03-PLAN.md - Opportunity aggregator (combine detectors, dedup)
- [x] 02-04-PLAN.md - CLI dashboard (Ink, interactive table, detail view)
- [x] 02-05-PLAN.md - Detection job and opportunity persistence

---

### Phase 3: Cross-Platform Arbitrage Enablement
**Goal:** Safely enable cross-platform arbitrage with settlement rule verification to prevent divergence losses

**Dependencies:** Phase 1 (market matching), Phase 2 (scoring and alerts)

**Plans:** 5 plans

**Requirements:**
- EDGE-07: Settlement rule parser (extract resolution criteria, data sources, timestamps)
- EDGE-02: Cross-platform arbitrage detector (enabled after settlement verification)

**Success Criteria:**
1. Settlement parser extracts resolution criteria for 90%+ of matched markets
2. Cross-platform arbitrage opportunities flagged only when settlement rules match
3. Alert downgrades rating by 2-3 points if settlement mechanisms differ (UMA oracle vs centralized)
4. User can view side-by-side settlement rule comparison for any arbitrage opportunity
5. Settlement divergence database tracks historical mismatches to improve matching accuracy

Plans:
- [x] 03-01-PLAN.md - Settlement types, database schema, and dependencies
- [x] 03-02-PLAN.md - Polymarket and Kalshi settlement parsers
- [x] 03-03-PLAN.md - Settlement comparator service [TDD]
- [x] 03-04-PLAN.md - Cross-platform detector integration and feature flag enablement
- [x] 03-05-PLAN.md - Dashboard settlement view and verification checkpoint

---

### Phase 4: Metaculus Integration
**Goal:** Detect divergence between superforecaster consensus and market odds for high-confidence opportunities

**Dependencies:** Phase 2 (scoring and alerts), Phase 3 (settlement verification for matching)

**Plans:** 5 plans

**Requirements:**
- DATA-03: Metaculus API integration (superforecaster consensus)
- EDGE-01: Metaculus divergence detector (>5% gap triggers flag)

**Success Criteria:**
1. System matches 30+ Metaculus questions to equivalent Polymarket/Kalshi markets
2. Metaculus divergence detector identifies opportunities where superforecaster consensus differs >5% from market odds
3. Alert includes Metaculus forecast timestamp and staleness indicator (warn if >7 days old)
4. User receives at least 1 high-quality Metaculus divergence alert per week (8+ rating)
5. False positive rate <30% (verified through manual review of first 20 alerts)

Plans:
- [ ] 04-01-PLAN.md - Metaculus types, feature flag, and manual matches file
- [ ] 04-02-PLAN.md - MetaculusClient with rate limiting (axios-retry)
- [ ] 04-03-PLAN.md - MetaculusMatcher question-to-market matching [TDD]
- [ ] 04-04-PLAN.md - MetaculusDivergenceDetector [TDD]
- [ ] 04-05-PLAN.md - Aggregator integration and dashboard MetaculusView

---

### Phase 5: Longshot Bias Detection
**Goal:** Identify systematically mispriced longshots and favorites using historical calibration data

**Dependencies:** Phase 2 (scoring and alerts), Phase 4 (Metaculus data for calibration)

**Requirements:**
- EDGE-03: Longshot bias detector (overpriced <15% prob, underpriced >85% prob)
- TRCK-03: Market resolution outcome recording
- TRCK-04: Win/loss rate calculation by edge type
- TRCK-05: Overall ROI tracking
- TRCK-07: Historical calibration database

**Success Criteria:**
1. System maintains historical outcome database covering 100+ resolved markets
2. Probability calibration curves generated by category (politics, crypto, sports)
3. Longshot bias detector flags opportunities with expected value calculation
4. User sees edge type performance breakdown (arb: X% win rate, Metaculus: Y%, longshot: Z%)
5. System uses longshot bias as tiebreaker or confidence booster, not primary signal

---

### Phase 6: Whale Tracking & Production Hardening
**Goal:** Add on-chain whale tracking and optimize system for speed, reliability, and accuracy

**Dependencies:** Phase 5 (full edge detection suite operational)

**Requirements:**
- DATA-06: Whale wallet activity tracking (on-chain data)
- EDGE-06: Whale tracking detector (flag when profitable wallets take positions)
- CLI-06: Performance summary command (ROI, edge type breakdown, win rates)

**Success Criteria:**
1. System tracks 20+ historically profitable wallet addresses on Polymarket
2. Whale position alerts trigger when tracked wallet places >$5K on a market
3. `npm run stats` shows performance summary with ROI, edge type breakdown
4. System demonstrates <30 second detection latency for top 50 markets

---

## Progress

| Phase | Status | Requirements | Completion |
|-------|--------|--------------|------------|
| 1 - Data Foundation & Infrastructure | Complete | 14 | 100% |
| 2 - Scoring Engine & CLI Dashboard | Complete | 14 | 100% |
| 3 - Cross-Platform Arbitrage Enablement | Complete | 2 | 100% |
| 4 - Metaculus Integration | Planned | 2 | 0% |
| 5 - Longshot Bias Detection | Pending | 5 | 0% |
| 6 - Whale Tracking & Production Hardening | Pending | 3 | 0% |

**Overall:** 30/40 requirements complete (75%)

---

## Critical Dependencies

**Cross-Platform Arbitrage Safety:**
- EDGE-02 detector built in Phase 1 but **DISABLED** until Phase 3
- Rationale: Settlement divergence causes double losses (most dangerous pitfall)
- Enabling condition: EDGE-07 settlement parser operational

**On-Chain Data Infrastructure:**
- EDGE-06 whale tracking deferred to Phase 6
- Rationale: Requires infrastructure for blockchain data fetching
- Earlier phases deliver value without on-chain dependency

**Build Order (Non-Negotiable):**
1. Data collection -> Processing -> Detection -> Scoring -> Alerting
2. Rate limiting (DATA-08) in Phase 1 prevents API bans
3. Security (INFR-02, INFR-03) in Phase 1 prevents key compromise
4. Settlement verification (Phase 3) before cross-platform arb enabled

---

*Last updated: 2026-02-04*
