# Prediction Market Edge Scanner

## What This Is

A system that scans Polymarket and Kalshi across all market categories, detects mispricings using multiple edge sources, rates opportunities, and alerts the user via WhatsApp when high-confidence opportunities appear. Human-in-the-loop — alerts only, user decides and executes manually.

## Core Value

Surface the best mispricings across all prediction markets, filtered by a rating system so only high-conviction opportunities reach the user.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Data & Scanning**
- [ ] Market scanner — pull all active markets and odds from Polymarket API
- [ ] Market scanner — pull all active markets and odds from Kalshi API
- [ ] Market matcher — identify equivalent events across platforms
- [ ] Metaculus integration — pull superforecaster consensus for comparable events

**Edge Detection**
- [ ] Cross-platform arbitrage — flag when same event priced differently on Polymarket vs Kalshi (>5% gap after fees)
- [ ] Metaculus divergence — flag when superforecaster consensus differs significantly from tradeable market odds
- [ ] Longshot bias detector — identify overpriced longshots and underpriced favorites
- [ ] News correlation — monitor news feeds, flag markets that haven't moved on relevant breaking news
- [ ] External data comparison — compare structured data (weather, economic indicators) to market odds
- [ ] Political overreaction — detect when partisan money pushes political markets away from polling/model consensus
- [ ] Settlement rule analysis — flag markets where fine print creates mispricing opportunities

**Rating System**
- [ ] Rating engine (1-10) — score each opportunity based on:
  - Edge size (how far off is the price?)
  - Confidence (how strong is the signal?)
  - Liquidity (can you get filled at this price?)
  - Time to resolution (urgency)
  - Fee-adjusted profit potential
- [ ] Fee threshold filter — only surface opportunities with >5% edge after fees

**Alerts & Interface**
- [ ] WhatsApp alerts — immediate notification for high-rated opportunities (8+/10)
- [ ] Daily digest — summary of medium-rated opportunities (5-7/10)
- [ ] Alert content — rating, market link, why it's mispriced, suggested position size
- [ ] Reply "more" — deeper analysis on demand via WhatsApp
- [ ] Trade log — track alerts sent, actions taken, outcomes, P&L by edge type

### Out of Scope

- Automated trade execution — user stays in control, manual execution only
- Sub-second latency trading — not competing with HFT bots
- Sports betting markets — legal gray area, focus on other categories first
- Building own pricing models — use external references (Metaculus, data APIs), not proprietary models

## Context

**Known exploitable edges (from research):**
- Longshot bias is persistent across all betting markets
- Cross-platform arbitrage extracted $40M+ from Polymarket in 2024-2025
- Political markets show systematic partisan bias
- Metaculus historically more accurate than tradeable markets
- Weather/economic data updates before markets adjust
- Settlement rules create mispricings when traders miss fine print

**Fee math:** Polymarket ~2% fees, Kalshi similar. Edges <5% are eaten by fees. Cross-platform arb needs >5% gap after both sides' fees.

**Starting capital:** $500 validation capital. Prove the system works, then scale.

**User situation:** On H1B visa. Trading/investing is one of few legal paths to additional income.

## Constraints

- **Capital**: $500 starting — size positions conservatively (Kelly-ish, fractional)
- **Execution**: Human-in-the-loop — alerts only, no auto-trading
- **Fee threshold**: >5% edge required after fees to trigger alert
- **Tech stack**: Python, free-tier APIs where possible, WhatsApp via Twilio
- **Time investment**: System runs autonomously, user spends <30 min/day reviewing alerts
- **Legal**: Avoid sports-style contracts given Texas regulatory uncertainty

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| All markets, all edge types | User wants broad coverage, not niche | — Pending |
| Human-in-the-loop (no auto-trading) | Safer for learning, avoids catastrophic bot errors | — Pending |
| WhatsApp for alerts | User preference, can reply for more analysis | — Pending |
| 5% fee threshold | Academic research shows smaller edges eaten by fees | — Pending |
| Rating system (1-10) | Filter noise, prioritize high-conviction alerts | — Pending |
| Metaculus as reference | Historically more accurate than tradeable markets | — Pending |

---
*Last updated: 2026-01-29 after initialization*
