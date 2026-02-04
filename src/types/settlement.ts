/**
 * Settlement rule types for cross-platform arbitrage verification
 * @module types/settlement
 */

/** Platform-specific settlement mechanism */
export type SettlementMechanism = 'uma_oracle' | 'centralized' | 'unknown';

/** Settlement risk level based on comparison results */
export type SettlementRisk = 'HIGH' | 'MEDIUM' | 'LOW';

/** Extracted settlement criteria from market metadata */
export interface SettlementCriteria {
  /** Source platform */
  platform: 'polymarket' | 'kalshi';
  /** Market identifier */
  marketId: string;
  /** Market question/title */
  question: string;
  /** Primary resolution rule text */
  primaryRule: string;
  /** Secondary/clarification rules */
  secondaryRule?: string;
  /** Outcome labels */
  outcomes: string[];
  /** Extracted resolution date (if parseable) */
  resolutionDate?: Date;
  /** Data source for resolution (e.g., "BLS", "SEC filing") */
  dataSource?: string;
  /** Settlement mechanism type */
  settlementType: 'binary' | 'scalar' | 'categorical';
  /** Extracted metadata */
  extracted: {
    dates: Date[];
    keywords: string[];
    entities: string[];
  };
}

/** Similarity scores between two markets */
export interface SimilarityScores {
  /** Question text similarity (0-1) */
  question: number;
  /** Resolution criteria similarity (0-1) */
  criteria: number;
  /** Resolution timing alignment (0-1) */
  timing: number;
  /** Data source agreement (0-1) */
  dataSource: number;
  /** Weighted overall confidence (0-1) */
  overall: number;
}

/** Result of comparing settlement rules between platforms */
export interface SettlementComparison {
  /** Polymarket market ID */
  polymarketId: string;
  /** Kalshi ticker */
  kalshiTicker: string;
  /** Similarity scores */
  similarity: SimilarityScores;
  /** Whether safe for cross-platform arbitrage */
  safeForArbitrage: boolean;
  /** Identified risk factors */
  riskFactors: string[];
  /** Manual override status */
  manualOverride?: 'safe' | 'unsafe';
  /** Actual settlement outcome (for tracking) */
  settlementOutcome?: 'matched' | 'diverged';
  /** When comparison was performed */
  comparedAt: Date;
  /** Optional notes */
  notes?: string;
}

/** Database row for settlement comparison */
export interface SettlementComparisonRow {
  id: number;
  polymarket_id: string;
  kalshi_ticker: string;
  question_similarity: number;
  criteria_similarity: number;
  timing_similarity: number;
  data_source_similarity: number;
  overall_confidence: number;
  safe_for_arbitrage: number; // SQLite boolean
  risk_factors: string; // JSON array
  manual_override: string | null;
  settlement_outcome: string | null;
  notes: string | null;
  compared_at: number;
  created_at: number;
}
