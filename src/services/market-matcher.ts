/**
 * Cross-platform market matching algorithm
 *
 * Identifies equivalent events across Polymarket and Kalshi platforms.
 *
 * @module services/market-matcher
 */

import type { Market } from '../types/market.js';
import { logger } from '../utils/logger.js';
import { readFileSync, existsSync } from 'fs';

/**
 * Matched pair of markets across platforms
 */
export interface MatchedPair {
  polymarket: Market;
  kalshi: Market;
  confidence: number;
  method: 'exact_match' | 'keyword_match' | 'manual_curated';
}

/**
 * Manual match entry from curation file
 */
interface ManualMatch {
  polymarket_id: string;
  kalshi_ticker: string;
  verified: boolean;
}

// Common stop words to filter from keyword extraction
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after',
  'will', 'be', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'done',
  'this', 'that', 'these', 'those', 'it', 'its',
  'what', 'which', 'who', 'whom', 'whose',
]);

/**
 * MarketMatcher identifies equivalent events across prediction market platforms.
 *
 * Phase 1 approach: exact text matching + manual curation
 * Phase 2 will add: fuzzy matching, LLM-based semantic matching
 */
export class MarketMatcher {
  private manualMatches: ManualMatch[] = [];
  private minConfidence: number;

  constructor(manualMatchesPath?: string, minConfidence: number = 0.7) {
    this.minConfidence = minConfidence;
    const matchPath = manualMatchesPath || 'src/data/manual-matches.json';
    this.loadManualMatches(matchPath);
  }

  /**
   * Load manual match curation file
   */
  private loadManualMatches(path: string): void {
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        this.manualMatches = JSON.parse(content);
        logger.info({ count: this.manualMatches.length }, 'Loaded manual matches');
      }
    } catch (error) {
      logger.warn({ path, error }, 'Failed to load manual matches file');
    }
  }

  /**
   * Match markets from Polymarket and Kalshi
   *
   * @param polymarkets - Markets from Polymarket
   * @param kalshiMarkets - Markets from Kalshi
   * @returns Array of matched pairs with confidence scores
   */
  matchMarkets(polymarkets: Market[], kalshiMarkets: Market[]): MatchedPair[] {
    const matches: MatchedPair[] = [];

    if (!polymarkets.length || !kalshiMarkets.length) {
      return matches;
    }

    // First, apply manual matches
    for (const manual of this.manualMatches) {
      if (!manual.verified) continue;

      const poly = polymarkets.find((m) => m.id === manual.polymarket_id);
      const kalshi = kalshiMarkets.find((m) => m.id === manual.kalshi_ticker);

      if (poly && kalshi) {
        matches.push({
          polymarket: poly,
          kalshi,
          confidence: 1.0,
          method: 'manual_curated',
        });
      }
    }

    // Get IDs of already matched markets
    const matchedPolyIds = new Set(matches.map((m) => m.polymarket.id));
    const matchedKalshiIds = new Set(matches.map((m) => m.kalshi.id));

    // Algorithm matching for remaining markets
    for (const poly of polymarkets) {
      if (matchedPolyIds.has(poly.id)) continue;

      for (const kalshi of kalshiMarkets) {
        if (matchedKalshiIds.has(kalshi.id)) continue;

        // Check compatibility first
        if (!this.isCompatible(poly, kalshi)) continue;

        const confidence = this.calculateConfidence(poly, kalshi);

        if (confidence >= this.minConfidence) {
          matches.push({
            polymarket: poly,
            kalshi,
            confidence,
            method: confidence === 1.0 ? 'exact_match' : 'keyword_match',
          });

          matchedKalshiIds.add(kalshi.id);
          break; // Move to next Polymarket market
        }
      }
    }

    return matches;
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  /**
   * Extract keywords from text (filter stop words)
   */
  private extractKeywords(text: string): string[] {
    const normalized = this.normalizeText(text);
    return normalized
      .split(' ')
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  }

  /**
   * Calculate match confidence between two markets
   */
  private calculateConfidence(poly: Market, kalshi: Market): number {
    const polyNorm = this.normalizeText(poly.question);
    const kalshiNorm = this.normalizeText(kalshi.question);

    // Exact match
    if (polyNorm === kalshiNorm) {
      return 1.0;
    }

    // Keyword overlap
    const polyKeywords = new Set(this.extractKeywords(poly.question));
    const kalshiKeywords = new Set(this.extractKeywords(kalshi.question));

    if (polyKeywords.size === 0 || kalshiKeywords.size === 0) {
      return 0.0;
    }

    // Calculate Jaccard similarity
    const intersection = [...polyKeywords].filter((k) => kalshiKeywords.has(k));
    const union = new Set([...polyKeywords, ...kalshiKeywords]);
    const jaccard = intersection.length / union.size;

    // Require at least 50% keyword overlap to consider it a potential match
    // This prevents matching markets that just share a few common words
    if (jaccard < 0.5) {
      return 0.0;
    }

    // Scale to 0.7-0.9 range for keyword matches
    // jaccard 0.5 -> 0.7, jaccard 1.0 -> 0.9
    return 0.7 + (jaccard - 0.5) * 0.4;
  }

  /**
   * Check if two markets are compatible for matching
   */
  private isCompatible(poly: Market, kalshi: Market): boolean {
    // Same number of outcomes
    if (poly.outcomes.length !== kalshi.outcomes.length) {
      return false;
    }

    // Resolution timeframe within 7 days
    if (poly.closeDate && kalshi.closeDate) {
      const polyDate = new Date(poly.closeDate);
      const kalshiDate = new Date(kalshi.closeDate);

      // Skip if dates are invalid
      if (isNaN(polyDate.getTime()) || isNaN(kalshiDate.getTime())) {
        return true; // Allow matching if dates unparseable
      }

      const daysDiff = Math.abs(polyDate.getTime() - kalshiDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 7) {
        return false;
      }
    }

    return true;
  }
}
