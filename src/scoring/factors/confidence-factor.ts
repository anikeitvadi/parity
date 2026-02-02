/**
 * Confidence Scoring Factor
 *
 * Scores opportunities based on detector confidence.
 *
 * Requirement: RATE-03
 *
 * Scoring logic:
 * - Single-platform: detector confidence * 10
 * - Cross-platform: (detector confidence * match confidence) * 10
 *
 * @module scoring/factors/confidence-factor
 */

/**
 * Calculate confidence score
 *
 * For single-platform opportunities, the score is detector confidence * 10.
 * For cross-platform opportunities, the effective confidence is
 * (detector * match) to account for both detection and matching uncertainty.
 *
 * This is a pure function with no side effects.
 *
 * @param detectorConfidence - Detector confidence (0-1 scale)
 * @param matchConfidence - Match confidence for cross-platform (0-1 scale, optional)
 * @returns Score from 0-10
 *
 * @example
 * ```typescript
 * calculateConfidenceScore(0.9);       // Returns 9 (single-platform)
 * calculateConfidenceScore(0.8, 0.9);  // Returns 7.2 (cross-platform: 0.8 * 0.9 * 10)
 * ```
 */
export function calculateConfidenceScore(
  detectorConfidence: number,
  matchConfidence?: number
): number {
  // Handle edge cases
  if (detectorConfidence <= 0) {
    return 0;
  }

  // Calculate effective confidence
  let effectiveConfidence: number;

  if (matchConfidence !== undefined && matchConfidence !== null) {
    // Cross-platform: multiply confidences
    effectiveConfidence = detectorConfidence * matchConfidence;
  } else {
    // Single-platform: use detector confidence directly
    effectiveConfidence = detectorConfidence;
  }

  // Scale to 0-10 and cap at 10
  const score = effectiveConfidence * 10;
  return Math.min(score, 10);
}
