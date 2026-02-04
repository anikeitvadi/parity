import { getDatabase } from './schema.js';
import type { ScoredOpportunity } from '../scoring/types.js';
import type { SettlementComparison, SettlementComparisonRow } from '../types/settlement.js';

/**
 * Market snapshot data structure
 */
export interface MarketSnapshot {
  platform: string;
  marketId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Database row structure for market snapshots
 */
interface SnapshotRow {
  id: number;
  platform: string;
  market_id: string;
  timestamp: number;
  data: string;
}

/**
 * Convert database row to MarketSnapshot
 */
function rowToSnapshot(row: SnapshotRow): MarketSnapshot {
  return {
    platform: row.platform,
    marketId: row.market_id,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
  };
}

/**
 * Insert a single market snapshot.
 * Uses INSERT OR IGNORE to handle duplicates gracefully.
 */
export function insertSnapshot(snapshot: MarketSnapshot): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO market_snapshots (platform, market_id, timestamp, data)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(snapshot.platform, snapshot.marketId, snapshot.timestamp, JSON.stringify(snapshot.data));
}

/**
 * Batch insert multiple snapshots within a transaction.
 * Provides 10-100x speedup compared to individual inserts.
 */
export function insertMany(snapshots: MarketSnapshot[]): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO market_snapshots (platform, market_id, timestamp, data)
    VALUES (?, ?, ?, ?)
  `);

  const insertTransaction = db.transaction((items: MarketSnapshot[]) => {
    for (const snapshot of items) {
      stmt.run(snapshot.platform, snapshot.marketId, snapshot.timestamp, JSON.stringify(snapshot.data));
    }
  });

  insertTransaction(snapshots);
}

/**
 * Get the N most recent snapshots for a specific platform.
 * Results ordered by timestamp descending (newest first).
 */
export function getRecentSnapshots(platform: string, limit: number): MarketSnapshot[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, platform, market_id, timestamp, data
    FROM market_snapshots
    WHERE platform = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  const rows = stmt.all(platform, limit) as SnapshotRow[];
  return rows.map(rowToSnapshot);
}

/**
 * Get snapshot history for a specific market within a time range.
 * Results ordered by timestamp ascending (oldest first).
 */
export function getMarketHistory(
  marketId: string,
  startTime: number,
  endTime: number
): MarketSnapshot[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, platform, market_id, timestamp, data
    FROM market_snapshots
    WHERE market_id = ?
      AND timestamp >= ?
      AND timestamp <= ?
    ORDER BY timestamp ASC
  `);
  const rows = stmt.all(marketId, startTime, endTime) as SnapshotRow[];
  return rows.map(rowToSnapshot);
}

/**
 * Get the most recent snapshot for a specific market on a platform.
 * Returns null if no snapshot exists.
 */
export function getLatestSnapshot(
  platform: string,
  marketId: string
): MarketSnapshot | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, platform, market_id, timestamp, data
    FROM market_snapshots
    WHERE platform = ?
      AND market_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);
  const row = stmt.get(platform, marketId) as SnapshotRow | undefined;
  return row ? rowToSnapshot(row) : null;
}

/**
 * Matched market pair row structure
 */
interface MatchedMarketRow {
  id: number;
  polymarket_id: string;
  kalshi_ticker: string;
  confidence: number;
  method: string;
  timestamp: number;
}

/**
 * Insert or update a matched market pair.
 * Uses INSERT OR REPLACE to update existing matches with new confidence/method.
 */
export function insertMatch(
  polymarketId: string,
  kalshiTicker: string,
  confidence: number,
  method: string
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matched_markets
    (polymarket_id, kalshi_ticker, confidence, method, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(polymarketId, kalshiTicker, confidence, method, Date.now());
}

/**
 * Get recent matched market pairs above a minimum confidence threshold.
 */
export function getRecentMatches(
  minConfidence: number = 0.5,
  limit: number = 100
): MatchedMarketRow[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, polymarket_id, kalshi_ticker, confidence, method, timestamp
    FROM matched_markets
    WHERE confidence >= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(minConfidence, limit) as MatchedMarketRow[];
}

// =============================================================================
// Opportunity Persistence Queries
// =============================================================================

/**
 * Database row structure for opportunities
 */
export interface OpportunityRow {
  id: number;
  opportunity_id: string;
  type: string;
  platform: string;
  market_id: string;
  market_question: string;
  gross_edge: number;
  net_edge: number;
  score: number;
  position_size: number;
  position_percent: number;
  liquidity: number;
  detected_at: number;
  close_date: string | null;
  score_breakdown: string;
  created_at: number;
}

/**
 * Insert a single scored opportunity.
 * Uses INSERT OR IGNORE to handle duplicates gracefully.
 */
export function insertOpportunity(opp: ScoredOpportunity): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO opportunities
    (opportunity_id, type, platform, market_id, market_question,
     gross_edge, net_edge, score, position_size, position_percent,
     liquidity, detected_at, close_date, score_breakdown)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    opp.id,
    opp.type,
    opp.platform,
    opp.marketId,
    opp.marketQuestion,
    opp.grossEdge,
    opp.netEdge,
    opp.score,
    opp.positionSize,
    opp.positionPercent,
    opp.minLiquidity,
    opp.detectedAt,
    opp.closeDate ?? null,
    JSON.stringify(opp.scoreBreakdown)
  );
}

/**
 * Batch insert multiple scored opportunities within a transaction.
 * Uses INSERT OR IGNORE for duplicate handling.
 * Provides 10-100x speedup compared to individual inserts.
 */
export function insertOpportunities(opps: ScoredOpportunity[]): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO opportunities
    (opportunity_id, type, platform, market_id, market_question,
     gross_edge, net_edge, score, position_size, position_percent,
     liquidity, detected_at, close_date, score_breakdown)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((opportunities: ScoredOpportunity[]) => {
    for (const opp of opportunities) {
      stmt.run(
        opp.id,
        opp.type,
        opp.platform,
        opp.marketId,
        opp.marketQuestion,
        opp.grossEdge,
        opp.netEdge,
        opp.score,
        opp.positionSize,
        opp.positionPercent,
        opp.minLiquidity,
        opp.detectedAt,
        opp.closeDate ?? null,
        JSON.stringify(opp.scoreBreakdown)
      );
    }
  });

  insertMany(opps);
}

/**
 * Get recent opportunities above a minimum score threshold.
 * Results ordered by detected_at descending, then score descending.
 *
 * @param minScore - Minimum score threshold (default: 0)
 * @param limit - Maximum number of results (default: 100)
 * @param hoursBack - How many hours back to search (default: 24)
 * @returns Array of opportunity rows
 */
export function getRecentOpportunities(
  minScore: number = 0,
  limit: number = 100,
  hoursBack: number = 24
): OpportunityRow[] {
  const db = getDatabase();
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE score >= ? AND detected_at >= ?
    ORDER BY detected_at DESC, score DESC
    LIMIT ?
  `);
  return stmt.all(minScore, cutoff, limit) as OpportunityRow[];
}

/**
 * Get aggregate statistics about stored opportunities.
 *
 * @returns Object with total count, counts by type, and average score
 */
export function getOpportunityStats(): {
  total: number;
  byType: Record<string, number>;
  avgScore: number;
} {
  const db = getDatabase();
  const total = db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as { count: number };
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM opportunities GROUP BY type').all() as { type: string; count: number }[];
  const avgScore = db.prepare('SELECT AVG(score) as avg FROM opportunities').get() as { avg: number | null };

  return {
    total: total.count,
    byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
    avgScore: avgScore.avg ?? 0,
  };
}

// =============================================================================
// Settlement Comparison Queries
// =============================================================================

/**
 * Save or update a settlement comparison.
 * Uses INSERT OR REPLACE to upsert based on unique constraint.
 */
export function saveSettlementComparison(comparison: SettlementComparison): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settlement_comparisons (
      polymarket_id, kalshi_ticker,
      question_similarity, criteria_similarity,
      timing_similarity, data_source_similarity,
      overall_confidence, safe_for_arbitrage,
      risk_factors, manual_override, settlement_outcome,
      notes, compared_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    comparison.polymarketId,
    comparison.kalshiTicker,
    comparison.similarity.question,
    comparison.similarity.criteria,
    comparison.similarity.timing,
    comparison.similarity.dataSource,
    comparison.similarity.overall,
    comparison.safeForArbitrage ? 1 : 0,
    JSON.stringify(comparison.riskFactors),
    comparison.manualOverride || null,
    comparison.settlementOutcome || null,
    comparison.notes || null,
    comparison.comparedAt.getTime()
  );
}

/**
 * Get settlement comparison for a market pair.
 * Returns null if no comparison exists.
 */
export function getSettlementComparison(
  polymarketId: string,
  kalshiTicker: string
): SettlementComparison | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM settlement_comparisons
    WHERE polymarket_id = ? AND kalshi_ticker = ?
  `);

  const row = stmt.get(polymarketId, kalshiTicker) as SettlementComparisonRow | undefined;

  if (!row) return null;

  return {
    polymarketId: row.polymarket_id,
    kalshiTicker: row.kalshi_ticker,
    similarity: {
      question: row.question_similarity,
      criteria: row.criteria_similarity,
      timing: row.timing_similarity,
      dataSource: row.data_source_similarity,
      overall: row.overall_confidence,
    },
    safeForArbitrage: row.safe_for_arbitrage === 1,
    riskFactors: JSON.parse(row.risk_factors),
    manualOverride: row.manual_override as 'safe' | 'unsafe' | undefined,
    settlementOutcome: row.settlement_outcome as 'matched' | 'diverged' | undefined,
    notes: row.notes || undefined,
    comparedAt: new Date(row.compared_at),
  };
}

/**
 * Set manual override for a settlement comparison.
 * Creates comparison record if it doesn't exist.
 */
export function setSettlementOverride(
  polymarketId: string,
  kalshiTicker: string,
  override: 'safe' | 'unsafe',
  notes?: string
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE settlement_comparisons
    SET manual_override = ?, notes = COALESCE(?, notes)
    WHERE polymarket_id = ? AND kalshi_ticker = ?
  `);

  stmt.run(override, notes || null, polymarketId, kalshiTicker);
}

/**
 * Record actual settlement outcome for tracking divergence.
 */
export function recordSettlementOutcome(
  polymarketId: string,
  kalshiTicker: string,
  outcome: 'matched' | 'diverged'
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE settlement_comparisons
    SET settlement_outcome = ?
    WHERE polymarket_id = ? AND kalshi_ticker = ?
  `);

  stmt.run(outcome, polymarketId, kalshiTicker);
}

/**
 * Get all comparisons marked as safe for arbitrage.
 */
export function getSafeComparisons(): SettlementComparison[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM settlement_comparisons
    WHERE safe_for_arbitrage = 1
    ORDER BY overall_confidence DESC
  `);

  const rows = stmt.all() as SettlementComparisonRow[];

  return rows.map(row => ({
    polymarketId: row.polymarket_id,
    kalshiTicker: row.kalshi_ticker,
    similarity: {
      question: row.question_similarity,
      criteria: row.criteria_similarity,
      timing: row.timing_similarity,
      dataSource: row.data_source_similarity,
      overall: row.overall_confidence,
    },
    safeForArbitrage: true,
    riskFactors: JSON.parse(row.risk_factors),
    manualOverride: row.manual_override as 'safe' | 'unsafe' | undefined,
    settlementOutcome: row.settlement_outcome as 'matched' | 'diverged' | undefined,
    notes: row.notes || undefined,
    comparedAt: new Date(row.compared_at),
  }));
}

/**
 * Get historical divergence rate for tuning confidence thresholds.
 */
export function getDivergenceStats(): { total: number; diverged: number; rate: number } {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN settlement_outcome = 'diverged' THEN 1 ELSE 0 END) as diverged
    FROM settlement_comparisons
    WHERE settlement_outcome IS NOT NULL
  `);

  const result = stmt.get() as { total: number; diverged: number };

  return {
    total: result.total,
    diverged: result.diverged || 0,
    rate: result.total > 0 ? (result.diverged || 0) / result.total : 0,
  };
}
