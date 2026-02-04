/**
 * Metaculus question-to-market matcher
 *
 * Matches Metaculus forecasting questions to equivalent Polymarket/Kalshi markets
 * for divergence detection.
 *
 * @module services/metaculus-matcher
 */

import { compareTwoStrings } from 'string-similarity';
import type { MetaculusQuestion } from '../types/metaculus.js';
import type { Market } from '../types/market.js';
import { logger } from '../utils/logger.js';
import { readFileSync, existsSync } from 'fs';

const matcherLogger = logger.child({ component: 'metaculus-matcher' });

/**
 * Similarity scores for different matching dimensions
 */
interface SimilarityScores {
  title: number;
  description: number;
  timing: number;
  overall: number;
}

/**
 * Matched pair of Metaculus question and market
 */
export interface MetaculusMatchResult {
  metaculusQuestion: MetaculusQuestion;
  market: Market;
  confidence: number;
  similarity: SimilarityScores;
  method: 'exact_match' | 'high_similarity' | 'manual_curated';
}

/**
 * Manual match entry from curation file
 */
interface ManualMatch {
  metaculus_id: number;
  platform: 'polymarket' | 'kalshi';
  market_id: string;
  verified: boolean;
}

// Constants
const DEFAULT_MIN_CONFIDENCE = 0.8;
const TIMING_DECAY_DAYS = 14;
const DEFAULT_DESCRIPTION_SIMILARITY = 0.5;

// Similarity weights
const WEIGHT_TITLE = 0.5;
const WEIGHT_DESCRIPTION = 0.3;
const WEIGHT_TIMING = 0.2;

/**
 * MetaculusMatcher identifies equivalent events between Metaculus and prediction markets.
 *
 * Uses multi-level similarity scoring:
 * - Title similarity (50% weight)
 * - Description similarity (30% weight)
 * - Timing similarity (20% weight)
 *
 * Conservative 0.8 threshold prevents false positives.
 */
export class MetaculusMatcher {
  private manualMatches: ManualMatch[] = [];
  private minConfidence: number;

  constructor(manualMatchesPath?: string, minConfidence: number = DEFAULT_MIN_CONFIDENCE) {
    this.minConfidence = minConfidence;
    const matchPath = manualMatchesPath || 'src/data/metaculus-matches.json';
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
        matcherLogger.info({ count: this.manualMatches.length }, 'Loaded manual Metaculus matches');
      }
    } catch (error) {
      matcherLogger.warn({ path, error }, 'Failed to load manual Metaculus matches file');
    }
  }

  /**
   * Match Metaculus questions to markets
   *
   * @param questions - Metaculus questions to match
   * @param markets - Markets from Polymarket/Kalshi
   * @returns Array of matched pairs with confidence scores
   */
  matchToMarkets(questions: MetaculusQuestion[], markets: Market[]): MetaculusMatchResult[] {
    const matches: MetaculusMatchResult[] = [];

    if (!questions.length || !markets.length) {
      return matches;
    }

    // Filter to binary questions only
    const binaryQuestions = questions.filter((q) => q.type === 'binary');

    // Track which markets have been matched
    const matchedMarketIds = new Set<string>();

    for (const question of binaryQuestions) {
      // Check for manual match first
      const manualMatch = this.findManualMatch(question.id);

      if (manualMatch && manualMatch.verified) {
        const market = markets.find(
          (m) => m.platform === manualMatch.platform && m.id === manualMatch.market_id
        );

        if (market && !matchedMarketIds.has(market.id)) {
          matches.push({
            metaculusQuestion: question,
            market,
            confidence: 1.0,
            similarity: {
              title: 1.0,
              description: 1.0,
              timing: 1.0,
              overall: 1.0,
            },
            method: 'manual_curated',
          });

          matchedMarketIds.add(market.id);
          continue; // Skip algorithmic matching for this question
        }
      }

      // Algorithmic matching
      let bestMatch: MetaculusMatchResult | null = null;
      let bestConfidence = 0;

      for (const market of markets) {
        if (matchedMarketIds.has(market.id)) continue;

        const similarity = this.calculateSimilarity(question, market);

        if (similarity.overall >= this.minConfidence && similarity.overall > bestConfidence) {
          bestConfidence = similarity.overall;

          const method = similarity.title > 0.95 ? 'exact_match' : 'high_similarity';

          bestMatch = {
            metaculusQuestion: question,
            market,
            confidence: similarity.overall,
            similarity,
            method,
          };
        } else if (similarity.overall > 0 && similarity.overall < this.minConfidence) {
          // Log low-confidence matches for manual review
          matcherLogger.debug(
            {
              metaculusId: question.id,
              marketId: market.id,
              metaculusTitle: question.title.substring(0, 50),
              marketQuestion: market.question.substring(0, 50),
              confidence: similarity.overall,
            },
            'Low confidence match found - consider manual curation'
          );
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);
        matchedMarketIds.add(bestMatch.market.id);
      }
    }

    matcherLogger.info(
      {
        questionsCount: binaryQuestions.length,
        marketsCount: markets.length,
        matchCount: matches.length,
        manualMatches: matches.filter((m) => m.method === 'manual_curated').length,
        exactMatches: matches.filter((m) => m.method === 'exact_match').length,
        highSimilarityMatches: matches.filter((m) => m.method === 'high_similarity').length,
      },
      'Metaculus question matching complete'
    );

    return matches;
  }

  /**
   * Calculate similarity scores between question and market
   */
  private calculateSimilarity(
    question: MetaculusQuestion,
    market: Market
  ): SimilarityScores {
    // Title similarity
    const normalizedQuestionTitle = this.normalizeText(question.title);
    const normalizedMarketQuestion = this.normalizeText(market.question);
    const titleSimilarity = compareTwoStrings(normalizedQuestionTitle, normalizedMarketQuestion);

    // Description similarity
    // Markets typically don't have detailed descriptions, so we use a neutral default
    const descriptionSimilarity = DEFAULT_DESCRIPTION_SIMILARITY;

    // Timing similarity
    const timingSimilarity = this.compareTimings(
      new Date(question.resolve_time),
      new Date(market.closeDate)
    );

    // Reject matches with >14 day difference (timing similarity will be 0)
    if (timingSimilarity === 0) {
      return {
        title: titleSimilarity,
        description: descriptionSimilarity,
        timing: timingSimilarity,
        overall: 0,
      };
    }

    // Overall weighted confidence
    const overall =
      WEIGHT_TITLE * titleSimilarity +
      WEIGHT_DESCRIPTION * descriptionSimilarity +
      WEIGHT_TIMING * timingSimilarity;

    return {
      title: titleSimilarity,
      description: descriptionSimilarity,
      timing: timingSimilarity,
      overall,
    };
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Collapse whitespace
      .trim();
  }

  /**
   * Compare timings between two dates with linear decay
   *
   * Returns:
   * - 1.0 for same day
   * - 0.5 for 7 days apart
   * - 0.0 for 14+ days apart
   */
  private compareTimings(date1: Date, date2: Date): number {
    // Handle invalid dates
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return 0.0;
    }

    const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff >= TIMING_DECAY_DAYS) {
      return 0.0;
    }

    // Linear decay: 1.0 at 0 days, 0.0 at TIMING_DECAY_DAYS
    return 1.0 - daysDiff / TIMING_DECAY_DAYS;
  }

  /**
   * Find manual match for a Metaculus question
   */
  private findManualMatch(metaculusId: number): ManualMatch | undefined {
    return this.manualMatches.find((m) => m.metaculus_id === metaculusId);
  }
}
