/**
 * Fee-Adjusted Profit Scoring Factor
 *
 * Scores opportunities based on net edge (profit after fees).
 *
 * Requirement: RATE-06
 *
 * Scoring logic:
 * - Score = min(netEdge * 100, 10)
 * - This maps 10% net edge to score 10 (max)
 * - Lower edges get proportionally lower scores
 *
 * Note: The minimum threshold ($0.05 / 5% net edge) is enforced
 * in the composite scorer, not here. This factor just calculates
 * the score for any net edge value.
 *
 * @module scoring/factors/fee-factor
 */

/**
 * Calculate fee-adjusted profit score from net edge
 *
 * The score is simply the net edge percentage, capped at 10.
 * This provides a linear relationship between profit potential and score.
 *
 * This is a pure function with no side effects.
 *
 * @param netEdge - Net edge as decimal (0-1 scale, e.g., 0.10 = 10%)
 * @returns Score from 0-10
 *
 * @example
 * ```typescript
 * calculateProfitScore(0.10); // Returns 10 (10% edge = max score)
 * calculateProfitScore(0.05); // Returns 5
 * calculateProfitScore(0.15); // Returns 10 (capped)
 * ```
 */
export function calculateProfitScore(netEdge: number): number {
  // Handle edge cases
  if (netEdge <= 0) {
    return 0;
  }

  // Calculate score: netEdge * 100, capped at 10
  const score = netEdge * 100;
  return Math.min(score, 10);
}
