/**
 * Common market types shared across platforms
 *
 * @module types/market
 */

/**
 * Platform identifier
 */
export type Platform = 'polymarket' | 'kalshi';

/**
 * Common market structure normalized across platforms
 */
export interface Market {
  /** Unique market identifier (platform-specific) */
  id: string;
  /** Source platform */
  platform: Platform;
  /** Market question/title */
  question: string;
  /** Possible outcomes (typically ["Yes", "No"]) */
  outcomes: string[];
  /** Current prices for each outcome (0-1 scale) */
  prices: Record<string, number>;
  /** Market close/expiration date */
  closeDate: string;
  /** 24h trading volume in USD (optional, may be unreliable due to wash trading) */
  volume?: number;
  /** Total liquidity in the order book */
  liquidity?: number;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Order book level with price and size
 */
export interface OrderBookLevel {
  /** Price (0-1 scale for prediction markets, in cents for Kalshi) */
  price: number;
  /** Size/quantity at this price level */
  size: number;
}

/**
 * Order book structure
 */
export interface OrderBook {
  /** Bid (buy) levels, sorted by price descending */
  bids: OrderBookLevel[];
  /** Ask (sell) levels, sorted by price ascending */
  asks: OrderBookLevel[];
  /** Total depth (sum of top N levels) */
  depth: number;
  /** Timestamp of the order book snapshot */
  timestamp: number;
}

/**
 * Market snapshot for historical storage
 */
export interface MarketSnapshot {
  /** Source platform */
  platform: Platform;
  /** Market ID */
  marketId: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Market data at snapshot time */
  data: {
    question: string;
    outcomes: string[];
    prices: Record<string, number>;
    volume?: number;
    liquidity?: number;
    orderBookDepth?: number;
  };
}
