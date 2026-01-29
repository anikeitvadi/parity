# Feature Landscape: Prediction Market Edge Scanner

**Domain:** Prediction Market Trading Tools / Edge Detection Scanners
**Researched:** 2026-01-29
**Confidence:** MEDIUM (based on multiple WebSearch sources from 2025-2026, verified across platforms)

## Executive Summary

The prediction market bot/scanner ecosystem in 2026 has matured significantly, with academic research documenting over $40M in arbitrage profits between April 2024-2025. Features fall into three clear tiers: (1) **Table stakes** - real-time scanning, multi-platform support, basic risk management; (2) **Differentiators** - sophisticated edge detection (news lag, longshot bias, Metaculus divergence), smart money tracking, human-in-the-loop with quality scoring; (3) **Anti-features** - auto-execution without human review, ignoring liquidity/fees, treating markets as gambling.

The target use case (human-in-the-loop scanner with multi-source edge detection) sits in the differentiator category, avoiding the automated execution pitfall that leads 75%+ of traders to losses.

## Table Stakes

Features users expect from any prediction market scanner. Missing these = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-platform scanning** | Polymarket + Kalshi are the two dominant platforms; scanning only one misses 50%+ of opportunities | Medium | Requires API integration with both platforms; Polymarket has CLOB API, Kalshi has REST API; market matching across platforms is non-trivial |
| **Real-time data refresh** | Arbitrage windows close in seconds to minutes; stale data = missed opportunities | Medium | WebSocket connections required; need to handle rate limits and connection failures; typical refresh: 1-5 seconds |
| **Basic arbitrage detection** | Cross-platform price discrepancies (YES on Platform A + NO on Platform B < $1.00) are the most obvious edge | Low | Simple mathematical comparison; every tool since 2024 has this |
| **Market category filtering** | Users want to focus on domains they understand (politics, crypto, sports); 100+ categories exist | Low | Tag/category filtering; most platforms expose this via API metadata |
| **Fee calculation** | Fees range from 0% to 3%+ and completely change profitability; hidden costs in spreads | Medium | Must account for: trading fees (Polymarket 0-3%, Kalshi up to 2%), spread costs (wider in thin markets), withdrawal fees; formula varies by platform |
| **Minimum liquidity filter** | Low-liquidity markets have 5-10 cent spreads that dwarf stated edges | Medium | Need order book depth data; must calculate available liquidity at current price vs desired position size |
| **Alert/notification system** | Manual monitoring of 10,000+ markets is impossible; users expect to be notified when opportunities arise | Medium | Email/SMS/WhatsApp/webhook integration; needs configurable thresholds; WebSearch confirms all major platforms have this |
| **Position size calculator** | Risk management baseline - users need to know how much to bet given capital and edge | Low | Kelly criterion or fixed % of bankroll; accounts for confidence level |
| **Resolution rule display** | #1 cause of losses per research: misunderstanding exact resolution criteria | Low | Pull from API metadata; prominent display; prevents "common sense" ≠ "actual rule" errors |

## Differentiators

Features that set products apart. Not expected baseline, but create competitive advantage and justify premium.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-source edge detection** | Arbitrage alone is crowded (bots close opportunities in seconds); additional edge sources create sustainable advantage | High | Your specific edges (Metaculus divergence, longshot bias, news lag, political overreaction) are documented in research but rarely combined in one tool |
| **Metaculus divergence tracking** | Metaculus = expertise-driven forecasting vs Polymarket = money-driven; documented divergences of 10-20pp during events | High | Requires: (1) matching questions across platforms (semantic similarity), (2) tracking historical accuracy of each platform type, (3) identifying systematic biases; research shows Polymarket overreacts to news/tweets while Metaculus updates on technical reports |
| **Longshot bias detection** | Academic research confirms markets systematically misprice longshots (overvalued) and favorites (undervalued) | Medium | Statistical analysis of historical market prices vs outcomes; Management Science 2023 study confirms bias persists; requires outcome database and probability calibration curves |
| **News lag exploitation** | 5-10 minute information propagation windows during volatility; bots turning $313 → $414k in 30 days exploiting this | High | Requires: (1) news feed integration (Twitter, Reuters, Breaking News), (2) event classification (what markets does this affect?), (3) speed optimization (WebSocket, low latency); highly competitive space |
| **Political overreaction detection** | Markets overreact to debates, polls, tweets then mean-revert over 24-72hrs | Medium | Pattern recognition on historical price movements around event types; behavioral finance principle (overreaction followed by correction) well-documented |
| **Smart money / whale tracking** | Copy trading platforms like Stand show demand for following high-conviction traders; detecting insider activity valuable | Medium | On-chain wallet analysis (Polymarket is public blockchain); identify: (1) wallets with >70% win rate, (2) early movers on correct direction, (3) unusual bet sizing; API: track wallet addresses via Polymarket CLOB |
| **Opportunity quality scoring (1-10)** | Converts complex multi-factor analysis into actionable decision; reduces choice paralysis across 10,000+ markets | Medium | Weighted composite score: edge size (30%), confidence (25%), liquidity (20%), fees (15%), time-to-resolution (10%); human-calibrated thresholds (8+ = alert-worthy) |
| **Historical edge backtesting** | Users want proof the edge sources actually work; trust but verify | High | Requires historical market data + outcomes database; calculate: "if we followed this signal, what would returns be?"; builds confidence in system |
| **Human-in-the-loop design** | 75%+ of prediction market users lose money; auto-execution without human judgment is dangerous | Medium | Present opportunities with full context (why the edge exists, what could go wrong, resolution rules) rather than auto-trade; WhatsApp alert format forces human review |
| **Resolution timeline tracking** | Time value of money matters; 70% edge resolving in 1 week >> 70% edge resolving in 3 months | Low | Pull resolution date from market metadata; calculate IRR or APY instead of raw return; deprioritize long-dated markets |
| **Bundle arbitrage detection** | Advanced arbitrage: combinations of related markets where probabilities don't sum correctly | High | Requires: (1) identifying related markets (semantic + logical analysis), (2) constraint solving (linear programming to find mispriced bundles); documented in 2025 academic paper "Unravelling the Probabilistic Forest" |
| **Market maker rebate optimization** | Polymarket pays maker rebates (up to 3% back); placing limit orders vs market orders changes profitability | Medium | Smart order routing: when to take liquidity (urgency) vs provide liquidity (rebate); requires order book depth analysis |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain that lead to losses or bad UX.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Fully automated trading** | Columbia University 2025 study: 25% of Polymarket volume may be wash trading; bots compete in milliseconds; without human oversight, systematic errors compound; most users lose money | Keep human-in-the-loop design; send WhatsApp alerts for 8+ rated opportunities; user reviews context and decides whether to trade |
| **Ignoring resolution rules** | #1 mistake per multiple sources; even sophisticated traders lose money because market resolves on technical definition not "common sense"; vague terms like "official," "publicly available," "launch" cause losses | Always display full resolution criteria prominently; flag ambiguous language; show historical examples of surprising resolutions |
| **Market orders in thin markets** | Low liquidity = wide spreads; market orders can execute 20-50% worse than fair value; "0% fee" market with 5-cent spread worse than "2% fee" market with penny spread | Always show available liquidity at current price; calculate effective spread; warn when market depth < desired position size; default to limit orders |
| **Single-source edge reliance** | Arbitrage-only tools crowded (seconds to close); news-lag-only requires millisecond speed infrastructure; relying on one edge source = unsustainable as competition increases | Combine multiple edge sources (your 5 sources are good); diversification across edge types provides resilience |
| **Ignoring opportunity cost** | Capital locked in 3-month market vs 1-week market has very different ROI; 10% return in 6 months (20% APY) may be worse than 3% return in 1 week (156% APY) | Calculate annualized return or IRR; weight scoring by time-to-resolution; deprioritize long-dated markets unless edge is proportionally larger |
| **Overconfidence bias enablement** | Survey of Professional Forecasters: traders overtrade 45% more than optimal due to believing they have unique edge; UI that encourages maximum trading volume = users lose money | Design for skepticism: show "why you might be wrong," historical accuracy of similar signals, confidence intervals; recommend position sizes as % of bankroll (never "bet everything") |
| **Treating predictions as guarantees** | 70% probability ≠ 70% guaranteed; users misunderstand probabilities; leading to poor risk management | Clearly communicate uncertainty; show probability distributions; educate that even 90% edges lose 10% of the time; never use language like "sure thing" or "guaranteed" |
| **Wash trading / manipulation** | Columbia 2025 study: 25% of volume may be manipulative; detecting manipulation is hard; participating in it is illegal and reputational suicide | Flag suspicious patterns (wallets trading against themselves, coordinated pumps) but don't try to profit from them; focus on liquid markets where manipulation is harder |
| **Copy trading without context** | Following whale wallets sounds appealing but: (1) you don't know their strategy, (2) you don't know their exit plan, (3) may have insider info you don't, (4) timing lag means you get worse entry | If showing whale activity, frame as "informational" not "copy this"; show full position history, win rate, and bet sizing context |
| **Gamification / casino aesthetics** | Prediction markets are probability exchanges, not slot machines; gamification (flashy graphics, "spin to win," leaderboards emphasizing volume) encourages gambling behavior that leads to losses | Professional tool aesthetic; emphasize data, analysis, probabilities; leaderboards should rank by ROI or Sharpe ratio, not volume or total profit |

## Feature Dependencies

Understanding what must be built in what order:

```
Core Data Layer (API integrations, real-time feeds)
    ├─> Market matching engine (cross-platform pairing)
    │   ├─> Basic arbitrage detection
    │   └─> Bundle arbitrage detection (advanced)
    │
    ├─> Fee/liquidity calculator
    │   ├─> Opportunity scoring system
    │   └─> Position size recommendations
    │
    ├─> Edge detection modules (can be built in parallel)
    │   ├─> Metaculus divergence (requires Metaculus API + matching)
    │   ├─> Longshot bias (requires outcome database)
    │   ├─> News lag (requires news feed integration)
    │   ├─> Political overreaction (requires event classification)
    │   └─> Whale tracking (requires wallet analytics)
    │
    └─> Alert system (requires scoring to be complete)
        └─> WhatsApp integration

Historical data pipeline (separate concern)
    └─> Backtesting engine (proves edge validity)
```

**Critical path for MVP:**
1. Core Data Layer (Polymarket + Kalshi APIs)
2. Market matching engine (pair equivalent markets)
3. Basic arbitrage + fee calculation
4. Opportunity scoring (even if basic at first)
5. Alert system (WhatsApp)

**Can be added incrementally:**
- Additional edge sources (start with 1-2, add others based on performance)
- Backtesting (proves value but not required for initial launch)
- Advanced features (bundle arb, maker rebates)

## MVP Recommendation

For MVP (human-in-the-loop scanner with $500 capital), prioritize:

### Phase 1: Core Detection
1. **Multi-platform scanning** - Polymarket + Kalshi via APIs
2. **Market matching** - Identify equivalent markets across platforms
3. **Basic arbitrage detection** - YES + NO < $1.00 across platforms
4. **Fee calculation** - Account for Polymarket (0-3%) and Kalshi (0-2%) fees
5. **Liquidity filtering** - Min $500 available liquidity (matches capital)

### Phase 2: Quality Scoring
6. **Opportunity scoring** - Weighted composite (edge, confidence, liquidity, fees, time)
7. **Resolution rule display** - Prevent #1 cause of losses
8. **Position size calculator** - Kelly criterion or fixed % of $500 bankroll

### Phase 3: Alerts
9. **WhatsApp alerts** - Send opportunities rated 8+
10. **Human review workflow** - Message format designed for quick decision-making

### Phase 4: First Differentiator (pick ONE to start)
11a. **Metaculus divergence** - Easiest to implement, clear signal, documented historical accuracy
    OR
11b. **Longshot bias** - Requires outcome database but well-researched edge
    OR
11c. **News lag** - Highest upside but most complex (speed requirements)

### Defer to Post-MVP

- **Historical backtesting** - Valuable for trust but not required for initial functionality; can be added once MVP proves useful
- **Additional edge sources** - Start with 1 differentiating edge, add more based on performance data
- **Bundle arbitrage** - Complex (requires constraint solving); standard arbitrage sufficient for MVP
- **Whale tracking** - Interesting but secondary to direct edge detection
- **Market maker rebates** - Optimization for power users; simple market orders fine for MVP
- **Political overreaction detection** - Requires extensive historical data and pattern recognition; defer until core functionality proven

## Small Capital Considerations ($500 starting capital)

With $500 capital, certain features become MORE important:

**Critical:**
- **High fee threshold (>5%)** - With small positions, fixed costs and spreads matter more; need larger edges to overcome
- **Liquidity filtering** - Can't take 10% of market or you move price against yourself
- **Position sizing** - Never more than 5-10% of $500 ($25-50) per position to maintain diversification

**Less Important:**
- **Market maker rebates** - Only meaningful at scale ($10k+ positions)
- **Millisecond speed optimization** - Can't compete with HFT bots anyway; focus on edges they miss (Metaculus divergence, longshot bias)

## Market Maturity Context (2026)

The competitive landscape affects feature priority:

**Crowded:**
- Basic cross-platform arbitrage (closes in seconds, requires speed you can't match)
- News lag exploitation (HFT bots with sub-second latency dominate)

**Undersaturated:**
- Metaculus divergence (requires manual matching, semantic analysis)
- Longshot bias detection (requires statistical analysis + outcome database)
- Multi-edge composite scoring (most tools focus on one edge type)
- Human-in-the-loop design (most tools over-automate, leading to losses)

**Your competitive position:** Focus on edges that require analysis/judgment rather than pure speed, and keep human in the loop to avoid systematic errors.

## Sources

**Prediction Market Bot Features:**
- [Arbitrage Bots Dominate Polymarket With Millions in Profits](https://finance.yahoo.com/news/arbitrage-bots-dominate-polymarket-millions-100000888.html)
- [News-Driven Polymarket Bots: Trading Breaking Events Automatically | QuantVPS](https://www.quantvps.com/blog/news-driven-polymarket-bots)
- [Trading bot turns $313 into $438,000 on Polymarket in a month](https://finbold.com/trading-bot-turns-313-into-438000-on-polymarket-in-a-month/)
- [GitHub - Risk-Free-Prediction-Market-Trading-Bot](https://github.com/realfishsam/Risk-Free-Prediction-Market-Trading-Bot)

**Arbitrage Scanner Tools:**
- [GitHub - polymarket-kalshi-btc-arbitrage-bot](https://github.com/CarlosIbCu/polymarket-kalshi-btc-arbitrage-bot)
- [Prediction Markets Arbitrage & Positive EV Plays](https://getarbitragebets.com/)
- [Event Contract Arbitrage Calculator | EventArb](https://www.eventarb.com/)
- [GitHub - polymarket-arbitrage by ImMike](https://github.com/ImMike/polymarket-arbitrage)
- [Prediction Market Arbitrage Guide: Strategies for 2026](https://newyorkcityservers.com/blog/prediction-market-arbitrage-guide)

**Edge Detection Research:**
- [Today, We're Launching PriceArb — Statistical Edge Detection Dashboard](https://medium.com/option-screener/today-were-launching-pricearb-statistical-edge-detection-dashboard-for-prediction-markets-17055d852e90)
- [PriceArb - Prediction Market Edge Detection](https://pricearb.com/)
- [GitHub - Awesome-Prediction-Market-Tools](https://github.com/aarora4/Awesome-Prediction-Market-Tools)
- [Polymarket HFT: How Traders Use AI](https://www.quantvps.com/blog/polymarket-hft-traders-use-ai-arbitrage-mispricing)

**Crypto Trading Bot Table Stakes:**
- [Crypto Trading Bots 2026: Complete Guide | MEXC](https://blog.mexc.com/news/crypto-trading-bots-2026-complete-guide-to-automated-trading/)
- [Trading Bot Crypto: Complete Guide to Automation 2026](https://tickerly.net/trading-bot-crypto-complete-guide-2026/)
- [Best Crypto Trading Bots for Beginners in 2026](https://coindcx.com/blog/cryptocurrency/best-crypto-trading-bots/)

**Common Mistakes:**
- [Common mistakes when trading on Prediction market](https://whales.market/blog/common-mistakes-on-prediction-market/)
- [7 Mistakes New Users Make When Trading In Prediction Markets](https://mpost.io/7-mistakes-new-users-make-when-trading-in-prediction-markets/)
- [7 Mistakes New Prediction Market Traders Make](https://news.stand.trade/p/7-mistakes-new-predictive-market)
- [Advanced prediction market trading strategies](https://metamask.io/news/advanced-prediction-market-trading-strategies)

**Metaculus vs Polymarket:**
- [What are Prediction Markets? How Kalshi & Polymarket Work](https://www.oddsshark.com/prediction-markets)
- [Best Polymarket Alternatives 2025 | PolyTrack](https://www.polytrackhq.app/blog/polymarket-alternatives)
- [Manifold, Polymarket, and Metaculus comparison](https://manifold.markets/jacksonpolack/manifold-polymarket-and-metaculus-a)
- [Metaculus and Markets: What's the Difference?](https://www.metaculus.com/notebooks/38198/metaculus-and-markets-whats-the-difference/)

**News Lag & Arbitrage Research:**
- [How Prediction Market Arbitrage Works](https://www.benzinga.com/Opinion/26/01/50121957/how-prediction-market-arbitrage-works-and-why-panic-creates-free-money)
- [Predicting markets structural inefficiencies](https://www.panewslab.com/en/articles/fbe4d77a-a12f-4ed1-9519-cf8c3bdf8685)
- [Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets (arXiv)](https://arxiv.org/abs/2508.03474)
- [Building a Prediction Market Arbitrage Bot: Technical Implementation](https://navnoorbawa.substack.com/p/building-a-prediction-market-arbitrage)

**Longshot Bias:**
- [The Longshot Bias Is a Context Effect | Management Science](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.4684)
- [NBER: Explaining the Favorite-Longshot Bias](https://www.nber.org/system/files/working_papers/w15923/w15923.pdf)
- [Explaining the Favorite–Long Shot Bias | Journal of Political Economy](https://www.journals.uchicago.edu/doi/abs/10.1086/655844)
- [Favourite-longshot bias - Wikipedia](https://en.wikipedia.org/wiki/Favourite-longshot_bias)

**Fee Structures & Liquidity:**
- [Prediction Market Fees: The Exchange Fee Wars](https://defirate.com/learn/prediction-market-fees/)
- [Polymarket taker fees crypto prediction markets](https://bitcoinworld.co.in/polymarket-taker-fees-crypto-prediction/)
- [Kalshi Review Prediction Markets January, 2026](https://www.oddsshark.com/sportsbook-review/kalshi)

**Whale Tracking & Copy Trading:**
- [Whale's Market Outlook 2026 | Seeking Alpha](https://seekingalpha.com/article/4863211-whale-market-outlook-2026-crypto-majors-perp-dexs-prediction-markets)
- [Polywhaler - Polymarket Insider & Whale Tracker](https://www.polywhaler.com/)
- [Polymarket Ecosystem Guide: Over 170 Tools](https://www.panewslab.com/en/articles/4053e837-eec0-4606-b72b-7ad03ba01a83)
- [Unusual Whales Tool Monitors Insider Trading](https://phemex.com/news/article/unusual-whales-launches-tool-to-track-insider-trading-on-polymarket-54994)

**Mean Reversion & Overreaction:**
- [Mean Reversion: How Mean Reversion Signals Market Stability](https://fastercapital.com/content/Mean-Reversion--The-Bounce-Back--How-Mean-Reversion-Signals-Market-Stability.html)
- [Mean Reversion Basics (2025): Understanding Market Pullbacks](https://highstrike.com/mean-reversion/)
