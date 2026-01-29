# Project Research Summary

**Project:** Prediction Market Edge Scanner
**Domain:** Financial Trading Tools / Prediction Market Bot
**Researched:** 2026-01-29
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a prediction market edge scanner that identifies profitable trading opportunities across Polymarket, Kalshi, and Metaculus by analyzing multiple signal sources. Unlike high-frequency arbitrage bots (which compete in milliseconds), this system targets persistent edges that require analysis over judgment: Metaculus forecast divergences, longshot bias patterns, and cross-platform arbitrage with careful settlement rule verification. The recommended approach is a human-in-the-loop design using TypeScript/Node.js for concurrent data collection, modular edge detection, and WhatsApp alerts for opportunities rated 8+/10.

The critical risk is settlement divergence in cross-platform arbitrage. Platforms can define "identical" events differently, causing hedged positions to lose on both sides. This risk is amplified by the $500 starting capital constraint. Research shows 75%+ of retail traders lose money due to overconfidence and automation without human oversight. The winning strategy focuses on edges that persist 5+ minutes (excluding speed-dependent news lag), comprehensive cost modeling (fees + gas + slippage), and conservative position sizing (5-10% of bankroll per trade).

Key architectural insight: Build as an event-driven pipeline with five layers (data collection → processing → detection → scoring → alerting). Each edge detector is an independent module. This allows incremental feature addition and graceful degradation when individual APIs fail. The 2026 competitive landscape shows basic arbitrage is saturated (HFT bots dominate), but multi-source composite scoring with human judgment remains undersaturated.

## Key Findings

### Recommended Stack

TypeScript/Node.js is the clear choice for this use case due to superior WebSocket concurrency, official Polymarket client support, and non-blocking I/O for parallel API calls. Python would only be preferred if adding ML-based statistical analysis later.

**Core technologies:**
- **Node.js 20+ & TypeScript 5.5+**: Native async/await for concurrent API polling, official Polymarket CLOB client, type safety prevents runtime errors across multiple API schemas
- **@polymarket/clob-client**: Official TypeScript package (updated Jan 13, 2026), handles order book data, WebSocket streams, wallet signing
- **better-sqlite3**: Fastest SQLite library for Node.js, zero-setup embedded database perfect for single-server bot storing market snapshots and alert history
- **Bree scheduler**: Modern job scheduler with worker threads, cron syntax, graceful shutdown, retries — critical for production reliability
- **Pino logger**: 5x faster than Winston, async logging prevents performance bottleneck during high-frequency scanning
- **@anthropic-ai/sdk**: Official Claude integration for edge analysis with streaming, prompt caching for repeated context
- **Twilio WhatsApp API**: Production-ready messaging with official npm package, sandbox for testing
- **Zod**: Runtime validation for API responses to catch schema changes early

**Critical version requirements:**
- Node.js 20+ required for native .env loading and fetch
- TypeScript 5.5+ for Zod integration

**Infrastructure:**
- **Hetzner VPS** ($10-15/month, 2 vCPU / 8GB RAM): Best price/performance, though US East coast location needed for API latency
- **PM2**: Process management with auto-restart, log rotation, monitoring

**Alternative considered but rejected:**
- PostgreSQL over SQLite: Unnecessary complexity for single-server bot
- Express/Fastify framework: No web server needed for background bot
- Socket.IO over raw ws: Adds overhead without benefit for market data streams

### Expected Features

Research shows prediction market scanners have three feature tiers. Missing table stakes = unusable product. Differentiators create competitive advantage. Anti-features lead to user losses.

**Must have (table stakes):**
- Multi-platform scanning (Polymarket + Kalshi) — dominant platforms, 50%+ opportunities on each
- Real-time data refresh (WebSocket or fast polling) — arbitrage windows close in seconds
- Basic arbitrage detection (YES + NO < $1 across platforms) — every tool since 2024 has this
- Fee calculation including spreads — Polymarket 0-3%, Kalshi 0-2%, plus spread costs dwarf stated fees
- Liquidity filtering (min $500 for capital size) — low liquidity = wide spreads that destroy edges
- Resolution rule display — #1 cause of losses per research
- Alert system (WhatsApp/SMS) — monitoring 10,000+ markets manually impossible
- Position size calculator — Kelly criterion or fixed % to avoid overexposure

**Should have (competitive differentiators):**
- **Multi-source edge detection** — arbitrage alone is crowded; combining 5 sources creates sustainable advantage
- **Metaculus divergence tracking** — expertise-driven vs money-driven forecasts show 10-20pp divergences; requires semantic matching but undersaturated competitive space
- **Longshot bias detection** — academic research confirms systematic mispricing; requires outcome database
- **Opportunity quality scoring (1-10)** — converts multi-factor analysis into actionable decision, reduces choice paralysis
- **Human-in-the-loop design** — 75%+ of traders lose money with full automation; presenting context for human review prevents systematic errors
- **Historical backtesting** — proves edge validity, builds trust

**Defer (v2+):**
- News lag exploitation — requires millisecond speed infrastructure; HFT bots dominate this space
- Political overreaction detection — requires extensive historical pattern data
- Bundle arbitrage — complex constraint solving; standard arbitrage sufficient for MVP
- Whale tracking — interesting but secondary to direct edge detection
- Market maker rebates — optimization only meaningful at $10k+ position sizes

**Anti-features (explicitly avoid):**
- Fully automated trading without human review — systematic errors compound, most users lose money
- Single-source edge reliance — arbitrage-only tools closing in seconds, unsustainable
- Ignoring resolution rules — causes double losses on cross-platform hedges
- Market orders in thin markets — slippage destroys edges
- Gamification aesthetics — encourages gambling behavior vs analytical approach

### Architecture Approach

The optimal architecture is an event-driven, modular pipeline with five layers. Data flows bottom-up (collection → processing → detection → scoring → alert) with no trading execution. Each edge detector is an independent module implementing a common interface, allowing parallel execution and incremental feature addition.

**Major components:**
1. **Data Collection Layer** — Polymarket/Kalshi REST + WebSocket, Metaculus REST, news RSS feeds; handles rate limiting with exponential backoff, graceful degradation if one API fails
2. **Data Processing Layer** — Normalize cross-platform data (decimal odds vs percentages), enrich with metadata, match markets by semantic similarity, calculate derived metrics (spreads, divergences)
3. **Edge Detection Layer** — Modular strategy pattern with 5 independent detectors (cross-platform arb, Metaculus divergence, longshot bias, news lag, political overreaction); run in parallel on processed data
4. **Opportunity Scoring Engine** — Composite 1-10 rating weighted by edge size (30%), confidence (25%), liquidity (25%), fee impact (20%); filters by threshold (8+ for alerts)
5. **Alert Layer** — Deduplicate (no re-alert within 4 hours), batch if multiple opportunities, format for WhatsApp with context (why edge exists, what could go wrong, resolution rules)

**Key patterns to follow:**
- Event-driven data pipeline using event bus (decouples components, allows parallel detection)
- Time-series storage for market snapshots (InfluxDB/TimescaleDB for efficient historical queries)
- Graceful degradation on API failures (continue with partial data, don't crash entirely)
- Exponential backoff for rate limiting (respect API limits, auto-recover from 429 errors)
- Modular edge detectors with common interface (easy to test, enable/disable individually)

**Anti-patterns to avoid:**
- Synchronous sequential data collection (wastes 3-6 seconds; use Promise.all())
- REST polling instead of WebSockets for price data (30s lag vs real-time)
- Storing everything in flat CSV files (doesn't scale, inefficient queries)
- Hardcoded thresholds without market context (false positives/negatives)
- Missing deduplication logic (alert fatigue, users ignore all alerts)
- No rate limit handling (API bans, system downtime)
- Monolithic detection logic (can't test/debug individual strategies)

### Critical Pitfalls

The most dangerous pitfalls cause total capital loss or security breaches. All are documented from verified 2025-2026 incidents.

1. **Cross-Platform Settlement Divergence** — "Identical" markets resolve differently due to subtle rule differences (timestamp cutoffs, data sources, dispute mechanisms). Hedged arbitrage positions lose on BOTH sides. With $500 capital, single incident = 40%+ loss. **Mitigation:** Build settlement rule parser to extract and compare resolution criteria; never enable cross-platform arbitrage until Phase 3 with proper verification; downgrade rating by 2-3 points if settlement mechanisms differ.

2. **Information Speed Disadvantage** — News breaks, markets move 40-50 points instantly, bot places orders at stale prices. Bot made $8M in Jan 2026 exploiting time lag; human traders consistently lose. **Mitigation:** Accept that you CANNOT COMPETE on speed with $500 capital. Explicitly exclude speed-dependent edges (news lag, flash arbitrage). Only trade edges persisting 5+ minutes. Implement staleness detection (freeze trading if price moved >10 points in 60 seconds).

3. **Liquidity Misjudgment & Slippage** — Order book shows $1,000 liquidity but $100 order moves market 10 points. Edge calculation assumes 0.5% cost, reality is 8% slippage. **Mitigation:** Fetch Level 2 order book data (full depth, not just top bid/ask). Calculate slippage for intended order size by simulating walk through order book. Require minimum $500 liquidity within 2 points of target price. Flag thin markets (bid-ask spread >3 points, volume <$10K/24h).

4. **Rate Limit Throttling** — Polymarket CLOB: 60 orders/min, 3,500/10s burst; Data API: 200 requests/10s for trades. Polling 100 markets = 600 calls/cycle = guaranteed throttling. Causes 30-60 second detection lag, opportunities disappear. **Mitigation:** Implement shared rate limiter across all API clients from day 1. Prioritized polling (top 20 markets every 10s, long-tail every 60s). Exponential backoff on 429 errors. Migrate to WebSocket streams for top markets in Phase 2.

5. **Private Key Security Breach** — Polycule bot hacked for $230K on Jan 13, 2026 due to reversible key storage. Total loss of bot wallet funds, private key cannot be rotated. **Mitigation:** Never store private key in code. Use environment variables exclusively. Add .env to .gitignore immediately. Use separate hot wallet with only $500 trading capital. API key auth preferred where available. Weekly profit withdrawal to hardware wallet.

6. **Wash Trading Volume Inflation** — Columbia study: 25-60% of Polymarket volume is fake (wallet clusters trading with themselves). Bot detects "high liquidity" but cannot exit position. **Mitigation:** Use order book depth exclusively, ignore 24h volume metric. Apply category-specific wash trading discounts (sports -45%, crypto -25%). Flag if top 10 wallets = >50% of volume. Filter markets trading <$0.10/share.

**Additional moderate risks:**
- Fee threshold miscalculation (gas + spread + slippage often 4-5% vs 0% stated fees)
- Metaculus divergence false positives (different time horizons or resolution criteria)
- Longshot bias overconfidence (edge exists but weak, 1-3% mispricing with terrible liquidity)
- Alert fatigue from excessive notifications (20+ alerts/day = ignored)
- Market definition ambiguity causing unexpected settlement

## Implications for Roadmap

Based on research, the project naturally breaks into 5 phases following the architectural layers. Critical dependencies: data collection must work before processing, processing before detection, detection before scoring. Cross-platform arbitrage is DISABLED until Phase 3 when settlement rule verification is built.

### Phase 1: Data Foundation & Basic Edge Detection
**Rationale:** Must validate API access, rate limits, and data quality before building analysis. Start with simplest edge type (cross-platform arbitrage) to prove end-to-end pipeline works.

**Delivers:**
- Polymarket + Kalshi REST API integration with rate limiting
- SQLite storage for market snapshots
- Data processor for normalization across platforms
- Cross-platform arbitrage detector (DISABLED until settlement parser built)
- Basic opportunity scoring (edge size + liquidity only)
- Logging and health checks

**Addresses features:**
- Multi-platform scanning (table stakes)
- Basic arbitrage detection (table stakes)
- Fee calculation (table stakes)
- Liquidity filtering (table stakes)

**Avoids pitfalls:**
- #4 (Rate limit throttling) — implement shared rate limiter from start
- #5 (Private key security) — secure credential management in Phase 0
- #6 (Wash trading) — use order book depth, not volume

**Components:**
- Storage Layer
- Market Data Collector (Polymarket + Kalshi)
- Data Processor
- Scheduler (30-min intervals initially)
- Monitoring & Logging

**Research flag:** Standard API integration patterns, skip dedicated research

### Phase 2: Scoring Engine & Alert System
**Rationale:** Now that opportunities are detected, implement the scoring and alerting infrastructure to make the system useful. This validates the human-in-the-loop workflow before adding complex edge detectors.

**Delivers:**
- Comprehensive opportunity scoring (1-10 scale with weighted factors)
- Fee/slippage calculator accounting for gas + spread
- Alert Manager with deduplication (4-hour TTL)
- WhatsApp integration via Twilio
- Position size calculator (Kelly criterion)
- Resolution rule display

**Addresses features:**
- Alert system (table stakes)
- Position size calculator (table stakes)
- Resolution rule display (table stakes)
- Opportunity quality scoring (differentiator)
- Human-in-the-loop design (differentiator)

**Avoids pitfalls:**
- #7 (Fee miscalculation) — comprehensive cost modeling
- #10 (Alert fatigue) — deduplication and tiered alerts
- #11 (Market ambiguity) — resolution rule flagging

**Components:**
- Opportunity Scoring Engine
- Alert Manager
- WhatsApp Integration

**Research flag:** Standard notification patterns, skip dedicated research

### Phase 3: Cross-Platform Arbitrage Enablement
**Rationale:** Cross-platform arbitrage was detected in Phase 1 but DISABLED due to settlement divergence risk. Now build settlement rule parser to safely enable this edge type.

**Delivers:**
- Settlement rule parser (extracts data sources, timestamps, dispute mechanisms)
- Cross-platform arbitrage confidence scoring
- Settlement divergence database (historical mismatches)
- Kalshi-specific rate limit handling

**Addresses features:**
- Cross-platform arbitrage (table stakes, but done safely)

**Avoids pitfalls:**
- #1 (Settlement divergence) — THE critical risk for cross-platform arb
- #3 (Liquidity misjudgment) — already handled in Phase 1

**Components:**
- Settlement Rule Parser
- Cross-Platform Arbitrage Detector (enable)
- Settlement Divergence Database

**Research flag:** NEEDS RESEARCH — settlement rule extraction is non-trivial, API documentation may not cover dispute mechanics fully

### Phase 4: Metaculus Integration
**Rationale:** First differentiating edge source. Metaculus divergence is easier to implement than longshot bias (no outcome database needed) and more reliable than news lag (no speed requirements).

**Delivers:**
- Metaculus API integration
- Question matching engine (semantic similarity between platforms)
- Metaculus divergence detector with confidence weighting
- Time horizon and staleness checks

**Addresses features:**
- Metaculus divergence tracking (differentiator)
- Multi-source edge detection (differentiator)

**Avoids pitfalls:**
- #8 (Metaculus false positives) — verify resolution criteria match, check staleness
- #2 (Speed disadvantage) — Metaculus edges persist 5+ minutes, no speed competition

**Components:**
- Reference Data Collector (Metaculus)
- Metaculus Divergence Detector
- Question Matching Engine

**Research flag:** NEEDS RESEARCH — semantic matching algorithms, Metaculus API coverage of superforecaster data unclear

### Phase 5: Longshot Bias Detection
**Rationale:** Second differentiating edge source. Requires outcome database but is well-documented in academic research. Complements Metaculus divergence for broader opportunity coverage.

**Delivers:**
- Historical outcome database
- Probability calibration curves by category
- Longshot bias detector with expected value calculation
- Time horizon adjustment (bias stronger at 2-4 week horizons)

**Addresses features:**
- Longshot bias detection (differentiator)
- Historical edge backtesting (differentiator) — foundational data for this

**Avoids pitfalls:**
- #9 (Longshot overconfidence) — use as tiebreaker only, not primary edge
- #3 (Liquidity) — longshots typically illiquid, require stricter filters

**Components:**
- Historical Outcome Database
- Longshot Bias Detector
- Backtesting Engine (foundation)

**Research flag:** Standard statistical analysis patterns, skip dedicated research

### Phase 6: Optimization & Production Hardening
**Rationale:** System is fully functional with 3 edge sources. Now optimize for speed, reliability, and accuracy.

**Delivers:**
- WebSocket connections replacing REST polling for top markets
- Enhanced monitoring (accuracy tracking, false positive rates)
- Dynamic threshold tuning based on historical performance
- Performance optimization (reduce latency, memory usage)
- Full backtesting engine (prove edge validity)

**Addresses features:**
- Real-time data refresh (table stakes) — WebSocket upgrade
- Historical backtesting (differentiator) — complete implementation
- Resolution timeline tracking (differentiator) — IRR calculation

**Components:**
- WebSocket Integration (Polymarket real-time-data-client)
- Enhanced Monitoring
- Backtesting Engine (complete)
- Performance Optimizer

**Research flag:** Standard WebSocket patterns, skip dedicated research

### Phase Ordering Rationale

**Why this sequence:**
1. **Foundation before features** — Can't detect edges without reliable data collection
2. **Prove pipeline before complexity** — Basic arbitrage validates scoring → alert flow before adding sophisticated detectors
3. **Safety gates on high-risk features** — Cross-platform arb disabled until settlement parser built (Phase 3)
4. **Persistent edges before speed-dependent ones** — Metaculus/longshot bias have 5+ minute windows; excluded news lag entirely due to $500 capital constraint
5. **Differentiators after table stakes** — MVP delivers core value (arbitrage detection + alerts); Phases 4-5 add competitive advantage
6. **Optimization after validation** — Don't optimize infrastructure (WebSockets, complex monitoring) until core functionality proves valuable

**How this avoids pitfalls:**
- Pitfalls #4, #5, #6 addressed in Phase 1 (foundation cannot fail)
- Pitfall #1 blocked until Phase 3 (highest severity risk)
- Pitfall #2 avoided entirely (excluded news lag from roadmap)
- Pitfall #7 handled in Phase 2 (comprehensive cost modeling)
- Pitfalls #8, #9 mitigated in Phases 4-5 when implementing those features

**Small capital implications ($500):**
- Higher risk of ruin from single mistake → more conservative approach
- Cannot afford speed infrastructure → focus on persistent edges
- Fixed costs (gas) higher % of capital → stricter fee thresholds (8% vs 6%)
- Must exclude features requiring scale (maker rebates, HFT strategies)

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (Cross-Platform Arbitrage):** Settlement rule extraction is complex; Polymarket UMA oracle vs Kalshi centralized resolution has subtle differences not fully documented in APIs; need to research dispute mechanisms, historical divergence cases
- **Phase 4 (Metaculus Integration):** Semantic question matching is non-trivial; Metaculus API docs don't explicitly mention superforecaster-specific endpoints (may need direct contact); need research on matching algorithms and accuracy tracking

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Data Foundation):** REST API integration, rate limiting, SQLite storage are well-documented
- **Phase 2 (Scoring & Alerts):** Notification systems, scoring algorithms are standard patterns
- **Phase 5 (Longshot Bias):** Statistical analysis well-covered in academic papers
- **Phase 6 (Optimization):** WebSocket integration, performance tuning are established techniques

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Polymarket package exists and is actively maintained (updated Jan 2026); Node.js/TypeScript proven for real-time bots; all recommended libraries have 1M+ weekly downloads |
| Features | MEDIUM-HIGH | Feature categories verified across multiple arbitrage scanners and prediction market tools from 2025-2026; table stakes confirmed; differentiator value proposition supported by academic research on longshot bias and Metaculus accuracy |
| Architecture | MEDIUM | Event-driven pipeline pattern confirmed in multiple HFT and arbitrage bot architectures; component boundaries logical based on separation of concerns; time-series storage recommended by multiple sources for trading systems |
| Pitfalls | HIGH | Critical pitfalls 1-6 verified with documented incidents (Polycule hack $230K, XRP bot $233K exploit, settlement disputes, Columbia wash trading study); moderate pitfalls based on common integration failure modes; all sources from 2025-2026 |

**Overall confidence:** MEDIUM-HIGH

The stack, pitfalls, and feature landscape have high confidence due to official documentation, verified incidents, and recent research. Architecture confidence is slightly lower (medium) due to inference from related domains (crypto trading bots, HFT systems) rather than prediction market-specific architecture documentation, though patterns align well with domain requirements.

### Gaps to Address

**During planning:**
- **Metaculus superforecaster API access:** Documentation doesn't explicitly confirm this endpoint exists. May need to contact Metaculus or use community median as proxy. Affects Phase 4 scope.
- **Kalshi rate limits:** Not fully documented publicly. Need to test in practice and implement conservative backoff. Affects Phase 1 data collection design.
- **News feed latency comparison:** Unknown which RSS sources (Reuters, AP, Bloomberg) have fastest updates. Affects whether to defer news lag to v2 or exclude entirely (currently excluded due to $500 capital constraint).
- **WebSocket reconnection logic:** Need robust strategy for handling disconnections without missing opportunities. Research best practices for long-running WebSocket connections. Affects Phase 6 optimization.

**During implementation:**
- **Cross-platform market matching accuracy:** Semantic similarity for pairing equivalent markets across Polymarket/Kalshi is non-trivial. May need manual curation of top 100 markets initially. Affects Phase 1 and especially Phase 3.
- **Slippage estimation accuracy:** Order book simulation needs real-world validation. May underestimate slippage in volatile periods. Affects Phase 2 cost modeling.
- **Metaculus forecast staleness:** Need to define threshold for "stale" forecast (7 days? 14 days?). Trade-off between signal quality and opportunity coverage. Affects Phase 4.

**Risk mitigation:**
- For critical gaps (Kalshi rate limits, settlement rule parsing), implement conservative fallbacks and extensive logging during Phase 1-3
- For feature-specific gaps (Metaculus endpoints, news latency), design phases to be independently valuable even if that edge source underperforms

## Sources

### PRIMARY (HIGH confidence)

**Official Documentation:**
- [Polymarket Documentation](https://docs.polymarket.com/) — API structure, rate limits, resolution process
- [Polymarket CLOB Client (npm)](https://www.npmjs.com/package/@polymarket/clob-client) — Official TypeScript package (updated Jan 13, 2026)
- [Kalshi API Documentation](https://docs.kalshi.com/welcome) — REST API, market data structures
- [Anthropic SDK (npm)](https://www.npmjs.com/package/@anthropic-ai/sdk) — Official Claude integration
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp/quickstart) — Messaging integration

**Verified Incidents (2025-2026):**
- [Polycule Bot Hack - $230K Stolen (Jan 2026)](https://www.kucoin.com/news/flash/telegram-trading-bot-polycule-on-polymarket-hacked-230k-stolen)
- [Polymarket Trader Nets $233K Outsmarting Bots (Jan 2026)](https://www.coindesk.com/markets/2026/01/19/polymarket-trader-nets-usd233-000-in-a-daring-weekend-move-in-xrp-markets-outsmarting-bots)
- [Sports Bot Makes $8M Exploiting Time Lag (Jan 2026)](https://phemex.com/news/article/sports-bot-earns-8-million-on-polymarket-by-exploiting-time-lag-55871)
- [Columbia Study: 25% of Polymarket Volume is Wash Trading](https://fortune.com/2025/11/07/polymarket-wash-trading-inflated-prediction-markets-columbia-research/)

**Academic Research:**
- [Longshot Bias: Management Science Study (2023)](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.4684)
- [NBER: Explaining Favorite-Longshot Bias](https://www.nber.org/system/files/working_papers/w15923/w15923.pdf)
- [Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets (arXiv 2025)](https://arxiv.org/abs/2508.03474)

### SECONDARY (MEDIUM confidence)

**Architecture & Patterns:**
- [The Polymarket API: Architecture & Endpoints (Medium, Jan 2026)](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf)
- [News-Driven Polymarket Bots (QuantVPS)](https://www.quantvps.com/blog/news-driven-polymarket-bots)
- [Architectural Design Patterns for HFT Trading Bots (Medium, Nov 2025)](https://medium.com/@halljames9963/architectural-design-patterns-for-high-frequency-algo-trading-bots-c84f5083d704)
- [Scaling Trading Bot with Time-Series Database (QuestDB)](https://questdb.com/blog/scaling-trading-bot-with-time-series-database/)

**Feature Landscape:**
- [Arbitrage Bots Dominate Polymarket (Yahoo Finance)](https://finance.yahoo.com/news/arbitrage-bots-dominate-polymarket-millions-100000888.html)
- [Trading Bot Turns $313 → $438K in 30 Days (Finbold)](https://finbold.com/trading-bot-turns-313-into-438000-on-polymarket-in-a-month/)
- [Common Mistakes Trading on Prediction Markets (Whales.market)](https://whales.market/blog/common-mistakes-on-prediction-market/)
- [7 Mistakes New Prediction Market Traders Make (Stand)](https://news.stand.trade/p/7-mistakes-new-predictive-market)

**Stack Components:**
- [better-sqlite3 (npm)](https://www.npmjs.com/package/better-sqlite3) — 1M+ weekly downloads
- [Bree scheduler (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [Pino vs Winston Performance (Better Stack)](https://betterstack.com/community/comparisons/pino-vs-winston/)
- [ws vs Socket.IO (DEV Community)](https://dev.to/alex_aslam/nodejs-websockets-when-to-use-ws-vs-socketio-and-why-we-switched-di9)

**Metaculus Research:**
- [Metaculus and Markets: What's the Difference?](https://www.metaculus.com/notebooks/38198/metaculus-and-markets-whats-the-difference/)
- [Why I Reject Comparison of Metaculus to Prediction Markets](https://metaculus.medium.com/why-i-reject-the-comparison-of-metaculus-to-prediction-markets-4175553bcbb8)
- [Predictive Performance: Metaculus vs Manifold (EA Forum)](https://forum.effectivealtruism.org/posts/PGqu4MD3AKHun7kaF/predictive-performance-on-metaculus-vs-manifold-markets)

### TERTIARY (LOW confidence, needs validation)

**Infrastructure Costs:**
- [Hetzner vs DigitalOcean Comparison](https://www.digitalocean.com/resources/articles/digitalocean-vs-hetzner)
- [Low-Cost VPS Providers 2026 (Nucamp)](https://www.nucamp.co/blog/top-10-low-cost-vps-providers-in-2026-affordable-alternatives-to-aws-azure-gcp-and-vercel)

**News APIs:**
- [NewsData.io](https://newsdata.io/)
- [Best News APIs 2026 (DEV Community)](https://dev.to/timhkelly/10-best-news-apis-in-2026-58e3)

**Market Context:**
- [Kalshi vs Polymarket: Which Will Win in 2026? (GamblingSite)](https://www.gamblingsite.com/blog/kalshi-vs-polymarket/)
- [Prediction Markets Face Legal Issues 2026 (Covers)](https://www.covers.com/industry/prediction-market-platforms-face-expanded-competition-and-legal-issues-in-2026-jan-6-2026)

---
*Research completed: 2026-01-29*
*Ready for roadmap: yes*
