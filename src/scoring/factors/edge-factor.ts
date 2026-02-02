/**
 * Edge Size Scoring Factor
 *
 * Scores opportunities based on net edge percentage.
 *
 * Requirement: RATE-02
 *
 * Scoring thresholds (based on research):
 * - <5% net edge: 1-2 (below threshold)
 * - 5-7% net edge: 3-4 (marginal)
 * - 7-10% net edge: 5-6 (decent)
 * - 10-15% net edge: 7-8 (good)
 * - 15-20% net edge: 9 (excellent)
 * - >20% net edge: 10 (exceptional)
 *
 * @module scoring/factors/edge-factor
 */

/**
 * Calculate edge size score from net edge percentage
 *
 * This is a pure function with no side effects.
 *
 * @param netEdge - Net edge as decimal (0-1 scale, e.g., 0.10 = 10%)
 * @returns Score from 1-10
 *
 * @example
 * ```typescript
 * calculateEdgeScore(0.12); // Returns 7-8 (good)
 * calculateEdgeScore(0.03); // Returns 1-2 (below threshold)
 * calculateEdgeScore(0.25); // Returns 10 (exceptional)
 * ```
 */
export function calculateEdgeScore(netEdge: number): number {
  // Convert to percentage for threshold comparison
  const edgePercent = netEdge * 100;

  // Handle edge cases
  if (edgePercent <= 0) {
    return 1;
  }

  // Score based on edge thresholds
  // <5%: 1-2 (below threshold, linear interpolation 0-5% -> 1-2)
  if (edgePercent < 5) {
    return 1 + (edgePercent / 5);
  }

  // 5-7%: 3-4 (marginal)
  if (edgePercent < 7) {
    return 3 + ((edgePercent - 5) / 2);
  }

  // 7-10%: 5-6 (decent)
  if (edgePercent < 10) {
    return 5 + ((edgePercent - 7) / 3);
  }

  // 10-15%: 7-8 (good)
  if (edgePercent < 15) {
    return 7 + ((edgePercent - 10) / 5);
  }

  // 15-20%: 9 (excellent)
  if (edgePercent < 20) {
    return 9;
  }

  // >20%: 10 (exceptional)
  return 10;
}
