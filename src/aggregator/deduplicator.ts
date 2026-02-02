/**
 * Opportunity Deduplicator
 *
 * Hash-based deduplication to prevent alert fatigue.
 * Same opportunity (market+type) within configurable window is considered duplicate.
 *
 * @module aggregator/deduplicator
 */

import { createHash } from 'crypto';
import { UnifiedOpportunity } from '../scoring/types.js';

/**
 * Entry tracking a seen opportunity
 */
interface SeenEntry {
  /** Short hash of the opportunity key */
  hash: string;
  /** First time this opportunity was seen (ms) */
  firstSeen: number;
  /** Most recent time this opportunity was seen (ms) */
  lastSeen: number;
  /** Highest score observed for this opportunity */
  highestScore: number;
}

/**
 * Deduplication statistics
 */
export interface DedupStats {
  /** Total entries currently tracked */
  total: number;
  /** Timestamp of oldest entry (ms) or null if empty */
  oldest: number | null;
}

/**
 * Opportunity Deduplicator
 *
 * Tracks seen opportunities by hash to prevent duplicate alerts.
 * Uses a configurable time window (default 4 hours) for deduplication.
 *
 * Hash key: type:platform:marketId
 * - Ignores edge values (price may change)
 * - Same market with same opportunity type = duplicate
 *
 * @example
 * ```typescript
 * const dedup = new OpportunityDeduplicator(4); // 4-hour window
 *
 * // First time seeing opportunity
 * dedup.isDuplicate(opp); // false
 * dedup.record(opp, 8.5);
 *
 * // Same opportunity again within 4 hours
 * dedup.isDuplicate(opp); // true
 *
 * // After 4+ hours
 * dedup.isDuplicate(opp); // false (window expired)
 * ```
 */
export class OpportunityDeduplicator {
  /** Map of hash -> entry tracking seen opportunities */
  private seen = new Map<string, SeenEntry>();
  /** Deduplication window in milliseconds */
  private dedupWindowMs: number;

  /**
   * Create a new deduplicator
   *
   * @param dedupWindowHours - Time window for deduplication (default: 4 hours)
   */
  constructor(dedupWindowHours: number = 4) {
    this.dedupWindowMs = dedupWindowHours * 60 * 60 * 1000;
  }

  /**
   * Generate hash key for an opportunity
   *
   * Key format: type:platform:marketId
   * Uses MD5 for fast hashing, truncated to 12 chars
   *
   * @param opp - Opportunity to hash
   * @returns 12-character hex hash
   */
  private hashOpportunity(opp: UnifiedOpportunity): string {
    // Hash on market identity + type, not edge values (prices fluctuate)
    const key = `${opp.type}:${opp.platform}:${opp.marketId}`;
    return createHash('md5').update(key).digest('hex').slice(0, 12);
  }

  /**
   * Check if opportunity is a duplicate (seen within window)
   *
   * @param opp - Opportunity to check
   * @returns true if duplicate, false if new or window expired
   */
  isDuplicate(opp: UnifiedOpportunity): boolean {
    const hash = this.hashOpportunity(opp);
    const existing = this.seen.get(hash);

    if (!existing) {
      return false;
    }

    // Check if still within dedup window
    return Date.now() - existing.firstSeen < this.dedupWindowMs;
  }

  /**
   * Record an opportunity as seen
   *
   * If already tracked, updates lastSeen and highestScore.
   * Otherwise creates new entry.
   *
   * @param opp - Opportunity to record
   * @param score - Score for this opportunity (used for highest tracking)
   */
  record(opp: UnifiedOpportunity, score: number): void {
    const hash = this.hashOpportunity(opp);
    const existing = this.seen.get(hash);
    const now = Date.now();

    if (existing) {
      existing.lastSeen = now;
      existing.highestScore = Math.max(existing.highestScore, score);
    } else {
      this.seen.set(hash, {
        hash,
        firstSeen: now,
        lastSeen: now,
        highestScore: score,
      });
    }
  }

  /**
   * Remove expired entries from tracking
   *
   * Should be called periodically to prevent memory growth.
   * Entries older than dedupWindow are removed.
   */
  prune(): void {
    const now = Date.now();
    for (const [hash, entry] of this.seen) {
      if (now - entry.firstSeen > this.dedupWindowMs) {
        this.seen.delete(hash);
      }
    }
  }

  /**
   * Get deduplication statistics
   *
   * @returns Stats including total tracked and oldest entry timestamp
   */
  getStats(): DedupStats {
    let oldest: number | null = null;

    for (const entry of this.seen.values()) {
      if (oldest === null || entry.firstSeen < oldest) {
        oldest = entry.firstSeen;
      }
    }

    return { total: this.seen.size, oldest };
  }

  /**
   * Get highest score recorded for an opportunity
   *
   * Useful for checking if current opportunity has better score than before.
   *
   * @param opp - Opportunity to look up
   * @returns Highest score recorded, or null if not tracked
   */
  getHighestScore(opp: UnifiedOpportunity): number | null {
    const hash = this.hashOpportunity(opp);
    const existing = this.seen.get(hash);
    return existing ? existing.highestScore : null;
  }

  /**
   * Clear all tracked entries
   *
   * Primarily useful for testing.
   */
  clear(): void {
    this.seen.clear();
  }

  /**
   * Get the configured deduplication window in hours
   */
  getWindowHours(): number {
    return this.dedupWindowMs / (60 * 60 * 1000);
  }
}
