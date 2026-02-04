/**
 * Tests for MetaculusDivergenceDetector
 *
 * TDD RED phase - comprehensive test suite before implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Market } from '../../src/types/market.js';
import type { MetaculusQuestion } from '../../src/types/metaculus.js';

// Mock dependencies
vi.mock('../../src/config/feature-flags.js', () => ({
  featureFlags: {
    metaculusDivergence: true, // Default to enabled, individual tests can override
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../../src/services/metaculus-client.js', () => {
  return {
    MetaculusClient: class {
      searchQuestions = vi.fn().mockResolvedValue([]);
    },
  };
});

vi.mock('../../src/services/metaculus-matcher.js', () => {
  return {
    MetaculusMatcher: class {
      matchToMarkets = vi.fn().mockReturnValue([]);
    },
  };
});

// Import detector after mocks
let MetaculusDivergenceDetector: any;

describe('MetaculusDivergenceDetector', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to ensure mocks are applied
    const module = await import('../../src/detectors/metaculus-divergence.js');
    MetaculusDivergenceDetector = module.MetaculusDivergenceDetector;
  });

  describe('detect', () => {
    it('returns empty array when feature flag disabled', async () => {
      // Override feature flag
      const { featureFlags } = await import('../../src/config/feature-flags.js');
      (featureFlags as any).metaculusDivergence = false;

      const detector = new MetaculusDivergenceDetector();
      const markets: Market[] = [createMockMarket('polymarket', 'market-1', 0.7)];

      const result = await detector.detect(markets);

      expect(result).toEqual([]);

      // Reset flag
      (featureFlags as any).metaculusDivergence = true;
    });

    it('returns empty array when no questions returned', async () => {
      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([]),
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const markets: Market[] = [createMockMarket('polymarket', 'market-1', 0.7)];
      const result = await detector.detect(markets);

      expect(result).toEqual([]);
      expect(mockClient.searchQuestions).toHaveBeenCalled();
    });

    it('returns empty array when no matches found', async () => {
      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([
          createMockQuestion(1, 'Test question', 0.65, '2024-02-01T00:00:00Z'),
        ]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([]), // No matches
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const markets: Market[] = [createMockMarket('polymarket', 'market-1', 0.7)];
      const result = await detector.detect(markets);

      expect(result).toEqual([]);
      expect(mockMatcher.matchToMarkets).toHaveBeenCalled();
    });

    it('skips questions without community_prediction', async () => {
      const questionNoPrediction = createMockQuestion(1, 'Test question', undefined, '2024-02-01T00:00:00Z');
      const market = createMockMarket('polymarket', 'market-1', 0.7);

      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([questionNoPrediction]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([
          {
            metaculusQuestion: questionNoPrediction,
            market,
            confidence: 0.9,
            method: 'high_similarity',
          },
        ]),
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const result = await detector.detect([market]);

      expect(result).toEqual([]);
    });

    it('detects divergence >= 5%', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const question = createMockQuestion(1, 'Test question', 0.65, twoDaysAgo.toISOString());
      const market = createMockMarket('polymarket', 'market-1', 0.70); // 5% divergence

      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([question]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([
          {
            metaculusQuestion: question,
            market,
            confidence: 0.9,
            method: 'high_similarity',
          },
        ]),
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const result = await detector.detect([market]);

      expect(result.length).toBe(1);
      expect(result[0].divergencePercent).toBe(5);
      expect(result[0].metaculusPrediction).toBe(0.65);
      expect(result[0].marketPrice).toBe(0.70);
    });

    it('ignores divergence < 5%', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const question = createMockQuestion(1, 'Test question', 0.65, twoDaysAgo.toISOString());
      const market = createMockMarket('polymarket', 'market-1', 0.68); // 3% divergence

      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([question]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([
          {
            metaculusQuestion: question,
            market,
            confidence: 0.9,
            method: 'high_similarity',
          },
        ]),
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const result = await detector.detect([market]);

      expect(result).toEqual([]);
    });

    it('includes all required fields in output', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const question = createMockQuestion(1, 'Test question', 0.60, twoDaysAgo.toISOString());
      const market = createMockMarket('polymarket', 'market-1', 0.70); // 10% divergence

      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([question]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([
          {
            metaculusQuestion: question,
            market,
            confidence: 0.85,
            method: 'high_similarity',
          },
        ]),
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const result = await detector.detect([market]);

      expect(result.length).toBe(1);
      const opportunity = result[0];

      // Verify all required fields
      expect(opportunity.type).toBe('metaculus_divergence');
      expect(opportunity.metaculusId).toBe(1);
      expect(opportunity.metaculusTitle).toBe('Test question');
      expect(opportunity.marketId).toBe('market-1');
      expect(opportunity.marketPlatform).toBe('polymarket');
      expect(opportunity.marketQuestion).toBe('Test market question?');
      expect(opportunity.metaculusPrediction).toBe(0.60);
      expect(opportunity.marketPrice).toBe(0.70);
      expect(opportunity.divergencePercent).toBe(10);
      expect(opportunity.matchConfidence).toBe(0.85);
      expect(opportunity.forecastTimestamp).toBe(twoDaysAgo.toISOString());
      expect(opportunity.forecastAge).toBe(2);
      expect(opportunity.isFresh).toBe(true);
      expect(opportunity.stalenessWarning).toBeUndefined();
      expect(opportunity.detectedAt).toBeGreaterThan(Date.now() - 1000);
    });

    it('sorts results by divergencePercent descending', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const question1 = createMockQuestion(1, 'Question 1', 0.65, twoDaysAgo.toISOString());
      const question2 = createMockQuestion(2, 'Question 2', 0.50, twoDaysAgo.toISOString());
      const market1 = createMockMarket('polymarket', 'market-1', 0.70); // 5% divergence
      const market2 = createMockMarket('kalshi', 'market-2', 0.65); // 15% divergence

      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([question1, question2]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([
          {
            metaculusQuestion: question1,
            market: market1,
            confidence: 0.9,
            method: 'high_similarity',
          },
          {
            metaculusQuestion: question2,
            market: market2,
            confidence: 0.85,
            method: 'high_similarity',
          },
        ]),
      };

      const detector = new MetaculusDivergenceDetector();
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const result = await detector.detect([market1, market2]);

      expect(result.length).toBe(2);
      expect(result[0].divergencePercent).toBe(15); // Highest first
      expect(result[1].divergencePercent).toBe(5);
    });
  });

  describe('checkStaleness', () => {
    it('returns isFresh: true for forecasts <= 7 days old', async () => {
      const detector = new MetaculusDivergenceDetector();

      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const result3Days = (detector as any).checkStaleness(threeDaysAgo.toISOString());
      expect(result3Days.isFresh).toBe(true);
      expect(result3Days.daysOld).toBe(3);
      expect(result3Days.warning).toBeUndefined();

      const result7Days = (detector as any).checkStaleness(sevenDaysAgo.toISOString());
      expect(result7Days.isFresh).toBe(true);
      expect(result7Days.daysOld).toBe(7);
      expect(result7Days.warning).toBeUndefined();
    });

    it('returns isFresh: false for forecasts > 7 days old', async () => {
      const detector = new MetaculusDivergenceDetector();

      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      const result = (detector as any).checkStaleness(eightDaysAgo.toISOString());

      expect(result.isFresh).toBe(false);
      expect(result.daysOld).toBe(8);
      expect(result.warning).toBeDefined();
    });

    it('sets warning for 7-14 day old forecasts', async () => {
      const detector = new MetaculusDivergenceDetector();

      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const result = (detector as any).checkStaleness(tenDaysAgo.toISOString());

      expect(result.isFresh).toBe(false);
      expect(result.daysOld).toBe(10);
      expect(result.warning).toContain('7-14 days old');
    });

    it('sets warning for 2-4 week old forecasts', async () => {
      const detector = new MetaculusDivergenceDetector();

      const now = new Date();
      const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

      const result = (detector as any).checkStaleness(twentyOneDaysAgo.toISOString());

      expect(result.isFresh).toBe(false);
      expect(result.daysOld).toBe(21);
      expect(result.warning).toContain('2-4 weeks old');
    });

    it('sets warning for 30+ day old forecasts', async () => {
      const detector = new MetaculusDivergenceDetector();

      const now = new Date();
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      const result = (detector as any).checkStaleness(fortyFiveDaysAgo.toISOString());

      expect(result.isFresh).toBe(false);
      expect(result.daysOld).toBe(45);
      expect(result.warning).toContain('45 days old - likely outdated');
    });

    it('calculates daysOld correctly', async () => {
      const detector = new MetaculusDivergenceDetector();

      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      const result = (detector as any).checkStaleness(fiveDaysAgo.toISOString());

      expect(result.daysOld).toBe(5);
      expect(result.lastUpdate).toEqual(fiveDaysAgo);
    });
  });

  describe('calculateDivergence', () => {
    it('calculates absolute difference as percentage', async () => {
      const detector = new MetaculusDivergenceDetector();

      const result1 = (detector as any).calculateDivergence(0.65, 0.70);
      expect(result1.divergencePercent).toBe(5);

      const result2 = (detector as any).calculateDivergence(0.65, 0.60);
      expect(result2.divergencePercent).toBe(5);

      const result3 = (detector as any).calculateDivergence(0.50, 0.65);
      expect(result3.divergencePercent).toBe(15);
    });

    it('returns hasDivergence true when >= threshold', async () => {
      const detector = new MetaculusDivergenceDetector();

      const result1 = (detector as any).calculateDivergence(0.65, 0.70);
      expect(result1.hasDivergence).toBe(true); // 5% = threshold

      const result2 = (detector as any).calculateDivergence(0.60, 0.75);
      expect(result2.hasDivergence).toBe(true); // 15% > threshold
    });

    it('returns hasDivergence false when < threshold', async () => {
      const detector = new MetaculusDivergenceDetector();

      const result = (detector as any).calculateDivergence(0.65, 0.68);
      expect(result.hasDivergence).toBe(false); // 3% < 5%
    });

    it('handles edge case of exactly 5%', async () => {
      const detector = new MetaculusDivergenceDetector();

      const result = (detector as any).calculateDivergence(0.50, 0.55);
      expect(result.divergencePercent).toBe(5);
      expect(result.hasDivergence).toBe(true);
    });
  });

  describe('custom minDivergence threshold', () => {
    it('respects custom threshold in constructor', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const question = createMockQuestion(1, 'Test question', 0.65, twoDaysAgo.toISOString());
      const market = createMockMarket('polymarket', 'market-1', 0.68); // 3% divergence

      const mockClient = {
        searchQuestions: vi.fn().mockResolvedValue([question]),
      };

      const mockMatcher = {
        matchToMarkets: vi.fn().mockReturnValue([
          {
            metaculusQuestion: question,
            market,
            confidence: 0.9,
            method: 'high_similarity',
          },
        ]),
      };

      // Create detector with 3% threshold
      const detector = new MetaculusDivergenceDetector(undefined, 3);
      (detector as any).client = mockClient;
      (detector as any).matcher = mockMatcher;

      const result = await detector.detect([market]);

      // Should detect with 3% threshold
      expect(result.length).toBe(1);
      expect(result[0].divergencePercent).toBe(3);
    });
  });
});

// Helper functions

function createMockMarket(platform: 'polymarket' | 'kalshi', id: string, yesPrice: number): Market {
  return {
    id,
    platform,
    question: 'Test market question?',
    outcomes: ['Yes', 'No'],
    prices: {
      Yes: yesPrice,
      No: 1 - yesPrice,
    },
    closeDate: '2024-12-31T23:59:59Z',
    volume: 10000,
    liquidity: 5000,
  };
}

function createMockQuestion(
  id: number,
  title: string,
  prediction: number | undefined,
  timestamp: string
): MetaculusQuestion {
  const question: MetaculusQuestion = {
    id,
    title,
    description: 'Test question description',
    type: 'binary',
    created_time: '2024-01-01T00:00:00Z',
    resolve_time: '2024-12-31T23:59:59Z',
    status: 'open',
  };

  if (prediction !== undefined) {
    question.community_prediction = {
      q2: prediction,
      timestamp,
    };
  }

  return question;
}
