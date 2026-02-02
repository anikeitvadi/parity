# Quantitative Arbitrage Analysis

**Source:** "Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets" (arXiv:2508.03474v1)
**Added:** 2026-02-02

## Key Statistics

- **Total extracted (Apr 2024 - Apr 2025):** $39,688,585
- **Top trader profit:** $2,009,632 from 4,049 trades ($496 avg)
- **Conditions analyzed:** 17,218
- **Single-market arbitrage rate:** 41% (7,051 conditions)
- **Median mispricing:** $0.60 per dollar (40% off)
- **Dependent market pairs found:** 1,576
- **Exploitable combinatorial pairs:** 13

## Profit Breakdown

| Type | Amount |
|------|--------|
| Single condition (buy both < $1) | $5,899,287 |
| Single condition (sell both > $1) | $4,682,075 |
| Market rebalancing (buy YES < $1) | $11,092,286 |
| Market rebalancing (sell YES > $1) | $612,189 |
| Market rebalancing (buy NO) | $17,307,114 |
| Combinatorial arbitrage | $95,634 |
| **Total** | **$39,688,585** |

## Mathematical Framework

### Marginal Polytope
- Valid payoff vectors: Z = {φ(ω) : ω ∈ Ω}
- Arbitrage-free prices must lie in M = conv(Z)
- NCAA 2010: 2^63 possible outcomes, impossible to enumerate

### Bregman Projection
- Max profit = D(μ*||θ) where μ* is projection onto M
- For LMSR: D is Kullback-Leibler divergence
- Requires convex optimization, not simple averaging

### Frank-Wolfe Algorithm
- Reduces projection to sequence of linear programs
- 50-150 iterations typically sufficient
- Uses Gurobi IP solver (1-30s per iteration)
- Barrier method handles gradient explosion near boundaries

## Execution Reality

### Latency Hierarchy
| System | Total Latency |
|--------|---------------|
| Retail (API polling) | ~2,650ms |
| Sophisticated (WebSocket + parallel) | ~2,040ms |
| Decision-to-mempool (fast wallets) | ~30ms |

### Non-Atomic Execution Risk
- CLOB is sequential, not atomic
- One leg fills, price moves, second leg fails
- Minimum $0.05 profit threshold required
- Need parallel execution in same Polygon block

### Liquidity Constraints
- Profit capped by min(liquidity across all positions)
- VWAP analysis per block (~2s windows)
- 75% of orders fill within 1 hour (950 blocks)

## Dependency Detection

- Used DeepSeek-R1-Distill-Qwen-32B
- 81.45% accuracy on complex multi-condition markets
- Input: Two market descriptions
- Output: JSON of valid outcome combinations
- 1,576 dependent pairs found in 2024 election
- 13 manually verified as exploitable

## What Quants DON'T Capture

1. **Metaculus divergence** - No superforecaster integration
2. **Settlement divergence** - Ignored (causes double losses)
3. **Domain expertise** - LLM is 81% accurate, not 100%
4. **Longshot bias** - Behavioral, requires calibration data
5. **Whale movements** - They ARE the whales

## Implications for Our Scanner

### Cannot Compete On
- Speed (30ms vs 15min polling)
- Capital ($500 vs $500K+)
- Simple sum-to-one arbitrage (already extracted)
- Integer programming infrastructure

### Can Compete On
- Metaculus forecast divergence (qualitative)
- Settlement rule verification (human judgment)
- Niche domain expertise
- Longshot bias detection (behavioral)
- Whale tailing (follow, don't compete)

### Implementation Adjustments
- Add VWAP-based price analysis (not just spot)
- Set $0.05 minimum profit threshold after fees
- Add dependency detection via LLM (future phase)
- Focus on edges requiring judgment, not speed

## References

- Paper: arXiv:2508.03474v1
- Theory: arXiv:1606.02825v2 (Integer Programming for Market Making)
- Solver: Gurobi Optimizer
- LLM: DeepSeek-R1-Distill-Qwen-32B
- Data: Alchemy Polygon node API
- Contract: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
