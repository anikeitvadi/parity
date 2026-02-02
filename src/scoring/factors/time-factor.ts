/**
 * Time to Resolution Scoring Factor
 *
 * Scores opportunities based on time until market close/resolution.
 *
 * Requirement: RATE-05
 *
 * Scoring thresholds:
 * - <1 day: 10 (urgent)
 * - 1-3 days: 8
 * - 3-7 days: 6
 * - 7-30 days: 4
 * - >30 days: 2 (long-term)
 * - No date: 5 (neutral)
 *
 * @module scoring/factors/time-factor
 */

// Time constants in milliseconds
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Calculate time to resolution score
 *
 * Shorter time to resolution scores higher (more urgent = act faster).
 * Markets with past close dates are treated as maximally urgent (10).
 * Markets with no close date get a neutral score (5).
 *
 * This is a pure function with no side effects.
 *
 * @param closeDate - Market close date as ISO string (optional)
 * @param now - Current timestamp in milliseconds (default: Date.now())
 * @returns Score from 2-10 (5 for neutral/no date)
 *
 * @example
 * ```typescript
 * // Urgent (12 hours from now)
 * const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
 * calculateTimeScore(soon); // Returns 10
 *
 * // No close date
 * calculateTimeScore(undefined); // Returns 5 (neutral)
 * ```
 */
export function calculateTimeScore(
  closeDate: string | undefined,
  now: number = Date.now()
): number {
  // No close date: neutral score
  if (closeDate === undefined || closeDate === null) {
    return 5;
  }

  // Parse close date
  let closeDateMs: number;
  try {
    closeDateMs = new Date(closeDate).getTime();
  } catch {
    // Invalid date format: neutral score
    return 5;
  }

  // Check for invalid date
  if (Number.isNaN(closeDateMs)) {
    return 5;
  }

  // Calculate time remaining
  const timeRemainingMs = closeDateMs - now;

  // Past or very soon (already closed or <0 time): most urgent
  if (timeRemainingMs <= 0) {
    return 10;
  }

  // Calculate days remaining
  const daysRemaining = timeRemainingMs / DAY_MS;

  // <1 day: 10 (urgent)
  if (daysRemaining < 1) {
    return 10;
  }

  // 1-3 days: 8
  if (daysRemaining < 3) {
    return 8;
  }

  // 3-7 days: 6
  if (daysRemaining < 7) {
    return 6;
  }

  // 7-30 days: 4
  if (daysRemaining < 30) {
    return 4;
  }

  // >30 days: 2 (long-term)
  return 2;
}
