/**
 * Feature flags for gating functionality until dependencies are met.
 *
 * CRITICAL SAFETY: Some edge detection features are DISABLED until
 * supporting infrastructure is operational.
 *
 * @module config/feature-flags
 */

/**
 * Feature flag configuration.
 *
 * Each flag controls access to specific functionality that requires
 * external dependencies or safety verification.
 */
export const featureFlags = {
  /**
   * Cross-platform arbitrage detection.
   * DISABLED until Phase 3 settlement verification is complete.
   *
   * Risk: Settlement divergence causes DOUBLE LOSSES (lose on both platforms).
   * Requires: EDGE-07 (settlement rule parser) operational.
   */
  crossPlatformArb: false,

  /**
   * Metaculus divergence detection.
   * DISABLED until Phase 4 Metaculus API integration.
   *
   * Requires: Superforecaster prediction data access.
   */
  metaculusDivergence: false,

  /**
   * Whale tracking for follow-the-money signals.
   * DISABLED until Phase 6 on-chain infrastructure.
   *
   * Requires: Blockchain event monitoring for large trades.
   */
  whaleTracking: false,
};

/**
 * Type for feature flag keys
 */
export type FeatureFlagKey = keyof typeof featureFlags;

/**
 * Check if a feature is enabled.
 *
 * @param flag - Feature flag key
 * @returns true if enabled, false otherwise
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return featureFlags[flag] === true;
}
