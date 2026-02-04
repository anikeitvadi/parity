import Database from 'better-sqlite3';

let db: Database.Database | null = null;

/**
 * Initialize SQLite database with WAL mode enabled for concurrent reads during writes.
 * Creates market_snapshots table with indexes for efficient querying.
 */
export function initDatabase(dbPath: string = 'markets.db'): Database.Database {
  // Close existing connection if any
  if (db) {
    db.close();
  }

  db = new Database(dbPath);

  // Enable WAL mode for concurrent reads during writes
  // Note: In-memory databases (:memory:) will show 'memory' mode instead of 'wal'
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  // Create schema with INTEGER timestamps for performance
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      market_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      data TEXT NOT NULL,
      UNIQUE(platform, market_id, timestamp)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time
      ON market_snapshots(platform, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_snapshots_market
      ON market_snapshots(market_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS matched_markets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      polymarket_id TEXT NOT NULL,
      kalshi_ticker TEXT NOT NULL,
      confidence REAL NOT NULL,
      method TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      UNIQUE(polymarket_id, kalshi_ticker)
    );

    CREATE INDEX IF NOT EXISTS idx_matched_markets_timestamp
      ON matched_markets(timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_matched_markets_confidence
      ON matched_markets(confidence DESC);

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id TEXT NOT NULL,
      type TEXT NOT NULL,
      platform TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_question TEXT NOT NULL,
      gross_edge REAL NOT NULL,
      net_edge REAL NOT NULL,
      score REAL NOT NULL,
      position_size REAL NOT NULL,
      position_percent REAL NOT NULL,
      liquidity REAL NOT NULL,
      detected_at INTEGER NOT NULL,
      close_date TEXT,
      score_breakdown TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(opportunity_id, detected_at)
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_detected
    ON opportunities(detected_at DESC);

    CREATE INDEX IF NOT EXISTS idx_opportunities_score
    ON opportunities(score DESC);

    CREATE INDEX IF NOT EXISTS idx_opportunities_type
    ON opportunities(type);

    CREATE TABLE IF NOT EXISTS settlement_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      polymarket_id TEXT NOT NULL,
      kalshi_ticker TEXT NOT NULL,
      question_similarity REAL NOT NULL,
      criteria_similarity REAL NOT NULL,
      timing_similarity REAL NOT NULL,
      data_source_similarity REAL NOT NULL,
      overall_confidence REAL NOT NULL,
      safe_for_arbitrage INTEGER NOT NULL DEFAULT 0,
      risk_factors TEXT NOT NULL DEFAULT '[]',
      manual_override TEXT,
      settlement_outcome TEXT,
      notes TEXT,
      compared_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(polymarket_id, kalshi_ticker)
    );

    CREATE INDEX IF NOT EXISTS idx_settlement_comparisons_markets
      ON settlement_comparisons(polymarket_id, kalshi_ticker);

    CREATE INDEX IF NOT EXISTS idx_settlement_comparisons_confidence
      ON settlement_comparisons(overall_confidence DESC);

    CREATE INDEX IF NOT EXISTS idx_settlement_comparisons_safe
      ON settlement_comparisons(safe_for_arbitrage);
  `);

  return db;
}

/**
 * Get the current database instance.
 * Throws if database has not been initialized.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection and clean up resources.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
