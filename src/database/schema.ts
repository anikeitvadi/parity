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
