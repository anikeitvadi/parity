/**
 * Brier Score — measures probabilistic forecast accuracy.
 *
 * BS = (forecast - outcome)²
 * 0.0 = perfect prediction, 1.0 = worst possible.
 *
 * Used by the calibration coach to track user prediction accuracy
 * and identify systematic overconfidence or underconfidence.
 *
 * @module scoring/brier
 */

/**
 * Calculate the Brier Score for a single binary forecast.
 *
 * @param forecastProb - User's predicted probability (0.0 to 1.0)
 * @param outcomeOccurred - Whether the event actually happened
 * @returns Score from 0 (perfect) to 1 (entirely wrong)
 */
export function calculateBrierScore(forecastProb: number, outcomeOccurred: boolean): number {
  const outcome = outcomeOccurred ? 1 : 0;
  return (forecastProb - outcome) ** 2;
}

/**
 * Calculate the mean Brier Score across multiple forecasts.
 *
 * @param forecasts - Array of { probability, occurred } pairs
 * @returns Mean Brier Score (0 = perfect calibration)
 */
export function meanBrierScore(
  forecasts: { probability: number; occurred: boolean }[]
): number {
  if (forecasts.length === 0) return 0;
  const total = forecasts.reduce(
    (sum, f) => sum + calculateBrierScore(f.probability, f.occurred),
    0
  );
  return total / forecasts.length;
}

/**
 * Assess calibration quality from a Brier Score.
 *
 * @param score - Mean Brier Score
 * @returns Human-readable assessment
 */
export function assessCalibration(score: number): string {
  if (score <= 0.1) return 'Excellent — your forecasts are highly accurate';
  if (score <= 0.2) return 'Good — better than chance, room to improve';
  if (score <= 0.25) return 'Average — roughly equivalent to always guessing 50%';
  return 'Poor — your confidence levels need recalibration';
}
