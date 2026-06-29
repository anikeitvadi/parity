/**
 * Persistent verification-verdict cache (SQLite-backed).
 *
 * LLM verification is the quota-constrained step (gpt-4o-mini is capped at
 * 10k requests/day). Caching every market-level verdict makes a run RESUMABLE:
 * if the daily quota runs out mid-run, the next run skips everything already
 * decided and only spends quota on the remainder. Verdicts are keyed by the
 * exact inputs that determined them — Polymarket market, its candidate set,
 * verifier model, and prompt version — so any change correctly misses the cache.
 *
 * @module services/verdict-cache
 */

import crypto from 'crypto';
import type { Database } from 'better-sqlite3';

/** The result of verifying one Polymarket market against its Kalshi candidates. */
export interface MarketVerdict {
  matchedKalshiId: string | null; // chosen candidate id, or null = no match
  sameEvent: boolean;
  sameCriteria: boolean;
  yesAligned: boolean;
  reason: string;
}

export function ensureVerdictTable(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS verdict_cache (
       key TEXT PRIMARY KEY,
       poly_id TEXT NOT NULL,
       matched_kalshi_id TEXT,
       same_event INTEGER NOT NULL,
       same_criteria INTEGER NOT NULL,
       yes_aligned INTEGER NOT NULL,
       reason TEXT,
       verifier_provider TEXT NOT NULL DEFAULT 'openai',
       verifier_model TEXT NOT NULL,
       prompt_version TEXT NOT NULL,
       schema_version INTEGER NOT NULL DEFAULT 1
     )`
  );
  // Migrate pre-existing tables (provider + schema_version were added later).
  for (const col of ["verifier_provider TEXT NOT NULL DEFAULT 'openai'", 'schema_version INTEGER NOT NULL DEFAULT 1']) {
    try { db.exec(`ALTER TABLE verdict_cache ADD COLUMN ${col}`); } catch { /* column already exists */ }
  }
}

/**
 * Cache key = sha256 over (promptVersion, model, polyId, polyTextHash, and each
 * candidate's id+textHash, order-independent). A changed market text, candidate
 * set, model, or prompt invalidates the entry.
 */
export function verdictKey(input: {
  schemaVersion: number;
  promptVersion: string;
  provider: string;
  model: string;
  polyId: string;
  polyText: string;
  candidates: { id: string; text: string }[];
}): string {
  const h = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  const cands = input.candidates
    .map((c) => `${c.id}:${h(c.text)}`)
    .sort()
    .join('|');
  return crypto
    .createHash('sha256')
    .update(
      [String(input.schemaVersion), input.promptVersion, input.provider, input.model, input.polyId, h(input.polyText), cands].join('␟')
    )
    .digest('hex');
}

export function getVerdict(db: Database, key: string): MarketVerdict | undefined {
  const row = db
    .prepare('SELECT matched_kalshi_id, same_event, same_criteria, yes_aligned, reason FROM verdict_cache WHERE key = ?')
    .get(key) as
    | { matched_kalshi_id: string | null; same_event: number; same_criteria: number; yes_aligned: number; reason: string }
    | undefined;
  if (!row) return undefined;
  return {
    matchedKalshiId: row.matched_kalshi_id,
    sameEvent: !!row.same_event,
    sameCriteria: !!row.same_criteria,
    yesAligned: !!row.yes_aligned,
    reason: row.reason ?? '',
  };
}

export function putVerdict(
  db: Database,
  key: string,
  polyId: string,
  v: MarketVerdict,
  provider: string,
  model: string,
  promptVersion: string,
  schemaVersion: number
): void {
  db.prepare(
    `INSERT OR REPLACE INTO verdict_cache
       (key, poly_id, matched_kalshi_id, same_event, same_criteria, yes_aligned, reason, verifier_provider, verifier_model, prompt_version, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    key,
    polyId,
    v.matchedKalshiId,
    v.sameEvent ? 1 : 0,
    v.sameCriteria ? 1 : 0,
    v.yesAligned ? 1 : 0,
    v.reason,
    provider,
    model,
    promptVersion,
    schemaVersion
  );
}

/** How many verdicts are already cached for a given provider + model + prompt + schema version. */
export function countVerdicts(db: Database, provider: string, model: string, promptVersion: string, schemaVersion: number): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS n FROM verdict_cache WHERE verifier_provider = ? AND verifier_model = ? AND prompt_version = ? AND schema_version = ?'
    )
    .get(provider, model, promptVersion, schemaVersion) as { n: number };
  return row.n;
}

/** Distinct (provider, model) pairs cached for a prompt+schema version — guards against a silently mixed-model corpus. */
export function verdictProvenance(
  db: Database,
  promptVersion: string,
  schemaVersion: number
): { provider: string; model: string; n: number }[] {
  return db
    .prepare(
      `SELECT verifier_provider AS provider, verifier_model AS model, COUNT(*) AS n
         FROM verdict_cache WHERE prompt_version = ? AND schema_version = ?
        GROUP BY verifier_provider, verifier_model ORDER BY n DESC`
    )
    .all(promptVersion, schemaVersion) as { provider: string; model: string; n: number }[];
}
