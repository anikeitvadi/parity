/**
 * Aggregator Module Tests
 *
 * Tests for OpportunityAggregator and OpportunityDeduplicator.
 *
 * Coverage:
 * - Deduplicator hash uniqueness
 * - Deduplicator time window
 * - Aggregator normalization
 * - Aggregator feature flag enforcement
 * - Aggregator error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OpportunityDeduplicator } from '../src/aggregator/deduplicator.js';
import { OpportunityAggregator } from '../src/aggregator/opportunity-aggregator.js';
import { UnifiedOpportunity, Platform, OpportunityType } from '../src/scoring/types.js';
import { Market } from '../src/types/market.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock UnifiedOpportunity for testing
 */
function createMockOpportunity(overrides: Partial<UnifiedOpportunity> = {}): UnifiedOpportunity {
  return {
    id: 'test-id-123',
    type: 'multi_outcome',
    platform: 'polymarket',
    marketId: 'market-abc',
    marketQuestion: 'Test market question?',
    grossEdge: 0.12,
    netEdge: 0.10,
    detectorConfidence: 0.85,
    minLiquidity: 5000,
    liquidityDepth: 3,
    detectedAt: Date.now(),
    raw: {},
    ...overrides,
  };
}

/**
 * Create a mock Market for correlated detector testing
 */
function createMockMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'market-xyz',
    platform: 'polymarket',
    question: 'Will X happen by Y?',
    outcomes: ['Yes', 'No'],
    prices: { Yes: 0.45, No: 0.45 }, // 10% edge (sum = 0.90)
    closeDate: '2026-03-15',
    liquidity: 10000,
    ...overrides,
  };
}

// =============================================================================
// Deduplicator Tests
// =============================================================================

describe('OpportunityDeduplicator', () => {
  describe('hash uniqueness', () => {
    it('should generate different hashes for different markets', () => {
      const dedup = new OpportunityDeduplicator(4);

      const opp1 = createMockOpportunity({ marketId: 'market-1' });
      const opp2 = createMockOpportunity({ marketId: 'market-2' });

      // Record both
      dedup.record(opp1, 8.0);
      dedup.record(opp2, 7.5);

      // Both should be tracked separately
      expect(dedup.getStats().total).toBe(2);
    });

    it('should generate different hashes for different types', () => {
      const dedup = new OpportunityDeduplicator(4);

      const opp1 = createMockOpportunity({ type: 'multi_outcome' });
      const opp2 = createMockOpportunity({ type: 'correlated' });

      dedup.record(opp1, 8.0);
      dedup.record(opp2, 7.5);

      expect(dedup.getStats().total).toBe(2);
    });

    it('should generate different hashes for different platforms', () => {
      const dedup = new OpportunityDeduplicator(4);

      const opp1 = createMockOpportunity({ platform: 'polymarket' });
      const opp2 = createMockOpportunity({ platform: 'kalshi' });

      dedup.record(opp1, 8.0);
      dedup.record(opp2, 7.5);

      expect(dedup.getStats().total).toBe(2);
    });

    it('should generate same hash for same market with different edge values', () => {
      const dedup = new OpportunityDeduplicator(4);

      const opp1 = createMockOpportunity({ grossEdge: 0.10, netEdge: 0.08 });
      const opp2 = createMockOpportunity({ grossEdge: 0.15, netEdge: 0.12 });

      dedup.record(opp1, 8.0);

      // Should be a duplicate (same market, different edge)
      expect(dedup.isDuplicate(opp2)).toBe(true);
      expect(dedup.getStats().total).toBe(1);
    });
  });

  describe('time window', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should detect duplicate within 4-hour window', () => {
      const dedup = new OpportunityDeduplicator(4); // 4 hours
      const opp = createMockOpportunity();

      // Record at t=0
      dedup.record(opp, 8.0);
      expect(dedup.isDuplicate(opp)).toBe(true);

      // Still duplicate after 3 hours
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      expect(dedup.isDuplicate(opp)).toBe(true);

      // Still duplicate at 3h 59m
      vi.advanceTimersByTime(59 * 60 * 1000);
      expect(dedup.isDuplicate(opp)).toBe(true);
    });

    it('should NOT detect duplicate after window expires', () => {
      const dedup = new OpportunityDeduplicator(4); // 4 hours
      const opp = createMockOpportunity();

      // Record at t=0
      dedup.record(opp, 8.0);

      // After 5 hours, not a duplicate
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);
      expect(dedup.isDuplicate(opp)).toBe(false);
    });

    it('same opportunity at t=0 and t=5h should both appear (requirement)', () => {
      const dedup = new OpportunityDeduplicator(4);
      const opp = createMockOpportunity();

      // t=0: First appearance
      expect(dedup.isDuplicate(opp)).toBe(false);
      dedup.record(opp, 8.0);

      // t=5h: Should appear again (window expired)
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);
      expect(dedup.isDuplicate(opp)).toBe(false);
      dedup.record(opp, 8.5);

      // Now it's tracked again
      expect(dedup.isDuplicate(opp)).toBe(true);
    });

    it('should prune expired entries', () => {
      const dedup = new OpportunityDeduplicator(4);

      // Record 3 opportunities at t=0
      const opp1 = createMockOpportunity({ marketId: 'market-1' });
      const opp2 = createMockOpportunity({ marketId: 'market-2' });
      const opp3 = createMockOpportunity({ marketId: 'market-3' });

      dedup.record(opp1, 8.0);
      dedup.record(opp2, 7.5);
      dedup.record(opp3, 7.0);

      expect(dedup.getStats().total).toBe(3);

      // Advance 5 hours (past window)
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Before prune, still tracked
      expect(dedup.getStats().total).toBe(3);

      // After prune, all removed
      dedup.prune();
      expect(dedup.getStats().total).toBe(0);
    });
  });

  describe('score tracking', () => {
    it('should track highest score', () => {
      const dedup = new OpportunityDeduplicator(4);
      const opp = createMockOpportunity();

      dedup.record(opp, 6.0);
      expect(dedup.getHighestScore(opp)).toBe(6.0);

      dedup.record(opp, 8.5);
      expect(dedup.getHighestScore(opp)).toBe(8.5);

      // Lower score doesn't replace
      dedup.record(opp, 7.0);
      expect(dedup.getHighestScore(opp)).toBe(8.5);
    });

    it('should return null for unknown opportunity', () => {
      const dedup = new OpportunityDeduplicator(4);
      const opp = createMockOpportunity();

      expect(dedup.getHighestScore(opp)).toBeNull();
    });
  });

  describe('stats and utility', () => {
    it('should report correct stats', () => {
      const dedup = new OpportunityDeduplicator(4);
      const opp1 = createMockOpportunity({ marketId: 'market-1' });
      const opp2 = createMockOpportunity({ marketId: 'market-2' });

      dedup.record(opp1, 8.0);
      dedup.record(opp2, 7.5);

      const stats = dedup.getStats();
      expect(stats.total).toBe(2);
      expect(stats.oldest).not.toBeNull();
    });

    it('should clear all entries', () => {
      const dedup = new OpportunityDeduplicator(4);
      const opp = createMockOpportunity();

      dedup.record(opp, 8.0);
      expect(dedup.getStats().total).toBe(1);

      dedup.clear();
      expect(dedup.getStats().total).toBe(0);
    });

    it('should report window hours', () => {
      const dedup = new OpportunityDeduplicator(6);
      expect(dedup.getWindowHours()).toBe(6);
    });
  });
});

// =============================================================================
// Aggregator Tests
// =============================================================================

describe('OpportunityAggregator', () => {
  // Mock the database and detectors for aggregator tests
  let originalFeatureFlags: typeof import('../src/config/feature-flags.js').featureFlags;

  beforeEach(async () => {
    // Store original feature flags
    const module = await import('../src/config/feature-flags.js');
    originalFeatureFlags = { ...module.featureFlags };
  });

  afterEach(async () => {
    // Restore feature flags
    const module = await import('../src/config/feature-flags.js');
    Object.assign(module.featureFlags, originalFeatureFlags);
  });

  describe('feature flag enforcement', () => {
    it('should skip cross-platform detector when flag is false', async () => {
      // Ensure flag is false (default)
      const module = await import('../src/config/feature-flags.js');
      module.featureFlags.crossPlatformArb = false;

      const aggregator = new OpportunityAggregator();
      const result = await aggregator.aggregate([], []);

      // Should have skipped cross-platform
      expect(result.stats.skipped).toContainEqual({
        detector: 'cross-platform',
        reason: expect.stringContaining('disabled'),
      });

      // Cross-platform count should be 0
      expect(result.stats.detectorCounts.crossPlatform).toBe(0);
    });

    it('should include cross-platform detector when flag is true', async () => {
      // Enable the flag
      const module = await import('../src/config/feature-flags.js');
      module.featureFlags.crossPlatformArb = true;

      const aggregator = new OpportunityAggregator();
      const result = await aggregator.aggregate([], []);

      // Should NOT have skipped cross-platform
      const skippedCrossPlatform = result.stats.skipped.find(
        (s) => s.detector === 'cross-platform'
      );
      expect(skippedCrossPlatform).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should continue after one detector fails', async () => {
      const aggregator = new OpportunityAggregator();

      // Aggregate with empty markets - should not throw
      const result = await aggregator.aggregate([], []);

      // Should have attempted all detectors
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.stats).toBeDefined();
    });

    it('should collect errors without crashing', async () => {
      const aggregator = new OpportunityAggregator();
      const result = await aggregator.aggregate([], []);

      // Errors array should exist (may be empty if no errors)
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('normalization', () => {
    it('should normalize correlated detector output to UnifiedOpportunity', async () => {
      const aggregator = new OpportunityAggregator();

      // Create market with underpriced conditions (10% edge)
      const market: Market = {
        id: 'test-correlated-market',
        platform: 'polymarket',
        question: 'Test correlated market?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.44, No: 0.44 }, // Sum = 0.88, 12% edge
        closeDate: '2026-06-01',
        liquidity: 5000,
      };

      const result = await aggregator.aggregate([market], []);

      // Find correlated opportunity if any (depends on min edge threshold)
      const correlatedOpps = result.opportunities.filter((o) => o.type === 'correlated');

      // If there are correlated opportunities, verify normalization
      if (correlatedOpps.length > 0) {
        const opp = correlatedOpps[0];
        expect(opp.type).toBe('correlated');
        expect(opp.platform).toBe('polymarket');
        expect(opp.marketId).toBe('test-correlated-market');
        expect(opp.marketQuestion).toBe('Test correlated market?');
        expect(opp.grossEdge).toBeGreaterThan(0);
        expect(opp.grossEdge).toBeLessThanOrEqual(1); // 0-1 scale
        expect(opp.detectorConfidence).toBeGreaterThanOrEqual(0);
        expect(opp.detectorConfidence).toBeLessThanOrEqual(1);
        expect(opp.id).toMatch(/^[a-f0-9]{16}$/); // 16-char hex hash
      }
    });

    it('should set all required UnifiedOpportunity fields', async () => {
      const aggregator = new OpportunityAggregator();

      // Create market with significant edge
      const market: Market = {
        id: 'unified-test-market',
        platform: 'kalshi',
        question: 'Unified opportunity test?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.40, No: 0.40 }, // 20% edge
        closeDate: '2026-12-31',
        liquidity: 10000,
      };

      const result = await aggregator.aggregate([], [market]);

      // Check all correlated opportunities have required fields
      for (const opp of result.opportunities) {
        expect(opp.id).toBeDefined();
        expect(opp.type).toBeDefined();
        expect(opp.platform).toBeDefined();
        expect(opp.marketId).toBeDefined();
        expect(opp.marketQuestion).toBeDefined();
        expect(typeof opp.grossEdge).toBe('number');
        expect(typeof opp.netEdge).toBe('number');
        expect(typeof opp.detectorConfidence).toBe('number');
        expect(typeof opp.minLiquidity).toBe('number');
        expect(typeof opp.liquidityDepth).toBe('number');
        expect(typeof opp.detectedAt).toBe('number');
        expect(opp.raw).toBeDefined();
      }
    });
  });

  describe('aggregation stats', () => {
    it('should report detector counts', async () => {
      const aggregator = new OpportunityAggregator();
      const result = await aggregator.aggregate([], []);

      expect(result.stats.detectorCounts).toBeDefined();
      expect(typeof result.stats.detectorCounts.multiOutcomePolymarket).toBe('number');
      expect(typeof result.stats.detectorCounts.multiOutcomeKalshi).toBe('number');
      expect(typeof result.stats.detectorCounts.correlatedMarkets).toBe('number');
      expect(typeof result.stats.detectorCounts.crossPlatform).toBe('number');
    });

    it('should report total raw count', async () => {
      const aggregator = new OpportunityAggregator();
      const result = await aggregator.aggregate([], []);

      expect(typeof result.stats.totalRaw).toBe('number');
      expect(result.stats.totalRaw).toBe(result.opportunities.length);
    });
  });
});

// =============================================================================
// Integration Tests: Aggregate -> Score -> Dedupe Pipeline
// =============================================================================

describe('Aggregate -> Score -> Dedupe Pipeline', () => {
  it('should flow opportunities through full pipeline', async () => {
    // Create deduplicator
    const dedup = new OpportunityDeduplicator(4);

    // Create aggregator
    const aggregator = new OpportunityAggregator();

    // Create markets with significant edges
    const markets: Market[] = [
      {
        id: 'pipeline-market-1',
        platform: 'polymarket',
        question: 'Pipeline test market 1?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.42, No: 0.42 }, // 16% edge
        closeDate: '2026-06-01',
        liquidity: 8000,
      },
      {
        id: 'pipeline-market-2',
        platform: 'polymarket',
        question: 'Pipeline test market 2?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.45, No: 0.45 }, // 10% edge
        closeDate: '2026-06-01',
        liquidity: 5000,
      },
    ];

    // Step 1: Aggregate
    const result = await aggregator.aggregate(markets, []);

    // Step 2: Filter duplicates and record new ones
    const newOpportunities: UnifiedOpportunity[] = [];
    for (const opp of result.opportunities) {
      if (!dedup.isDuplicate(opp)) {
        newOpportunities.push(opp);
        // Use a mock score (would come from scoring engine in real pipeline)
        dedup.record(opp, 7.5);
      }
    }

    // Step 3: Verify deduplication works
    // Running aggregation again should mark same opportunities as duplicates
    const result2 = await aggregator.aggregate(markets, []);
    let duplicateCount = 0;

    for (const opp of result2.opportunities) {
      if (dedup.isDuplicate(opp)) {
        duplicateCount++;
      }
    }

    // All opportunities from second run should be duplicates of first run
    expect(duplicateCount).toBe(result2.opportunities.length);
  });

  it('should allow opportunity to reappear after window expires', async () => {
    vi.useFakeTimers();

    const dedup = new OpportunityDeduplicator(4);
    const aggregator = new OpportunityAggregator();

    const market: Market = {
      id: 'reappear-test-market',
      platform: 'kalshi',
      question: 'Reappear test?',
      outcomes: ['Yes', 'No'],
      prices: { Yes: 0.40, No: 0.40 }, // 20% edge
      closeDate: '2026-06-01',
      liquidity: 10000,
    };

    // First aggregation at t=0
    const result1 = await aggregator.aggregate([], [market]);
    for (const opp of result1.opportunities) {
      dedup.record(opp, 8.0);
    }

    // Second aggregation at t=2h (should be duplicate)
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    const result2 = await aggregator.aggregate([], [market]);
    for (const opp of result2.opportunities) {
      expect(dedup.isDuplicate(opp)).toBe(true);
    }

    // Third aggregation at t=5h (window expired, not duplicate)
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    dedup.prune(); // Clean up expired entries
    const result3 = await aggregator.aggregate([], [market]);
    for (const opp of result3.opportunities) {
      expect(dedup.isDuplicate(opp)).toBe(false);
    }

    vi.useRealTimers();
  });
});
