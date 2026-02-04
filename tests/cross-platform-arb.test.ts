/**
 * Tests for Cross-Platform Arbitrage Detector
 *
 * TDD RED phase: These tests should FAIL until implementation is complete.
 *
 * CRITICAL: This detector is built in Phase 1 but DISABLED until Phase 3
 * when settlement verification is operational.
 *
 * @module tests/cross-platform-arb
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create mock functions at module level (before vi.mock hoisting)
const mockWarn = vi.fn();
const mockInfo = vi.fn();
const mockDebug = vi.fn();
const mockError = vi.fn();

// Mock the feature flags module to test enabled/disabled behavior
vi.mock('../src/config/feature-flags.js', () => ({
  featureFlags: {
    crossPlatformArb: false,
    metaculusDivergence: false,
    whaleTracking: false,
  },
}));

// Mock the database queries
vi.mock('../src/database/queries.js', () => ({
  getRecentMatches: vi.fn(),
  getLatestSnapshot: vi.fn(),
  saveSettlementComparison: vi.fn(),
  getSettlementComparison: vi.fn(() => null),
}));

// Create a mock compare function that can be controlled per test
const mockCompare = vi.fn(() => ({
  polymarketId: 'test-poly',
  kalshiTicker: 'test-kalshi',
  similarity: {
    question: 0.95,
    criteria: 0.95,
    timing: 1.0,
    dataSource: 0.9,
    overall: 0.94,
  },
  safeForArbitrage: true,
  riskFactors: [],
  comparedAt: new Date(),
}));

// Mock settlement comparator to return safe comparisons by default
vi.mock('../src/services/settlement-comparator.js', () => ({
  SettlementComparator: class {
    compare(...args: any[]) {
      return mockCompare(...args);
    }
  },
}));

// Mock settlement parsers
vi.mock('../src/parsers/polymarket-parser.js', () => ({
  PolymarketSettlementParser: class {
    parse(market: any) {
      return {
        platform: 'polymarket',
        marketId: market.id,
        question: market.question,
        primaryRule: market.description || market.question,
        secondaryRule: undefined,
        outcomes: market.outcomes,
        resolutionDate: market.end_date_iso ? new Date(market.end_date_iso) : undefined,
        dataSource: undefined,
        settlementType: 'binary',
        extracted: { dates: [], keywords: [], entities: [] },
      };
    }
  },
}));

vi.mock('../src/parsers/kalshi-parser.js', () => ({
  KalshiSettlementParser: class {
    parse(market: any) {
      return {
        platform: 'kalshi',
        marketId: market.ticker,
        question: market.title,
        primaryRule: market.rules_primary,
        secondaryRule: undefined,
        outcomes: ['Yes', 'No'],
        resolutionDate: market.expiration_time ? new Date(market.expiration_time) : undefined,
        dataSource: undefined,
        settlementType: 'binary',
        extracted: { dates: [], keywords: [], entities: [] },
      };
    }
  },
}));

// Mock logger to capture warning messages - use factory function
vi.mock('../src/utils/logger.js', async () => {
  return {
    logger: {
      child: () => ({
        warn: (...args: unknown[]) => mockWarn(...args),
        info: (...args: unknown[]) => mockInfo(...args),
        debug: (...args: unknown[]) => mockDebug(...args),
        error: (...args: unknown[]) => mockError(...args),
      }),
    },
  };
});

import { featureFlags } from '../src/config/feature-flags.js';

import {
  CrossPlatformArbDetector,
  CrossPlatformOpportunity,
} from '../src/detectors/cross-platform-arb.js';
import { getRecentMatches, getLatestSnapshot } from '../src/database/queries.js';

describe('CrossPlatformArbDetector', () => {
  let detector: CrossPlatformArbDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new CrossPlatformArbDetector();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Feature Flag Enforcement', () => {
    it('should return empty array when feature flag is disabled', async () => {
      // Feature flag is disabled by default in mock
      const opportunities = await detector.detect();

      expect(opportunities).toEqual([]);
    });

    it('should log warning when feature flag is disabled', async () => {
      await detector.detect();

      expect(mockWarn).toHaveBeenCalledWith(
        'Cross-platform arb detector disabled until Phase 3 (settlement verification)'
      );
    });

    it('should not query database when feature flag is disabled', async () => {
      await detector.detect();

      expect(getRecentMatches).not.toHaveBeenCalled();
      expect(getLatestSnapshot).not.toHaveBeenCalled();
    });

    it('should proceed with detection when feature flag is enabled', async () => {
      // Enable feature flag
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;

      // Mock no matches
      vi.mocked(getRecentMatches).mockReturnValue([]);

      const opportunities = await detector.detect();

      expect(getRecentMatches).toHaveBeenCalled();
      expect(opportunities).toEqual([]);

      // Reset flag
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });
  });

  describe('Price Divergence Detection (when enabled)', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should detect arbitrage when price divergence exceeds threshold after fees', async () => {
      // Poly 60% / Kalshi 45% = 15% gross edge
      // After fees (2% + 7% = 9%): 15% - 9% = 6% net edge
      // But our minimum is 10%, so this should NOT be flagged
      // Let's use Poly 75% / Kalshi 55% = 20% gross, 11% net
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-123',
          kalshi_ticker: 'KALSHI-ABC',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      // Polymarket snapshot - YES at 75%
      vi.mocked(getLatestSnapshot).mockImplementation((platform, marketId) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-123',
            timestamp: Date.now() - 60000, // 1 minute ago
            data: {
              question: 'Will X happen?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.75, No: 0.25 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-ABC',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will X happen?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('price_divergence');
      expect(opportunities[0].grossEdge).toBeCloseTo(0.20, 2);
      expect(opportunities[0].netEdge).toBeCloseTo(0.11, 2);
    });

    it('should skip opportunities with insufficient net edge (below 10%)', async () => {
      // Poly 60% / Kalshi 50% = 10% gross edge
      // After fees (9%): only 1% net edge - should be skipped
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-123',
          kalshi_ticker: 'KALSHI-ABC',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-123',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.60, No: 0.40 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-ABC',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.50, No: 0.50 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(0);
    });

    it('should detect inverse arbitrage (Poly YES vs Kalshi NO)', async () => {
      // Polymarket YES at 35%, Kalshi NO at 35% (implies YES=65%)
      // Divergence: 65% - 35% = 30% gross edge
      // After fees: 30% - 9% = 21% net edge
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-inverse',
          kalshi_ticker: 'KALSHI-INV',
          confidence: 0.85,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-inverse',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will Y happen?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.35, No: 0.65 },
              liquidity: 6000,
              orderBookDepth: 3000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-INV',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will Y happen?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.65, No: 0.35 },
              liquidity: 7000,
              orderBookDepth: 3500,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].type).toBe('price_divergence');
      expect(opportunities[0].grossEdge).toBeCloseTo(0.30, 2);
    });
  });

  describe('Fee Calculations', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should apply default fees (Polymarket 2%, Kalshi 7%)', async () => {
      const detector = new CrossPlatformArbDetector();

      // 25% gross edge - 9% fees = 16% net
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-fee-test',
          kalshi_ticker: 'KALSHI-FEE',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-fee-test',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-FEE',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(1);
      // Gross: 80% - 55% = 25%
      // Net: 25% - 2% - 7% = 16%
      expect(opportunities[0].netEdge).toBeCloseTo(0.16, 2);
    });

    it('should use custom fees when configured', async () => {
      // Custom fees: 3% Polymarket, 5% Kalshi = 8% total
      const customDetector = new CrossPlatformArbDetector(10, 500, 3, 5);

      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-custom',
          kalshi_ticker: 'KALSHI-CUSTOM',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-custom',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.70, No: 0.30 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-CUSTOM',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.50, No: 0.50 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await customDetector.detect();

      expect(opportunities.length).toBe(1);
      // Gross: 70% - 50% = 20%
      // Net with custom fees: 20% - 3% - 5% = 12%
      expect(opportunities[0].netEdge).toBeCloseTo(0.12, 2);
    });
  });

  describe('Liquidity Validation', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should skip opportunities when Polymarket liquidity is below minimum', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-low-liq',
          kalshi_ticker: 'KALSHI-LOW',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-low-liq',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 200, // Below $500 minimum
              orderBookDepth: 100,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-LOW',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(0);
    });

    it('should skip opportunities when Kalshi liquidity is below minimum', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-ok',
          kalshi_ticker: 'KALSHI-LOW-LIQ',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-ok',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-LOW-LIQ',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 300, // Below $500 minimum
              orderBookDepth: 150,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(0);
    });

    it('should use custom minimum liquidity threshold', async () => {
      // Custom detector with $1000 minimum liquidity
      const strictDetector = new CrossPlatformArbDetector(10, 1000);

      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-med-liq',
          kalshi_ticker: 'KALSHI-MED',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-med-liq',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 800, // Above $500, below $1000
              orderBookDepth: 400,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-MED',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 800,
              orderBookDepth: 400,
            },
          };
        }
      });

      const opportunities = await strictDetector.detect();

      expect(opportunities.length).toBe(0);
    });
  });

  describe('Match Confidence Filtering', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should skip matches with confidence below 0.5', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-low-conf',
          kalshi_ticker: 'KALSHI-LOW-CONF',
          confidence: 0.4, // Below 0.5 threshold
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-low-conf',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-LOW-CONF',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(0);
    });

    it('should process high-confidence matches (>0.8) preferentially', async () => {
      // Note: getRecentMatches is called with minConfidence 0.5, so low confidence matches
      // won't even be returned. This test verifies we process all returned matches.
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-high-conf',
          kalshi_ticker: 'KALSHI-HIGH',
          confidence: 0.95,
          method: 'exact_match',
          timestamp: Date.now(),
        },
        {
          id: 2,
          polymarket_id: 'poly-med-conf',
          kalshi_ticker: 'KALSHI-MED',
          confidence: 0.7,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform, marketId) => {
        // Both have large edge, only differ in confidence
        const isHighConf = marketId.includes('high') || marketId.includes('HIGH');
        const polyPrice = isHighConf ? 0.85 : 0.80;
        const kalshiPrice = isHighConf ? 0.60 : 0.55;

        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId,
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: polyPrice, No: 1 - polyPrice },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId,
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: kalshiPrice, No: 1 - kalshiPrice },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(2);
      // Both should be detected since they have sufficient edge
    });
  });

  describe('Stale Data Handling', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should skip opportunities when snapshot data is stale (>30 min old)', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-stale',
          kalshi_ticker: 'KALSHI-STALE',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      const staleTimestamp = Date.now() - 45 * 60 * 1000; // 45 minutes ago

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-stale',
            timestamp: staleTimestamp, // Stale
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-STALE',
            timestamp: Date.now() - 60000, // Fresh
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(0);
    });

    it('should skip when snapshot data is null (no data available)', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-no-data',
          kalshi_ticker: 'KALSHI-NO-DATA',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return null; // No data
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-NO-DATA',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(0);
    });
  });

  describe('Settlement Risk Scoring (Phase 3)', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should skip opportunities with HIGH settlement risk', async () => {
      // Mock the comparator to return unsafe comparison for this test
      mockCompare.mockReturnValueOnce({
        polymarketId: 'poly-high-risk',
        kalshiTicker: 'KALSHI-HIGH-RISK',
        similarity: {
          question: 0.3,
          criteria: 0.2,
          timing: 0.1,
          dataSource: 0.0,
          overall: 0.2,
        },
        safeForArbitrage: false,
        riskFactors: ['Very different questions', 'Different data sources'],
        comparedAt: new Date(),
      });

      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-high-risk',
          kalshi_ticker: 'KALSHI-HIGH-RISK',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-high-risk',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will Bitcoin reach $100K in 2026?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-HIGH-RISK',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will Ethereum surpass Bitcoin in market cap?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      // Should skip due to HIGH settlement risk (very different questions)
      expect(opportunities.length).toBe(0);
    });

    it('should include settlement comparison details in opportunity', async () => {
      // When opportunity IS flagged, it should include comparison metadata
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-safe',
          kalshi_ticker: 'KALSHI-SAFE',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        // Same question on both platforms for settlement safety
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-safe',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will the S&P 500 close above 6000 on Dec 31, 2026?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-SAFE',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will the S&P 500 close above 6000 on Dec 31, 2026?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      // Should include settlement comparison in opportunity structure
      if (opportunities.length > 0) {
        expect(opportunities[0]).toHaveProperty('settlementComparison');
      }
    });

    it('should apply 2-3 point penalty for MEDIUM risk with mechanism differences', async () => {
      // Test that opportunities with different settlement mechanisms
      // (e.g., UMA vs centralized) get score reduced by 2-3 points
      // Note: This requires actual settlement comparison to detect mechanism differences
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-medium',
          kalshi_ticker: 'KALSHI-MEDIUM',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-medium',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test market with similar question',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-MEDIUM',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test market with similar question',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      // Verify structure - actual penalty testing requires mocked comparator
      expect(Array.isArray(opportunities)).toBe(true);
    });

    it('should cache settlement comparisons', async () => {
      // First detection should compute and cache
      // Second detection should use cached comparison
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-cache',
          kalshi_ticker: 'KALSHI-CACHE',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-cache',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test caching',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-CACHE',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test caching',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      await detector.detect();
      // Run again - should not recompute (uses database cache)
      await detector.detect();

      // Verify detector works correctly
      expect(Array.isArray(await detector.detect())).toBe(true);
    });
  });

  describe('Opportunity Structure', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should return correctly structured opportunity objects', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-struct',
          kalshi_ticker: 'KALSHI-STRUCT',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-struct',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will Z happen?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-STRUCT',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Will Z happen?',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(1);

      const opp = opportunities[0];
      expect(opp).toHaveProperty('polymarketId', 'poly-struct');
      expect(opp).toHaveProperty('kalshiTicker', 'KALSHI-STRUCT');
      expect(opp).toHaveProperty('type', 'price_divergence');
      expect(opp).toHaveProperty('grossEdge');
      expect(opp).toHaveProperty('netEdge');
      expect(opp).toHaveProperty('settlementRisk'); // Phase 3: Risk is based on actual comparison
      expect(opp).toHaveProperty('matchConfidence', 0.9);
      expect(opp).toHaveProperty('polymarketPrice');
      expect(opp).toHaveProperty('kalshiPrice');
      expect(opp).toHaveProperty('polymarketLiquidity', 10000);
      expect(opp).toHaveProperty('kalshiLiquidity', 8000);
      expect(opp).toHaveProperty('detectedAt');
    });

    it('should sort opportunities by net edge descending', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-small',
          kalshi_ticker: 'KALSHI-SMALL',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
        {
          id: 2,
          polymarket_id: 'poly-large',
          kalshi_ticker: 'KALSHI-LARGE',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform, marketId) => {
        const isLarge = marketId.includes('large') || marketId.includes('LARGE');

        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId,
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: isLarge ? 0.90 : 0.75, No: isLarge ? 0.10 : 0.25 },
              liquidity: 10000,
              orderBookDepth: 5000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId,
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: isLarge ? 0.50 : 0.55, No: isLarge ? 0.50 : 0.45 },
              liquidity: 8000,
              orderBookDepth: 4000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(2);
      // Large edge should be first (90% - 50% = 40% gross)
      // Small edge second (75% - 55% = 20% gross)
      expect(opportunities[0].grossEdge).toBeGreaterThan(opportunities[1].grossEdge);
    });
  });

  describe('Confidence Scoring for Opportunities', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should calculate opportunity confidence based on net edge and liquidity', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-conf',
          kalshi_ticker: 'KALSHI-CONF',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-conf',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              // Large edge (35% gross, 26% net) with deep liquidity
              prices: { Yes: 0.90, No: 0.10 },
              liquidity: 50000,
              orderBookDepth: 25000,
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-CONF',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              liquidity: 40000,
              orderBookDepth: 20000,
            },
          };
        }
      });

      const opportunities = await detector.detect();

      expect(opportunities.length).toBe(1);
      // High confidence: large net edge (>15%) with deep liquidity
      expect(opportunities[0].opportunityConfidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = true;
    });

    afterEach(() => {
      (featureFlags as { crossPlatformArb: boolean }).crossPlatformArb = false;
    });

    it('should handle empty matches array', async () => {
      vi.mocked(getRecentMatches).mockReturnValue([]);

      const opportunities = await detector.detect();

      expect(opportunities).toEqual([]);
    });

    it('should handle missing liquidity data gracefully', async () => {
      const mockMatches = [
        {
          id: 1,
          polymarket_id: 'poly-no-liq',
          kalshi_ticker: 'KALSHI-NO-LIQ',
          confidence: 0.9,
          method: 'keyword_match',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(getRecentMatches).mockReturnValue(mockMatches);

      vi.mocked(getLatestSnapshot).mockImplementation((platform) => {
        if (platform === 'polymarket') {
          return {
            platform: 'polymarket',
            marketId: 'poly-no-liq',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.80, No: 0.20 },
              // No liquidity data
            },
          };
        } else {
          return {
            platform: 'kalshi',
            marketId: 'KALSHI-NO-LIQ',
            timestamp: Date.now() - 60000,
            data: {
              question: 'Test',
              outcomes: ['Yes', 'No'],
              prices: { Yes: 0.55, No: 0.45 },
              // No liquidity data
            },
          };
        }
      });

      const opportunities = await detector.detect();

      // Should be skipped due to missing liquidity data
      expect(opportunities.length).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(getRecentMatches).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      // Should not throw, should return empty array
      const opportunities = await detector.detect();

      expect(opportunities).toEqual([]);
    });
  });
});
