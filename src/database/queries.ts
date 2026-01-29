import { getDatabase } from './schema.js';

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
