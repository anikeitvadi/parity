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
   * ENABLED in Phase 3 after settlement verification implementation.
   *
   * Uses settlement rule comparison to verify safety before flagging.
   */
  crossPlatformArb: true,

  /**
   * Metaculus divergence detection.
   * ENABLED in Phase 4 for Metaculus API integration.
   *
   * Requires: METACULUS_TOKEN env var.
   */
  metaculusDivergence: true,

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
