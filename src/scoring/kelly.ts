/**
 * Kelly Criterion Position Sizing
 *
 * Implements SIZE-01 through SIZE-04 requirements:
 * - SIZE-01: Kelly criterion calculates optimal position size
 * - SIZE-02: Inputs (edge, confidence, bankroll)
 * - SIZE-03: Half-Kelly is default (fraction = 0.5)
 * - SIZE-04: 10% bankroll cap enforced (maxPosition = 0.10)
 *
 * Formula:
 * - Full Kelly: f* = edge * confidence
 * - Fractional Kelly: f = f* * fraction (default 0.5 for half-Kelly)
 * - Final position: min(f, maxPosition) * bankroll
 *
 * @example
 * ```typescript
 * const result = calculateKelly({
 *   edge: 0.10,        // 10% edge
 *   confidence: 0.80,  // 80% confidence
 *   bankroll: 500,     // $500
 * });
 * // Returns: { positionSize: 20, positionPercent: 4, cappedBy: 'none' }
 * ```
 */

/**
 * Input parameters for Kelly criterion calculation
 */
export interface KellyInput {
  /** Estimated edge on the bet (0-1 scale, e.g., 0.10 = 10% edge) */
  edge: number;

  /** Confidence in the edge estimate (0-1 scale) */
  confidence: number;

  /** Total bankroll in USD */
  bankroll: number;

  /** Kelly fraction to use (default: 0.5 for half-Kelly) */
  fraction?: number;

  /** Maximum position as fraction of bankroll (default: 0.10 for 10% cap) */
  maxPosition?: number;
}

/**
 * Output from Kelly criterion calculation
 */
export interface KellyOutput {
  /** Suggested position size in USD, rounded to cents */
  positionSize: number;

  /** Position as percentage of bankroll (0-100 scale) */
  positionPercent: number;

  /** What limited the position size */
  cappedBy: 'none' | 'kelly' | 'max';
}

/** Default fraction (half-Kelly) - SIZE-03 */
const DEFAULT_FRACTION = 0.5;

/** Default maximum position (10% of bankroll) - SIZE-04 */
const DEFAULT_MAX_POSITION = 0.10;

/** Minimum confidence threshold - below this, return 0 */
const MIN_CONFIDENCE_THRESHOLD = 0.1;

/**
 * Calculate optimal position size using Kelly criterion
 *
 * The Kelly criterion determines the optimal bet size to maximize
 * long-term growth while managing risk. This implementation uses
 * fractional Kelly (default half-Kelly) for safety.
 *
 * @param input - Kelly calculation parameters
 * @returns Position sizing recommendation
 *
 * @example Standard calculation
 * ```typescript
 * calculateKelly({ edge: 0.10, confidence: 0.80, bankroll: 500 });
 * // { positionSize: 20, positionPercent: 4, cappedBy: 'none' }
 * ```
 *
 * @example High edge (capped)
 * ```typescript
 * calculateKelly({ edge: 0.25, confidence: 0.90, bankroll: 500 });
 * // { positionSize: 50, positionPercent: 10, cappedBy: 'max' }
 * ```
 *
 * @example Zero edge
 * ```typescript
 * calculateKelly({ edge: 0, confidence: 0.90, bankroll: 500 });
 * // { positionSize: 0, positionPercent: 0, cappedBy: 'kelly' }
 * ```
 */
export function calculateKelly(input: KellyInput): KellyOutput {
  const {
    edge,
    confidence,
    bankroll,
    fraction = DEFAULT_FRACTION,
    maxPosition = DEFAULT_MAX_POSITION,
  } = input;

  // Edge case: zero or negative edge means no bet
  if (edge <= 0) {
    return {
      positionSize: 0,
      positionPercent: 0,
      cappedBy: 'kelly',
    };
  }

  // Edge case: very low confidence means no bet
  if (confidence < MIN_CONFIDENCE_THRESHOLD) {
    return {
      positionSize: 0,
      positionPercent: 0,
      cappedBy: 'kelly',
    };
  }

  // Calculate Kelly fraction
  // Full Kelly: f* = edge * confidence
  const fullKelly = edge * confidence;

  // Apply fractional Kelly (e.g., half-Kelly)
  const fractionalKelly = fullKelly * fraction;

  // Determine if capped by max position
  let finalFraction: number;
  let cappedBy: 'none' | 'kelly' | 'max';

  if (fractionalKelly > maxPosition) {
    finalFraction = maxPosition;
    cappedBy = 'max';
  } else {
    finalFraction = fractionalKelly;
    cappedBy = 'none';
  }

  // Calculate position size in USD
  const rawPositionSize = bankroll * finalFraction;

  // Round to cents (2 decimal places)
  const positionSize = Math.round(rawPositionSize * 100) / 100;

  // Calculate percentage (0-100 scale)
  // Round to avoid floating point precision issues (e.g., 4.000000000000001)
  const positionPercent = Math.round(finalFraction * 100 * 10000) / 10000;

  return {
    positionSize,
    positionPercent,
    cappedBy,
  };
}
