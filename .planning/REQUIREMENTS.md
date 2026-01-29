# Requirements: Prediction Market Edge Scanner

**Defined:** 2026-01-29
**Core Value:** Surface high-confidence mispricings where analysis shows the market is wrong, filtered so only quality opportunities reach the user.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data & Scanning

- [ ] **DATA-01**: Pull all active markets and odds from Polymarket API
- [ ] **DATA-02**: Pull all active markets and odds from Kalshi API
- [ ] **DATA-03**: Pull superforecaster consensus from Metaculus API
- [ ] **DATA-04**: Match equivalent events across Polymarket, Kalshi, and Metaculus
- [ ] **DATA-05**: Fetch order book depth for liquidity assessment (not volume — wash trading inflates it)
- [ ] **DATA-06**: Track whale wallet activity on Polymarket (on-chain data)
- [ ] **DATA-07**: Store market snapshots for historical calibration analysis
- [ ] **DATA-08**: Implement rate limiting and backoff to avoid API throttling

### Edge Detection

- [ ] **EDGE-01**: Metaculus divergence — flag when superforecaster consensus differs >5% from market odds
- [ ] **EDGE-02**: Cross-platform arbitrage — flag when same event priced >5% differently on Polymarket vs Kalshi (after fees)
- [ ] **EDGE-03**: Longshot bias — identify overpriced longshots (<15% implied prob) and underpriced favorites (>85%)
- [ ] **EDGE-04**: Correlated market consistency — flag when related markets have contradictory probabilities
- [ ] **EDGE-05**: Multi-outcome arbitrage — flag when probabilities in multi-option markets don't sum correctly
- [ ] **EDGE-06**: Whale tracking — flag when historically profitable wallets take significant positions
- [ ] **EDGE-07**: Settlement rule parser — extract and compare resolution criteria across platforms before enabling cross-platform arb

### Rating System

- [ ] **RATE-01**: Score each opportunity 1-10 based on composite factors
- [ ] **RATE-02**: Factor: edge size (how far off is the price)
- [ ] **RATE-03**: Factor: confidence (how strong is the signal)
- [ ] **RATE-04**: Factor: liquidity (can you actually get filled at this price)
- [ ] **RATE-05**: Factor: time to resolution (urgency)
- [ ] **RATE-06**: Factor: fee-adjusted profit potential (edge must exceed ~5% after fees)
- [ ] **RATE-07**: 7+ rating triggers immediate alert; 5-6 goes to daily digest; <5 logged only

### Alerts & Interface

- [ ] **ALRT-01**: WhatsApp integration via Twilio for instant notifications
- [ ] **ALRT-02**: Immediate alert for opportunities rated 7+/10
- [ ] **ALRT-03**: Daily digest message summarizing 5-6 rated opportunities
- [ ] **ALRT-04**: Each alert includes: rating, market link, edge type, why it's mispriced, suggested position size
- [ ] **ALRT-05**: Reply "more" triggers deeper analysis via Claude
- [ ] **ALRT-06**: Deduplication — don't alert on same opportunity multiple times within 4-6 hours

### Position Sizing

- [ ] **SIZE-01**: Kelly criterion calculation for optimal position size
- [ ] **SIZE-02**: Input: estimated edge (from detection), current bankroll, confidence level
- [ ] **SIZE-03**: Output: suggested bet size with fractional Kelly option (half-Kelly for safety)
- [ ] **SIZE-04**: Cap suggestions at configurable max (e.g., 10% of bankroll per trade)

### Performance Tracking

- [ ] **TRCK-01**: Log every alert sent with timestamp, edge type, rating, market details
- [ ] **TRCK-02**: Track user action on alerts (acted / passed / no response)
- [ ] **TRCK-03**: Record market resolution outcomes when available
- [ ] **TRCK-04**: Calculate win/loss rate by edge type
- [ ] **TRCK-05**: Calculate overall ROI over time
- [ ] **TRCK-06**: Calculate alert-to-action rate
- [ ] **TRCK-07**: Build historical calibration database for future analysis
- [ ] **TRCK-08**: Weekly performance summary via WhatsApp

### Infrastructure

- [ ] **INFR-01**: Run continuously on VPS (scan every 15-30 minutes)
- [ ] **INFR-02**: Secure credential storage (environment variables, not in code)
- [ ] **INFR-03**: Hot wallet separation if any on-chain interaction needed
- [ ] **INFR-04**: Logging and error alerting
- [ ] **INFR-05**: Graceful handling of API failures and rate limits

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Additional Edge Sources

- **NEWS-01**: Sluggish market detection — markets that haven't moved on widely-known news
- **POLL-01**: Polling aggregate comparison for political markets
- **SENT-01**: Twitter/X sentiment divergence analysis
- **HIST-01**: Historical calibration-based adjustments (once enough data collected)

### Enhanced Features

- **AUTO-01**: Optional automated execution via PolyGun or direct API
- **WEB-01**: Web dashboard for reviewing opportunities
- **MKTMKR-01**: Market maker behavior detection

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Speed-based news trading | Can't compete with $500 capital against institutional infra |
| Fully automated execution | Human-in-the-loop for v1, learn patterns first |
| Sports betting markets | Legal gray area in Texas |
| Mobile app | WhatsApp is the interface |
| Sub-second latency | Not competing with HFT bots |
| Building proprietary pricing models | Use external references (Metaculus, data APIs) instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-* | TBD | Pending |
| EDGE-* | TBD | Pending |
| RATE-* | TBD | Pending |
| ALRT-* | TBD | Pending |
| SIZE-* | TBD | Pending |
| TRCK-* | TBD | Pending |
| INFR-* | TBD | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 42

---
*Requirements defined: 2026-01-29*
*Last updated: 2026-01-29 after initial definition*
