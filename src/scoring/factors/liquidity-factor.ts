/**
 * Liquidity Scoring Factor
 *
 * Scores opportunities based on available liquidity in USD.
 *
 * Requirement: RATE-04
 *
 * Scoring thresholds:
 * - <$500: 0 (below minimum threshold)
 * - $500-1000: 3
 * - $1000-5000: 5
 * - $5000-10000: 7
 * - $10000-50000: 9
 * - >$50000: 10
 *
 * @module scoring/factors/liquidity-factor
 */

/**
 * Calculate liquidity score from USD liquidity amount
 *
 * This is a pure function with no side effects.
 *
 * @param liquidityUsd - Minimum liquidity available in USD
 * @returns Score from 0-10
 *
 * @example
 * ```typescript
 * calculateLiquidityScore(5000);   // Returns 7
 * calculateLiquidityScore(400);    // Returns 0 (below threshold)
 * calculateLiquidityScore(100000); // Returns 10
 * ```
 */
export function calculateLiquidityScore(liquidityUsd: number): number {
  // Handle edge cases
  if (liquidityUsd < 0) {
    return 0;
  }

  // <$500: 0 (below minimum)
  if (liquidityUsd < 500) {
    return 0;
  }

  // $500-1000: 3
  if (liquidityUsd < 1000) {
    return 3;
  }

  // $1000-5000: 5
  if (liquidityUsd < 5000) {
    return 5;
  }

  // $5000-10000: 7
  if (liquidityUsd < 10000) {
    return 7;
  }

  // $10000-50000: 9
  if (liquidityUsd < 50000) {
    return 9;
  }

  // >$50000: 10
  return 10;
}
