/**
 * Settlement Comparator Service
 *
 * Compares settlement rules between cross-platform matched markets.
 * Provides multi-level similarity scoring and safety determination.
 *
 * @module services/settlement-comparator
 */

import { compareTwoStrings } from 'string-similarity';
import { getSettlementComparison } from '../database/queries.js';
import type { SettlementCriteria, SettlementComparison, SimilarityScores } from '../types/settlement.js';

/** Similarity scoring weights (must sum to 1.0) */
const WEIGHTS = {
  question: 0.3,
  criteria: 0.4,
  timing: 0.2,
  dataSource: 0.1,
} as const;

/** Conservative safety thresholds for Phase 3.1 */
const SAFETY_THRESHOLDS = {
  overall: 0.9,
  criteria: 0.7,
  timing: 0.5,
} as const;

/** Risk detection thresholds */
const RISK_THRESHOLDS = {
  /** Maximum date difference in days before flagging as risk */
  maxDateDiffDays: 7,
  /** Minimum data source similarity to avoid flagging as different */
  minDataSourceSimilarity: 0.8,
} as const;

/** Subjective keywords that indicate resolution ambiguity */
const SUBJECTIVE_KEYWORDS = [
  'reasonable',
  'consensus',
  'mainstream',
  'general',
  'widely',
  'common',
  'typical',
  'standard',
  'normal',
  'appropriate',
  'significant',
  'substantial',
];

/**
 * Settlement Comparator Service
 *
 * Compares settlement rules between matched markets to determine
 * if they're safe for cross-platform arbitrage.
 */
export class SettlementComparator {
  /**
   * Compare two settlement criteria and determine safety.
   *
   * @param polymarket - Polymarket settlement criteria
   * @param kalshi - Kalshi settlement criteria
   * @returns Complete settlement comparison with safety determination
   */
  compare(polymarket: SettlementCriteria, kalshi: SettlementCriteria): SettlementComparison {
    // Check for manual override first (optimization)
    const existing = getSettlementComparison(polymarket.marketId, kalshi.marketId);
    const manualOverride = existing?.manualOverride;

    // Calculate similarity scores
    const similarity = this.calculateSimilarity(polymarket, kalshi);

    // Detect risk factors
    const riskFactors = this.detectRiskFactors(polymarket, kalshi);

    // Determine safety (manual override takes precedence)
    let safeForArbitrage: boolean;
    if (manualOverride === 'safe') {
      safeForArbitrage = true;
    } else if (manualOverride === 'unsafe') {
      safeForArbitrage = false;
    } else {
      safeForArbitrage = this.isSafeForArbitrage(similarity, riskFactors);
    }

    return {
      polymarketId: polymarket.marketId,
      kalshiTicker: kalshi.marketId,
      similarity,
      safeForArbitrage,
      riskFactors,
      manualOverride,
      comparedAt: new Date(),
    };
  }

  /**
   * Calculate multi-level similarity scores.
   */
  private calculateSimilarity(
    polymarket: SettlementCriteria,
    kalshi: SettlementCriteria
  ): SimilarityScores {
    // Question similarity using Dice coefficient
    const questionScore = this.textSimilarity(polymarket.question, kalshi.question);

    // Criteria similarity using Dice coefficient
    const criteriaScore = this.textSimilarity(polymarket.primaryRule, kalshi.primaryRule);

    // Timing similarity based on date proximity
    const timingScore = this.timingSimilarity(
      polymarket.resolutionDate,
      kalshi.resolutionDate
    );

    // Data source similarity
    const dataSourceScore = this.dataSourceSimilarity(
      polymarket.dataSource,
      kalshi.dataSource
    );

    // Overall weighted average
    const overall =
      questionScore * WEIGHTS.question +
      criteriaScore * WEIGHTS.criteria +
      timingScore * WEIGHTS.timing +
      dataSourceScore * WEIGHTS.dataSource;

    return {
      question: questionScore,
      criteria: criteriaScore,
      timing: timingScore,
      dataSource: dataSourceScore,
      overall,
    };
  }

  /**
   * Calculate text similarity using Dice coefficient (0-1).
   */
  private textSimilarity(text1: string, text2: string): number {
    const normalized1 = this.normalizeText(text1);
    const normalized2 = this.normalizeText(text2);
    return compareTwoStrings(normalized1, normalized2);
  }

  /**
   * Normalize text for comparison (lowercase, trim).
   */
  private normalizeText(text: string): string {
    return text.toLowerCase().trim();
  }

  /**
   * Calculate timing similarity based on date proximity.
   *
   * Formula: max(0, 1 - daysDiff/14)
   * - 0 days difference = 1.0
   * - 7 days difference = 0.5
   * - 14+ days difference = 0.0
   */
  private timingSimilarity(date1: Date | undefined, date2: Date | undefined): number {
    if (!date1 || !date2) {
      return 0;
    }

    const daysDiff = this.calculateDaysDifference(date1, date2);
    return Math.max(0, 1 - daysDiff / 14);
  }

  /**
   * Calculate absolute difference between two dates in days.
   */
  private calculateDaysDifference(date1: Date, date2: Date): number {
    return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Calculate data source similarity.
   */
  private dataSourceSimilarity(source1: string | undefined, source2: string | undefined): number {
    if (!source1 || !source2) {
      return 0;
    }

    return this.textSimilarity(source1, source2);
  }

  /**
   * Detect risk factors in the comparison.
   */
  private detectRiskFactors(
    polymarket: SettlementCriteria,
    kalshi: SettlementCriteria
  ): string[] {
    const risks: string[] = [];

    // Missing resolution date
    if (!polymarket.resolutionDate || !kalshi.resolutionDate) {
      risks.push('Missing resolution date');
    }

    // Dates differ by more than threshold
    if (polymarket.resolutionDate && kalshi.resolutionDate) {
      const daysDiff = this.calculateDaysDifference(
        polymarket.resolutionDate,
        kalshi.resolutionDate
      );

      if (daysDiff > RISK_THRESHOLDS.maxDateDiffDays) {
        risks.push(`Resolution dates differ by ${Math.round(daysDiff)} days`);
      }
    }

    // Different data sources (if both present and different)
    if (
      polymarket.dataSource &&
      kalshi.dataSource &&
      this.textSimilarity(polymarket.dataSource, kalshi.dataSource) <
        RISK_THRESHOLDS.minDataSourceSimilarity
    ) {
      risks.push('Different data sources');
    }

    // Subjective criteria detected
    const subjectiveWords = this.detectSubjectiveKeywords(
      polymarket.primaryRule + ' ' + kalshi.primaryRule
    );
    if (subjectiveWords.length > 0) {
      risks.push(`Subjective criteria detected: ${subjectiveWords.join(', ')}`);
    }

    return risks;
  }

  /**
   * Detect subjective keywords in text.
   */
  private detectSubjectiveKeywords(text: string): string[] {
    const normalized = text.toLowerCase();
    const found: string[] = [];

    for (const keyword of SUBJECTIVE_KEYWORDS) {
      if (normalized.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Determine if comparison is safe for arbitrage.
   *
   * Safety requires:
   * - overall >= 0.9
   * - criteria >= 0.7
   * - timing >= 0.5
   * - no risk factors
   */
  private isSafeForArbitrage(similarity: SimilarityScores, riskFactors: string[]): boolean {
    return (
      similarity.overall >= SAFETY_THRESHOLDS.overall &&
      similarity.criteria >= SAFETY_THRESHOLDS.criteria &&
      similarity.timing >= SAFETY_THRESHOLDS.timing &&
      riskFactors.length === 0
    );
  }
}
