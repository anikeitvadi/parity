# Domain Pitfalls: Prediction Market Edge Scanner

**Domain:** Prediction market bot / edge scanner
**Researched:** 2026-01-29
**Confidence:** HIGH (based on verified incidents, official documentation, and academic research from 2025-2026)

## Executive Summary

Prediction market bots face unique failure modes distinct from traditional trading systems. The most critical risks are: (1) cross-platform settlement divergence causing hedged positions to lose on both sides, (2) information speed disadvantages leading to stale-quote losses, (3) liquidity misjudgment causing massive slippage, and (4) rate limit throttling breaking edge detection timing. Small capital ($500) amplifies risk of ruin from any single mistake.

---

## Critical Pitfalls

Mistakes that cause complete bot failure, capital loss, or security breaches.

### Pitfall 1: Cross-Platform Settlement Divergence

**What goes wrong:**
When executing arbitrage between Polymarket and Kalshi, platforms may define "the same event" differently, causing hedged positions to lose money on BOTH sides. Example: A market on "XRP reaches $2 by date X" may settle based on different price sources or use different timestamp cutoffs, resulting in YES on Polymarket and NO on Kalshi both resolving against you.

**Why it happens:**
- Polymarket uses UMA oracle voting system with 2-hour dispute windows
- Kalshi uses centralized official sources with predefined resolution criteria
- Market descriptions may look identical but have subtle differences in rules
- Settlement sources (CoinMarketCap vs Coinbase vs Binance) can diverge at critical moments

**Consequences:**
- Double loss on hedged positions (lose principal on both platforms)
- Destroys edge detection model assumptions
- With $500 capital, a single instance can wipe 40%+ of bankroll

**Prevention:**
1. **Never assume identical wording = identical settlement:** Read full market rules on both platforms before flagging as arbitrage opportunity
2. **Build settlement rule parser:** Extract resolution criteria (data source, timestamp, rounding) and flag mismatches automatically
3. **Cross-platform arb confidence penalty:** Downgrade opportunity rating by 2-3 points if settlement mechanisms differ
4. **Maintain settlement divergence database:** Track historical cases where platforms settled same event differently

**Detection (Warning Signs):**
- Market descriptions use slightly different language
- Time cutoffs differ (EOD vs midnight vs UTC midnight)
- Data sources not explicitly specified in rules
- One platform shows "subject to review" or dispute activity

**Phase Mapping:**
- Phase 1 (MVP): Document in edge detector that cross-platform arb is DISABLED until Phase 3
- Phase 3: Build settlement rule parser before enabling cross-platform arbitrage

### Pitfall 2: Information Speed Disadvantage (News Lag)

**What goes wrong:**
News breaks, markets move 40-50 points instantly, and your bot places orders at stale prices before detecting the news. In January 2026, a bot made $8M exploiting time lag by being closer to Polymarket servers; human traders consistently lose to bots with millisecond advantages.

**Why it happens:**
- Breaking news moves prediction markets discontinuously (0.50 → 0.90 instantly)
- Order book updates lag news by seconds even with fast polling
- Professional bots monitor news feeds directly, not just market prices
- Geographic latency matters (server proximity = speed advantage)

**Consequences:**
- Buying YES at 0.50 when "true price" is already 0.90 = instant 40% loss
- Even detecting edge correctly, execution happens after edge disappears
- With $500 capital, 2-3 stale trades = complete capital loss

**Prevention:**
1. **Never trade on price divergence alone during news-heavy periods:** Flag high-volatility categories (politics, breaking events) and require BOTH price edge + news confirmation
2. **Build news monitoring parallel to price monitoring:** Ingest Reuters/AP feeds, Twitter alerts, official announcements
3. **Implement staleness detection:** If price moved >10 points in last 60 seconds, freeze trading for 5 minutes
4. **Geographic awareness:** With $500 capital, YOU CANNOT COMPETE on speed. Only trade edges that persist >5 minutes (Metaculus divergence, longshot bias) not flash arbitrage

**Detection (Warning Signs):**
- Market price changes >10 points between API calls
- Order fill prices differ significantly from quoted prices
- Multiple markets in same category moving simultaneously
- Volume spike without corresponding price movement initially

**Phase Mapping:**
- Phase 1 (MVP): EXPLICITLY EXCLUDE speed-dependent edges (news lag, cross-platform arb)
- Phase 2: Add staleness detection and trading freezes
- Future (not in initial roadmap): News feed integration only if capital grows >$10K

### Pitfall 3: Liquidity Misjudgment & Slippage

**What goes wrong:**
Order book shows $1,000 of liquidity at favorable price, but your $100 order moves the market 10 points, destroying your edge. Long-tail markets appear to have "good odds" but cannot absorb meaningful volume.

**Why it happens:**
- Order book data shows snapshot, not depth across price levels
- Thin markets have wide bid-ask spreads hidden in percentage terms
- Polymarket CLOB displays top-of-book, not full depth
- Small orders acceptable, but $100+ orders are "large" in niche markets

**Consequences:**
- Edge calculation assumes 0.5% cost, actual cost is 8% after slippage
- Opportunity rated 8/10 executes as 3/10 or negative EV
- Repeated slippage losses erode capital faster than edge detection improves

**Prevention:**
1. **Fetch Level 2 order book data:** Use Polymarket CLOB API to get full depth, not just top bid/ask
2. **Calculate slippage for intended order size:** If planning $50 trade, simulate walking the order book for $50
3. **Liquidity threshold in edge detector:** Downgrade rating if <$500 liquidity within 2 points of target price
4. **Market category liquidity scoring:** Politics/crypto have deep books; niche categories (entertainment, science) are thin

**Detection (Warning Signs):**
- Bid-ask spread >3 points
- Volume <$10K in last 24 hours
- Order book shows only 1-2 price levels with meaningful size
- Market category is niche/entertainment

**Phase Mapping:**
- Phase 1 (MVP): Fetch Level 2 data, calculate slippage, include in opportunity rating
- Phase 2: Build liquidity scoring by category based on historical data

### Pitfall 4: Rate Limit Throttling Breaking Real-Time Edge Detection

**What goes wrong:**
Your bot polls 100 markets every 10 seconds, hitting Polymarket's rate limits. Requests get throttled (delayed/queued), causing 30-60 second lag in detecting opportunities. By the time your bot sees an edge, it's gone.

**Why it happens:**
- Polymarket CLOB API limits: 60 orders/minute, 3,500 orders/10s burst
- Data API limits: 200 requests/10s for trades endpoint
- Kalshi has separate rate limits (not fully documented publicly)
- Each market check = multiple API calls (order book + trades + market info)
- 100 markets × 6 calls/market = 600 calls per cycle → guaranteed throttling

**Consequences:**
- Edge detection lag makes opportunities stale before alerts sent
- Throttling causes inconsistent polling (some markets checked, others skipped)
- Bot appears to "freeze" during high-activity periods
- WhatsApp alerts arrive too late to act on

**Prevention:**
1. **Prioritized polling strategy:** Poll high-volume markets (top 20) every 10s, long-tail markets every 60s
2. **Shared rate limiter across all API clients:** Don't create separate limiters for CLOB, Data, Gamma APIs
3. **Exponential backoff on 429 errors:** When throttled, back off exponentially (10s, 20s, 40s)
4. **Batch API calls:** Use bulk endpoints where available (Polymarket `/markets` returns multiple markets)
5. **WebSocket for price updates:** Use Polymarket WebSocket streams for top markets instead of REST polling

**Detection (Warning Signs):**
- API returns 429 (rate limit) errors
- Response times increase gradually during session
- Some markets show stale data (last update >60s ago)
- Bot log shows "waiting for rate limit reset"

**Phase Mapping:**
- Phase 1 (MVP): Implement shared rate limiter, prioritized polling, exponential backoff BEFORE launching
- Phase 2: Migrate top 20 markets to WebSocket streams

### Pitfall 5: Private Key Security Breach

**What goes wrong:**
Trading bot stores Polymarket wallet private key insecurely (hardcoded, committed to Git, stored in plain text). On January 13, 2026, the Polycule Telegram bot was hacked for $230K due to reversible key storage allowing SQL injection-based key export.

**Why it happens:**
- Convenience over security (hardcoding keys to avoid .env setup)
- Misunderstanding of how Polymarket API auth works (requires private key for signing)
- Bot code shared publicly with keys included
- Storing keys in database in reversible encryption

**Consequences:**
- Total loss of funds in bot wallet
- Private key cannot be rotated (wallet is compromised permanently)
- Reputational damage if bot is used by others

**Prevention:**
1. **Never store private key in code:** Use environment variables exclusively
2. **Never commit .env to version control:** Add .env to .gitignore immediately
3. **Use separate hot wallet for bot:** Keep only trading capital ($500) in bot wallet, not entire bankroll
4. **API key auth preferred over private key where possible:** Polymarket API supports HMAC-SHA256 with API credentials
5. **Regular profit withdrawal:** Transfer profits weekly to hardware wallet

**Detection (Warning Signs):**
- Private key appears in Git history (`git log -S "private"`)
- .env file tracked by Git (`git ls-files | grep .env`)
- Bot wallet balance decreases without your transactions
- Unexpected transactions in wallet history

**Phase Mapping:**
- Phase 0 (Setup): Secure credential management BEFORE writing any code
- Document security checklist in setup guide

### Pitfall 6: Wash Trading Volume Inflation

**What goes wrong:**
Your bot detects "high liquidity" opportunity based on 24h volume, but Columbia University study found 25-60% of Polymarket volume is wash trading (fake volume from coordinated wallets). You execute based on false liquidity signal, then cannot exit position.

**Why it happens:**
- Polymarket volume metrics include wash trades
- Blockchain data shows 43,000+ wallet clusters trading only with each other
- Low-price markets (<1 cent) generate volume without real interest
- Sports markets show 45% wash trading vs 17% in election markets

**Consequences:**
- Liquidity appears 2-4x higher than reality
- Cannot exit position at assumed prices
- Market depth is illusory (volume ≠ liquidity)

**Prevention:**
1. **Use order book depth, not 24h volume, for liquidity assessment:** Order book is harder to fake
2. **Category-specific wash trading adjustment:** Reduce sports market liquidity scores by 45%, crypto by 25%
3. **Wallet concentration analysis:** If top 10 wallets = >50% of volume, flag as high wash trading risk
4. **Price-based filter:** Markets trading <$0.10 per share likely have inflated volume

**Detection (Warning Signs):**
- High volume but narrow bid-ask spread (shouldn't coexist)
- Volume spikes at odd hours with no news
- Same-sized trades repeating at regular intervals
- Market has high volume but low unique wallet count

**Phase Mapping:**
- Phase 1 (MVP): Use order book depth exclusively, ignore 24h volume metric
- Phase 2: Add wash trading heuristics for advanced filtering

---

## Moderate Pitfalls

Mistakes that cause delays, capital erosion, or technical debt.

### Pitfall 7: Fee Threshold Miscalculation

**What goes wrong:**
Edge detector calculates 6% edge, passes >5% threshold, but fails to account for:
- Polygon gas fees ($0.10-$0.50/tx)
- Bid-ask spread (2-3 points in practice)
- Slippage (1-2% on $50 order)
- Total cost = 4-5%, leaving 1% edge instead of 6%

**Why it happens:**
- Fee threshold set based on platform fees alone (Polymarket = 0% for most markets)
- Gas fees seem negligible but add up (4 txs/trade cycle = $2 round trip)
- Spread and slippage not included in "fees" mentally

**Prevention:**
1. **Total cost calculation:** Edge must exceed (platform fees + gas + spread + expected slippage)
2. **Dynamic fee threshold:** Require 8% edge for small positions (<$50), 6% for larger positions
3. **Gas price monitoring:** Fetch current Polygon gas prices, skip trades when gas >30 gwei

**Phase Mapping:**
- Phase 1 (MVP): Build comprehensive cost calculator before edge detection

### Pitfall 8: Metaculus Divergence False Positives

**What goes wrong:**
Metaculus shows 65% probability, Polymarket shows 50%, bot flags as 15-point edge. But Metaculus uses longer time horizon, different resolution criteria, or forecaster pool has different information access.

**Why it happens:**
- Metaculus is NOT a prediction market (no financial stakes)
- Forecasters optimize for Brier score, not profit
- Time horizons often differ (Metaculus = longer term)
- Metaculus forecasters may lack real-time info that market traders have

**Prevention:**
1. **Verify identical resolution criteria:** Metaculus and Polymarket must resolve based on same event definition
2. **Time horizon matching:** Only compare if both resolve at same date/time
3. **Metaculus staleness check:** If Metaculus prediction hasn't updated in 7+ days, likely stale
4. **Directional signal, not absolute:** Use Metaculus as confidence boost, not standalone edge

**Phase Mapping:**
- Phase 1 (MVP): Document Metaculus as "low confidence" edge source
- Phase 2: Build resolution criteria matcher for Metaculus comparisons

### Pitfall 9: Longshot Bias Overconfidence

**What goes wrong:**
Academic research shows longshots (low probability events) are overpriced in prediction markets. Bot correctly identifies 5% probability event priced at 8%, seems like edge. But research shows this bias is inconsistent and doesn't reliably produce profits.

**Why it happens:**
- Longshot bias is real but weak (1-3% mispricings)
- Liquidity in longshot markets is terrible
- Psychology (overconfidence) affects pricing but also affects your model
- Iowa Electronic Market research shows bias varies by time horizon

**Prevention:**
1. **Longshot bias = tiebreaker only:** Use to boost rating from 7 to 8, not as primary edge
2. **Minimum liquidity requirement:** Longshots typically illiquid; require >$200 depth
3. **Time horizon factor:** Bias stronger at intermediate horizons (2-4 weeks), weaker at <1 week or >3 months

**Phase Mapping:**
- Phase 1 (MVP): Include longshot bias as minor rating factor (+0.5 points max)

### Pitfall 10: Overtrading from Alert Fatigue

**What goes wrong:**
Bot sends 20 WhatsApp alerts per day for 8+ rated opportunities. Human receives alerts constantly, starts ignoring them or making hasty decisions without analysis.

**Why it happens:**
- Edge threshold too permissive (5% = common)
- Multiple edge sources create alert spam
- No cooldown between alerts for same market

**Prevention:**
1. **Alert consolidation:** Batch alerts (send digest every 2 hours, not instant)
2. **Tiered alerts:** Only instant alerts for 9+ rating, digest for 8, no alert for 7
3. **Per-market cooldown:** Don't alert on same market more than once per 4 hours

**Phase Mapping:**
- Phase 2: Implement alert tiering and consolidation after initial testing

### Pitfall 11: Market Definition Ambiguity (Insider Trading Risk)

**What goes wrong:**
Market resolves unexpectedly because rule interpretation differs from your assumption. Example: "Will Nicolás Maduro leave office by Jan 31?" - does temporary removal count? January 2026 Venezuela raid market caused controversy over settlement criteria.

**Why it happens:**
- Natural language is ambiguous ("leave office" vs "removed from power")
- Edge cases not specified in rules
- Political markets especially prone to interpretation disputes

**Prevention:**
1. **Avoid ambiguous markets entirely:** Flag markets with unclear resolution criteria as "skip"
2. **Check dispute history:** If market has past disputes, likely to have future ones
3. **Conservative interpretation:** If rule could go either way, assume unfavorable resolution for your position

**Phase Mapping:**
- Phase 1 (MVP): Build ambiguity filter using keyword detection ("temporary", "acting", "interim")

---

## Minor Pitfalls

Mistakes causing annoyance but easily fixable.

### Pitfall 12: API Client Version Mismatch

**What goes wrong:**
Polymarket updates CLOB API schema, bot uses outdated Python client library, requests fail silently or return unexpected data structures.

**Prevention:**
- Pin dependency versions in requirements.txt
- Monitor Polymarket API changelog
- Automated tests to detect schema changes

**Phase Mapping:**
- Phase 1: Pin versions, add API health check on startup

### Pitfall 13: Market Lifecycle Misunderstanding

**What goes wrong:**
Bot attempts to trade on market that's locked for settlement or already resolved. API returns 400 errors.

**Prevention:**
- Check market status before attempting trades
- Filter for "active" markets only in edge detection

**Phase Mapping:**
- Phase 1: Add market status check in data ingestion

### Pitfall 14: Testing with Mainnet Funds

**What goes wrong:**
Bot bug causes real trades during development. With $500 total capital, testing loses $50-100.

**Prevention:**
- Use testnet/demo mode where available
- Implement dry-run mode that logs trades without executing
- Separate testing wallet with $10 maximum

**Phase Mapping:**
- Phase 1: Build dry-run mode BEFORE live trading

---

## Phase-Specific Warnings

Pitfalls mapped to project phases, indicating when risks are highest.

| Phase Topic | Likely Pitfall | Risk Level | Mitigation |
|-------------|---------------|------------|------------|
| **Phase 1: Data Ingestion** | Rate limit throttling (Pitfall 4) | CRITICAL | Implement shared rate limiter and prioritized polling from day 1 |
| **Phase 1: Data Ingestion** | Market lifecycle misunderstanding (Pitfall 13) | Low | Add status filtering in initial implementation |
| **Phase 2: Edge Detection** | Fee threshold miscalculation (Pitfall 7) | HIGH | Build comprehensive cost calculator, test with real slippage data |
| **Phase 2: Edge Detection** | Metaculus divergence false positives (Pitfall 8) | MODERATE | Start with low confidence weight, tune based on backtesting |
| **Phase 2: Edge Detection** | Liquidity misjudgment (Pitfall 3) | HIGH | Fetch Level 2 data, implement slippage calculator |
| **Phase 3: Cross-Platform** | Settlement divergence (Pitfall 1) | CRITICAL | Build settlement rule parser BEFORE enabling cross-platform arb |
| **Phase 3: Cross-Platform** | Kalshi API differences | MODERATE | Research Kalshi-specific rate limits and errors early |
| **All Phases** | Private key security (Pitfall 5) | CRITICAL | Set up secure credential management in Phase 0 (setup) |
| **All Phases** | Information speed disadvantage (Pitfall 2) | CRITICAL | Accept limitation - only pursue edges that persist 5+ minutes |

---

## Risk Amplification Factors for $500 Capital

Small capital size amplifies certain pitfalls:

| Pitfall | Amplification Factor | Why |
|---------|---------------------|-----|
| Settlement divergence | 3x | Single double-loss event = 40% bankroll |
| Information speed disadvantage | 5x | Cannot afford VPS, low-latency infrastructure |
| Slippage | 2x | Forced into small orders with worse execution |
| Fee threshold miscalculation | 4x | Fixed costs (gas fees) are higher % of capital |
| Overtrading | 2x | Each mistake = larger % impact |

**Implications for roadmap:**
- Must be MORE conservative than well-capitalized bots
- Focus on high-confidence, persistent edges (Metaculus divergence, longshot bias)
- Explicitly exclude speed-dependent edges (news lag, flash arbitrage)
- Higher opportunity rating thresholds (8+ instead of 6+)

---

## Sources

**Confidence Assessment:**
- Critical pitfalls 1-6: HIGH confidence (verified with official docs, recent incidents, academic research)
- Moderate pitfalls 7-11: MEDIUM confidence (based on multiple sources and domain expertise)
- Minor pitfalls 12-14: MEDIUM confidence (common patterns in API integration)

**Key Sources:**

### Official Documentation
- [Polymarket API Rate Limits](https://docs.polymarket.com/quickstart/introduction/rate-limits)
- [Polymarket Market Resolution](https://docs.polymarket.com/polymarket-learn/markets/how-are-markets-resolved)
- [Polymarket Trading Fees](https://docs.polymarket.com/polymarket-learn/trading/fees)
- [Kalshi API Documentation](https://docs.kalshi.com/welcome)

### Security Incidents
- [Polycule Bot Hack - $230K Stolen (Jan 2026)](https://www.kucoin.com/news/flash/telegram-trading-bot-polycule-on-polymarket-hacked-230k-stolen)
- [RootData: Polycule Attack Analysis](https://www.rootdata.com/news/503763)
- [ChainCatcher: Security Measures for Prediction Market Bots](https://www.chaincatcher.com/en/article/2237216)

### Trading Failures & Lessons
- [Viral Polymarket Arbitrage Bot Fails to Deliver Profits](https://phemex.com/news/article/viral-polymarket-arbitrage-bot-fails-to-deliver-promised-profits-48547)
- [Polymarket Trader Nets $233K Outsmarting Bots (Jan 2026)](https://www.coindesk.com/markets/2026/01/19/polymarket-trader-nets-usd233-000-in-a-daring-weekend-move-in-xrp-markets-outsmarting-bots)
- [Sports Bot Makes $8M Exploiting Time Lag](https://phemex.com/news/article/sports-bot-earns-8-million-on-polymarket-by-exploiting-time-lag-55871)
- [Arbitrage Bots Dominate Polymarket](https://finance.yahoo.com/news/arbitrage-bots-dominate-polymarket-millions-100000888.html)

### Wash Trading Research
- [Columbia Study: 25% of Polymarket Volume is Wash Trading](https://fortune.com/2025/11/07/polymarket-wash-trading-inflated-prediction-markets-columbia-research/)
- [TheStreet: Columbia University Study Claims Inflated Trades](https://www.thestreet.com/crypto/business/columbia-university-study-claims-25-of-polymarket-trades-are-inflated)
- [Phemex: Columbia Study on Wash Trading](https://phemex.com/news/article/columbia-university-study-reveals-extensive-wash-trading-on-polymarket-33810)

### Technical Implementation
- [Polymarket Bot Setup Guide](https://www.quantvps.com/blog/setup-polymarket-trading-bot)
- [Kalshi-Polymarket Arbitrage Bot Troubleshooting](https://github.com/terauss/Polymarket-Kalshi-Arbitrage-bot/blob/main/doc/06-troubleshooting.md)
- [Building Automated Trading Bot with Kalshi](https://jinlow.medium.com/building-an-automated-event-trading-bot-with-kalshi-prediction-markets-a-practical-engineering-a1af3ee619e6)

### Market Structure & Manipulation
- [NPR: Inside Prediction Market Mania (Jan 2026)](https://www.npr.org/2026/01/17/nx-s1-5672615/kalshi-polymarket-prediction-market-boom-traders-slang-glossary)
- [Fortune: Prediction Markets and Insider Trading Concerns](https://fortune.com/2026/01/26/prediction-markets-betting-odds-political-events-legitimacy-venezuela-raid-insider-trading/)
- [Market Making on Prediction Markets: 2026 Guide](https://newyorkcityservers.com/blog/prediction-market-making-guide)
- [Best Prediction Market Bots & Tools](https://newyorkcityservers.com/blog/best-prediction-market-bots-tools)

### Academic Research
- [Longshots, Overconfidence and Efficiency on Iowa Electronic Market](https://www.sciencedirect.com/science/article/abs/pii/S0169207018300499)
- [NBER: Explaining Favorite-Longshot Bias](https://www.nber.org/system/files/working_papers/w15923/w15923.pdf)
- [Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets](https://arxiv.org/abs/2508.03474)

### Metaculus Research
- [Why I Reject Comparison of Metaculus to Prediction Markets](https://metaculus.medium.com/why-i-reject-the-comparison-of-metaculus-to-prediction-markets-4175553bcbb8)
- [Forecasting AGI: Prediction Markets and Metaculus](https://forecastingaifutures.substack.com/p/forecasting-agi-insights-from-prediction-markets)
- [Predictive Performance on Metaculus vs Manifold Markets](https://forum.effectivealtruism.org/posts/PGqu4MD3AKHun7kaF/predictive-performance-on-metaculus-vs-manifold-markets)

### Arbitrage & Edge Detection
- [Prediction Market Arbitrage Guide: 2026](https://newyorkcityservers.com/blog/prediction-market-arbitrage-guide)
- [Cross Prediction Markets Arbitrage: Strategies & Risks](https://medium.com/coding-nexus/cross-prediction-markets-arbitrage-strategies-risks-and-tools-19a59d75ac10)
- [Polymarket HFT: AI Arbitrage & Mispricing](https://www.quantvps.com/blog/polymarket-hft-traders-use-ai-arbitrage-mispricing)

### Liquidity & Trading
- [Top 20 Trading Bot Strategies for 2026](https://www.quantvps.com/blog/trading-bot-strategies)
- [Polymarket Trading Bot Setup Tutorial](https://tradingvps.io/polymarket-trading-bot-setup-tutorial/)
- [The Prediction Market Playbook (KuCoin)](https://www.kucoin.com/blog/en-the-prediction-market-playbook-uncovering-alpha-top-players-core-risks-and-the-infrastructure-landscape)

### Settlement Disputes
- [Uh Oh Prediction Markets - Statistical Modeling](https://statmodeling.stat.columbia.edu/2026/01/07/uh-oh-prediction-markets/)
- [Prediction Markets Face Legal Issues in 2026](https://www.covers.com/industry/prediction-market-platforms-face-expanded-competition-and-legal-issues-in-2026-jan-6-2026)
- [Legal Landscape of Prediction Markets 2026](https://www.legalsportsreport.com/250145/foreshadowing-the-legal-landscape-of-prediction-markets-in-2026/)

### Platform Comparisons
- [Kalshi vs Polymarket: Which Will Win in 2026?](https://www.gamblingsite.com/blog/kalshi-vs-polymarket/)
- [The $44 Billion Prediction War: Kalshi and Polymarket (2026)](https://www.financialcontent.com/article/predictstreet-2026-1-27-the-44-billion-prediction-war-how-kalshi-and-polymarket-redefined-the-truth-in-2026)
- [What are Prediction Markets? How Kalshi & Polymarket Work](https://www.oddsshark.com/prediction-markets)

---

## Research Methodology Note

This research prioritized verified incidents (Polycule hack, XRP bot exploit, settlement disputes) and official documentation over theoretical risks. All critical pitfalls (1-6) are supported by either:
- Documented incidents from 2025-2026
- Official API documentation
- Academic research with peer review
- Multiple corroborating sources

Moderate and minor pitfalls are based on common integration patterns and may require validation during implementation.
