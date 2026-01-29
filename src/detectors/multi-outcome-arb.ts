/**
 * Multi-Outcome Arbitrage Detector
 *
 * Detects arbitrage opportunities within a single market where
 * buying or selling all outcomes yields guaranteed profit.
 *
 * EDGE-05 requirement: Multi-outcome arbitrage detection
 *
 * @module detectors/multi-outcome-arb
 */

import { getDatabase } from '../database/schema.js';

/**
 * Structure for multi-outcome market data
 */
export interface MultiOutcomeMarket {
  /** Market ID */
  id: string;
  /** Platform (polymarket or kalshi) */
  platform: string;
  /** Market question */
  question: string;
  /** Array of outcome names */
  outcomes: string[];
  /** Ask prices by outcome (what you pay to buy) */
  askPrices: Record<string, number>;
  /** Bid prices by outcome (what you get when selling) */
  bidPrices: Record<string, number>;
  /** Liquidity available per outcome in USD */
  liquidity: Record<string, number>;
  /** Snapshot timestamp in milliseconds */
  timestamp: number;
}

/**
 * Arbitrage opportunity details
 */
export interface ArbOpportunity {
  /** Market ID */
  marketId: string;
  /** Platform */
  platform: string;
  /** Market question for reference */
  question: string;
  /** Type of arbitrage: buy (prices < 100%) or sell (prices > 100%) */
  type: 'buy' | 'sell';
  /** Gross edge before fees (percentage) */
  grossEdge: number;
  /** Net edge after fees (percentage) */
  netEdge: number;
  /** Capital required for unit trade ($100 payout) */
  capitalRequired: number;
  /** Expected profit after fees */
  expectedProfit: number;
  /** Confidence score (0-1) based on edge and liquidity */
  confidence: number;
  /** Number of outcomes in this market */
  outcomeCount: number;
  /** Snapshot timestamp (seconds) */
  timestamp: number;
  /** Minimum liquidity across all outcomes */
  minLiquidity: number;
}

/**
 * Snapshot row structure from database
 */
interface SnapshotRow {
  id: number;
  platform: string;
  market_id: string;
  timestamp: number;
  data: string;
}

/**
 * Parsed snapshot data structure
 */
interface SnapshotData {
  question?: string;
  outcomes?: string[];
  askPrices?: Record<string, number>;
  bidPrices?: Record<string, number>;
  liquidity?: Record<string, number>;
}

/**
 * Multi-Outcome Arbitrage Detector
 *
 * Detects when a market's prices allow guaranteed profit by:
 * - BUY ARB: Buying all outcomes for less than 100% total
 * - SELL ARB: Selling all outcomes for more than 100% total
 *
 * Accounts for fees and liquidity constraints.
 */
export class MultiOutcomeArbDetector {
  /** Minimum net edge required (after fees) in percentage */
  readonly minNetEdge: number;
  /** Minimum liquidity required per outcome in USD */
  readonly minLiquidityPerOutcome: number;
  /** Fee percentage per trade */
  readonly feePercent: number;
  /** Maximum age of snapshots to consider (30 minutes in ms) */
  private readonly maxSnapshotAge = 30 * 60 * 1000;

  /**
   * Create a new MultiOutcomeArbDetector
   *
   * @param minNetEdge - Minimum net edge threshold (default: 0.5%)
   * @param minLiquidityPerOutcome - Minimum liquidity per outcome (default: $500)
   * @param feePercent - Fee percentage per trade (default: 2%)
   */
  constructor(
    minNetEdge: number = 0.5,
    minLiquidityPerOutcome: number = 500,
    feePercent: number = 2
  ) {
    this.minNetEdge = minNetEdge;
    this.minLiquidityPerOutcome = minLiquidityPerOutcome;
    this.feePercent = feePercent;
  }

  /**
   * Detect multi-outcome arbitrage opportunities for a platform
   *
   * @param platform - Platform to scan (polymarket or kalshi)
   * @returns Array of arbitrage opportunities sorted by net edge DESC
   */
  async detect(platform: string): Promise<ArbOpportunity[]> {
    const db = getDatabase();

    // Get recent snapshots (last 30 minutes)
    const cutoffTime = Math.floor((Date.now() - this.maxSnapshotAge) / 1000);

    const stmt = db.prepare(`
      SELECT id, platform, market_id, timestamp, data
      FROM market_snapshots
      WHERE platform = ?
        AND timestamp > ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(platform, cutoffTime) as SnapshotRow[];

    // Group snapshots by market_id (keep most recent per market)
    const latestByMarket = new Map<string, SnapshotRow>();
    for (const row of rows) {
      if (!latestByMarket.has(row.market_id)) {
        latestByMarket.set(row.market_id, row);
      }
    }

    const opportunities: ArbOpportunity[] = [];

    for (const row of latestByMarket.values()) {
      const market = this.parseSnapshot(row);
      if (!market) continue;

      const opportunity = this.checkMarket(market);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Sort by net edge descending
    opportunities.sort((a, b) => b.netEdge - a.netEdge);

    return opportunities;
  }

  /**
   * Parse a database snapshot row into MultiOutcomeMarket
   */
  private parseSnapshot(row: SnapshotRow): MultiOutcomeMarket | null {
    try {
      const data = JSON.parse(row.data) as SnapshotData;

      if (!data.outcomes || !data.askPrices || !data.bidPrices) {
        return null;
      }

      return {
        id: row.market_id,
        platform: row.platform,
        question: data.question || '',
        outcomes: data.outcomes,
        askPrices: data.askPrices,
        bidPrices: data.bidPrices,
        liquidity: data.liquidity || {},
        timestamp: row.timestamp * 1000, // Convert to ms
      };
    } catch {
      return null;
    }
  }

  /**
   * Check a single market for arbitrage opportunities
   *
   * @param market - Market to analyze
   * @returns ArbOpportunity if found, null otherwise
   */
  private checkMarket(market: MultiOutcomeMarket): ArbOpportunity | null {
    const outcomeCount = market.outcomes.length;

    // Skip binary markets (handled by correlated detector)
    if (outcomeCount < 3) {
      return null;
    }

    // Validate liquidity for all outcomes
    if (!this.validateLiquidity(market)) {
      return null;
    }

    // Calculate buy and sell arbitrage edges
    const buyEdge = this.calculateBuyArbEdge(market.askPrices, market.outcomes);
    const sellEdge = this.calculateSellArbEdge(market.bidPrices, market.outcomes);

    // Determine which arb type to use (if any)
    let type: 'buy' | 'sell';
    let grossEdge: number;

    if (buyEdge > sellEdge && buyEdge > 0) {
      type = 'buy';
      grossEdge = buyEdge;
    } else if (sellEdge > 0) {
      type = 'sell';
      grossEdge = sellEdge;
    } else {
      return null; // No arbitrage opportunity
    }

    // Adjust for fees
    const netEdge = this.adjustForFees(grossEdge, outcomeCount);

    // Check if net edge meets minimum threshold
    if (netEdge < this.minNetEdge) {
      return null;
    }

    // Calculate capital required and expected profit
    const { capitalRequired, expectedProfit } = this.calculateProfitMetrics(
      market,
      type,
      grossEdge,
      netEdge
    );

    // Calculate confidence score
    const confidence = this.calculateConfidence(netEdge, market);

    // Get minimum liquidity across outcomes
    const minLiquidity = this.getMinLiquidity(market);

    return {
      marketId: market.id,
      platform: market.platform,
      question: market.question,
      type,
      grossEdge,
      netEdge,
      capitalRequired,
      expectedProfit,
      confidence,
      outcomeCount,
      timestamp: Math.floor(market.timestamp / 1000), // Convert back to seconds
      minLiquidity,
    };
  }

  /**
   * Calculate buy arbitrage edge
   * Buy arb exists when sum of ask prices < 100%
   *
   * @param askPrices - Ask prices by outcome
   * @param outcomes - Array of outcome names
   * @returns Edge percentage (positive if arb exists)
   */
  private calculateBuyArbEdge(askPrices: Record<string, number>, outcomes: string[]): number {
    let sum = 0;
    for (const outcome of outcomes) {
      const price = askPrices[outcome];
      if (typeof price !== 'number') {
        return 0; // Invalid data
      }
      sum += price;
    }

    // Edge = 100% - sum of prices
    // If sum < 100%, edge is positive
    return (1 - sum) * 100;
  }

  /**
   * Calculate sell arbitrage edge
   * Sell arb exists when sum of bid prices > 100%
   *
   * @param bidPrices - Bid prices by outcome
   * @param outcomes - Array of outcome names
   * @returns Edge percentage (positive if arb exists)
   */
  private calculateSellArbEdge(bidPrices: Record<string, number>, outcomes: string[]): number {
    let sum = 0;
    for (const outcome of outcomes) {
      const price = bidPrices[outcome];
      if (typeof price !== 'number') {
        return 0; // Invalid data
      }
      sum += price;
    }

    // Edge = sum of prices - 100%
    // If sum > 100%, edge is positive
    return (sum - 1) * 100;
  }

  /**
   * Adjust gross edge for fees
   * Fee = outcomeCount * feePercent (each trade incurs fee)
   *
   * @param grossEdge - Gross edge percentage
   * @param outcomeCount - Number of outcomes
   * @returns Net edge after fees
   */
  private adjustForFees(grossEdge: number, outcomeCount: number): number {
    const totalFees = outcomeCount * this.feePercent;
    return grossEdge - totalFees;
  }

  /**
   * Validate that all outcomes meet minimum liquidity
   *
   * @param market - Market to validate
   * @returns True if all outcomes have sufficient liquidity
   */
  private validateLiquidity(market: MultiOutcomeMarket): boolean {
    for (const outcome of market.outcomes) {
      const liq = market.liquidity[outcome];
      if (typeof liq !== 'number' || liq < this.minLiquidityPerOutcome) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get minimum liquidity across all outcomes
   */
  private getMinLiquidity(market: MultiOutcomeMarket): number {
    let min = Infinity;
    for (const outcome of market.outcomes) {
      const liq = market.liquidity[outcome];
      if (typeof liq === 'number' && liq < min) {
        min = liq;
      }
    }
    return min === Infinity ? 0 : min;
  }

  /**
   * Calculate capital required and expected profit
   *
   * For buy arb: capital = sum of ask prices for $100 payout
   * For sell arb: capital = $100 (collateral needed)
   */
  private calculateProfitMetrics(
    market: MultiOutcomeMarket,
    type: 'buy' | 'sell',
    grossEdge: number,
    netEdge: number
  ): { capitalRequired: number; expectedProfit: number } {
    if (type === 'buy') {
      // For buy arb, capital = sum of prices * 100 (to get $100 payout)
      let sumPrices = 0;
      for (const outcome of market.outcomes) {
        sumPrices += market.askPrices[outcome] || 0;
      }
      const capitalRequired = sumPrices * 100;
      // Gross profit = $100 - capital
      // Net profit = gross profit * (netEdge / grossEdge) to account for fees
      const grossProfit = 100 - capitalRequired;
      const expectedProfit = grossProfit * (netEdge / grossEdge);
      return { capitalRequired, expectedProfit };
    } else {
      // For sell arb, capital = $100 collateral per outcome
      // But you collect the bid prices upfront
      let sumPrices = 0;
      for (const outcome of market.outcomes) {
        sumPrices += market.bidPrices[outcome] || 0;
      }
      const capitalRequired = 100; // Collateral needed
      // You collect sum of bid prices, pay out $100
      const grossProfit = sumPrices * 100 - 100;
      const expectedProfit = grossProfit * (netEdge / grossEdge);
      return { capitalRequired, expectedProfit };
    }
  }

  /**
   * Calculate confidence score based on edge and liquidity
   *
   * 0.9-1.0: High edge (>3% net) with deep liquidity
   * 0.7-0.9: Moderate edge (1-3% net)
   * <0.7: Low confidence (filtered out by threshold)
   */
  private calculateConfidence(netEdge: number, market: MultiOutcomeMarket): number {
    const minLiq = this.getMinLiquidity(market);

    // Base confidence from edge
    let confidence: number;
    if (netEdge >= 3) {
      // High edge: 0.9 - 1.0
      confidence = 0.9 + Math.min((netEdge - 3) / 10, 0.1);
    } else if (netEdge >= 1) {
      // Moderate edge: 0.7 - 0.9
      confidence = 0.7 + ((netEdge - 1) / 2) * 0.2;
    } else {
      // Low edge: 0.5 - 0.7
      confidence = 0.5 + (netEdge / 1) * 0.2;
    }

    // Boost confidence for deep liquidity
    if (minLiq >= 2000) {
      confidence = Math.min(confidence + 0.05, 1.0);
    }

    return Math.min(confidence, 1.0);
  }
}
