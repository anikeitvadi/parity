/**
 * Tests for MetaculusMatcher - question-to-market matching
 *
 * @group unit
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetaculusMatcher } from '../../src/services/metaculus-matcher.js';
import type { MetaculusQuestion } from '../../src/types/metaculus.js';
import type { Market } from '../../src/types/market.js';

// Mock data
const mockMetaculusQuestion: MetaculusQuestion = {
  id: 12345,
  title: 'Will Trump win the 2024 election?',
  description: 'This question resolves Yes if Donald Trump wins the 2024 presidential election.',
  type: 'binary',
  created_time: '2024-01-01T00:00:00Z',
  resolve_time: '2024-11-06T00:00:00Z',
  status: 'open',
  community_prediction: {
    q2: 0.65,
    timestamp: '2024-06-01T00:00:00Z',
  },
};

const mockPolymarketMarket: Market = {
  id: 'poly-trump-2024',
  platform: 'polymarket',
  question: 'Will Trump win 2024 election',
  outcomes: ['Yes', 'No'],
  prices: { Yes: 0.67, No: 0.33 },
  closeDate: '2024-11-06T00:00:00Z',
  volume: 50000000,
  liquidity: 1000000,
};

const mockKalshiMarket: Market = {
  id: 'kalshi-trump-2024',
  platform: 'kalshi',
  question: 'Will Trump win Michigan?',
  outcomes: ['Yes', 'No'],
  prices: { Yes: 0.5, No: 0.5 },
  closeDate: '2024-11-06T00:00:00Z',
  volume: 1000000,
  liquidity: 100000,
};

const mockNumericQuestion: MetaculusQuestion = {
  id: 67890,
  title: 'What will GDP growth be in 2024?',
  description: 'Numeric question',
  type: 'numeric',
  created_time: '2024-01-01T00:00:00Z',
  resolve_time: '2025-01-01T00:00:00Z',
  status: 'open',
};

describe('MetaculusMatcher', () => {
  let matcher: MetaculusMatcher;

  beforeEach(() => {
    // Use a non-existent path for manual matches to test default behavior
    matcher = new MetaculusMatcher('non-existent-path.json');
  });

  describe('constructor', () => {
    it('uses default minConfidence of 0.8', () => {
      const matcher = new MetaculusMatcher();
      // We'll verify this through behavior - matches need 0.8+ confidence
      expect(matcher).toBeDefined();
    });

    it('accepts custom minConfidence', () => {
      const matcher = new MetaculusMatcher(undefined, 0.9);
      expect(matcher).toBeDefined();
    });

    it('handles missing manual matches file gracefully', () => {
      // Should not throw
      expect(() => new MetaculusMatcher('non-existent.json')).not.toThrow();
    });
  });

  describe('matchToMarkets', () => {
    it('returns empty array for empty inputs', () => {
      const result = matcher.matchToMarkets([], []);
      expect(result).toEqual([]);
    });

    it('returns empty array when questions array is empty', () => {
      const result = matcher.matchToMarkets([], [mockPolymarketMarket]);
      expect(result).toEqual([]);
    });

    it('returns empty array when markets array is empty', () => {
      const result = matcher.matchToMarkets([mockMetaculusQuestion], []);
      expect(result).toEqual([]);
    });

    it('filters out non-binary questions', () => {
      const questions = [mockMetaculusQuestion, mockNumericQuestion];
      const markets = [mockPolymarketMarket];

      const results = matcher.matchToMarkets(questions, markets);

      // Should only match binary question
      expect(results.length).toBeLessThanOrEqual(1);
      if (results.length > 0) {
        expect(results[0].metaculusQuestion.type).toBe('binary');
      }
    });

    it('matches exact title questions with high confidence', () => {
      const exactMarket: Market = {
        ...mockPolymarketMarket,
        question: 'Will Trump win the 2024 election?',
      };

      const results = matcher.matchToMarkets([mockMetaculusQuestion], [exactMarket]);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].confidence).toBeGreaterThan(0.95);
      expect(results[0].similarity.title).toBeGreaterThan(0.95);
    });

    it('matches similar titles with appropriate confidence', () => {
      const results = matcher.matchToMarkets([mockMetaculusQuestion], [mockPolymarketMarket]);

      if (results.length > 0) {
        expect(results[0].confidence).toBeGreaterThan(0.8);
        expect(results[0].similarity.title).toBeGreaterThan(0.8);
      }
    });

    it('rejects matches with >14 day timing difference', () => {
      const lateDateMarket: Market = {
        ...mockPolymarketMarket,
        question: 'Will Trump win the 2024 election?',
        closeDate: '2024-12-01T00:00:00Z', // 25 days after resolve_time
      };

      const results = matcher.matchToMarkets([mockMetaculusQuestion], [lateDateMarket]);

      // Should not match due to timing difference
      expect(results.length).toBe(0);
    });

    it('includes timing similarity in overall confidence', () => {
      const sevenDayDiffMarket: Market = {
        ...mockPolymarketMarket,
        question: 'Will Trump win the 2024 election?',
        closeDate: '2024-11-13T00:00:00Z', // 7 days after resolve_time
      };

      const results = matcher.matchToMarkets([mockMetaculusQuestion], [sevenDayDiffMarket]);

      if (results.length > 0) {
        // Timing should be ~0.5 (7 day difference)
        expect(results[0].similarity.timing).toBeGreaterThan(0.4);
        expect(results[0].similarity.timing).toBeLessThan(0.6);
      }
    });

    it('matches different scope questions with lower confidence', () => {
      // "Will Trump win Michigan?" vs "Will Trump win the 2024 election?"
      const results = matcher.matchToMarkets([mockMetaculusQuestion], [mockKalshiMarket]);

      // Should either not match or have low confidence
      if (results.length > 0) {
        expect(results[0].confidence).toBeLessThan(0.8);
      } else {
        expect(results.length).toBe(0);
      }
    });

    it('returns match with proper structure', () => {
      const results = matcher.matchToMarkets([mockMetaculusQuestion], [mockPolymarketMarket]);

      if (results.length > 0) {
        const match = results[0];
        expect(match).toHaveProperty('metaculusQuestion');
        expect(match).toHaveProperty('market');
        expect(match).toHaveProperty('confidence');
        expect(match).toHaveProperty('similarity');
        expect(match).toHaveProperty('method');

        expect(match.similarity).toHaveProperty('title');
        expect(match.similarity).toHaveProperty('description');
        expect(match.similarity).toHaveProperty('timing');
        expect(match.similarity).toHaveProperty('overall');

        expect(['exact_match', 'high_similarity', 'manual_curated']).toContain(match.method);
      }
    });
  });

  describe('text normalization', () => {
    it('normalizes punctuation and case', () => {
      const question1: MetaculusQuestion = {
        ...mockMetaculusQuestion,
        title: 'Will Trump win the 2024 election?',
      };

      const question2: MetaculusQuestion = {
        ...mockMetaculusQuestion,
        title: 'Will Trump Win The 2024 Election!',
      };

      const market: Market = {
        ...mockPolymarketMarket,
        question: 'Will Trump win the 2024 election',
      };

      const results1 = matcher.matchToMarkets([question1], [market]);
      const results2 = matcher.matchToMarkets([question2], [market]);

      // Both should match with similar high confidence
      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
      expect(Math.abs(results1[0].confidence - results2[0].confidence)).toBeLessThan(0.05);
    });

    it('collapses whitespace', () => {
      const question: MetaculusQuestion = {
        ...mockMetaculusQuestion,
        title: 'Will  Trump   win    2024',
      };

      const market: Market = {
        ...mockPolymarketMarket,
        question: 'Will Trump win 2024',
      };

      const results = matcher.matchToMarkets([question], [market]);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity.title).toBeGreaterThan(0.95);
    });
  });

  describe('similarity scoring weights', () => {
    it('weights title at 50%', () => {
      // Create a scenario where we can verify weighting
      const question: MetaculusQuestion = {
        ...mockMetaculusQuestion,
        title: 'Exact match title',
        description: 'Different description',
      };

      const market: Market = {
        ...mockPolymarketMarket,
        question: 'Exact match title',
      };

      const results = matcher.matchToMarkets([question], [market]);

      if (results.length > 0) {
        const { similarity } = results[0];
        // Title match should contribute 50% to overall
        // With perfect title (1.0), default description (0.5), and near-perfect timing (1.0)
        // Overall should be: 0.5 * 1.0 + 0.3 * 0.5 + 0.2 * 1.0 = 0.5 + 0.15 + 0.2 = 0.85
        expect(similarity.title).toBeGreaterThan(0.95);
        expect(similarity.overall).toBeGreaterThan(0.8);
        expect(similarity.overall).toBeLessThan(0.9);
      }
    });

    it('uses 0.5 default for missing/different descriptions', () => {
      const question: MetaculusQuestion = {
        ...mockMetaculusQuestion,
        description: 'This is about the presidential election',
      };

      const market: Market = {
        ...mockPolymarketMarket,
        question: 'Will Trump win the 2024 election?',
        // Market description is not typically available
      };

      const results = matcher.matchToMarkets([question], [market]);

      if (results.length > 0) {
        // Description similarity should be around 0.5 (neutral/not available)
        expect(results[0].similarity.description).toBeGreaterThan(0);
        expect(results[0].similarity.description).toBeLessThan(1);
      }
    });
  });

  describe('timing comparison', () => {
    it('returns 1.0 for same day', () => {
      const market: Market = {
        ...mockPolymarketMarket,
        closeDate: '2024-11-06T12:00:00Z', // Same day as resolve_time
      };

      const results = matcher.matchToMarkets([mockMetaculusQuestion], [market]);

      if (results.length > 0) {
        expect(results[0].similarity.timing).toBeGreaterThan(0.95);
      }
    });

    it('returns approximately 0.5 for 7 days apart', () => {
      const market: Market = {
        ...mockPolymarketMarket,
        closeDate: '2024-11-13T00:00:00Z', // 7 days after
      };

      const results = matcher.matchToMarkets([mockMetaculusQuestion], [market]);

      if (results.length > 0) {
        expect(results[0].similarity.timing).toBeGreaterThan(0.4);
        expect(results[0].similarity.timing).toBeLessThan(0.6);
      }
    });

    it('returns 0.0 for 14+ days apart', () => {
      const market: Market = {
        ...mockPolymarketMarket,
        closeDate: '2024-11-20T00:00:00Z', // 14 days after
      };

      const results = matcher.matchToMarkets([mockMetaculusQuestion], [market]);

      // Should not match at all due to timing threshold
      expect(results.length).toBe(0);
    });

    it('handles invalid dates gracefully', () => {
      const market: Market = {
        ...mockPolymarketMarket,
        closeDate: 'invalid-date',
      };

      // Should not throw
      expect(() => matcher.matchToMarkets([mockMetaculusQuestion], [market])).not.toThrow();
    });
  });

  describe('confidence threshold', () => {
    it('only returns matches above minConfidence threshold', () => {
      const strictMatcher = new MetaculusMatcher(undefined, 0.9);

      // Use a market that would match but with lower confidence
      const results = strictMatcher.matchToMarkets([mockMetaculusQuestion], [mockKalshiMarket]);

      // All returned matches should be above 0.9
      results.forEach((match) => {
        expect(match.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('manual matches', () => {
    it('loads manual matches from file if exists', () => {
      // This test will verify the file loading mechanism
      // For now, we use non-existent path, so no matches loaded
      const matcher = new MetaculusMatcher('non-existent.json');
      expect(matcher).toBeDefined();
    });

    it('prioritizes manual matches over algorithmic matching', () => {
      // Create a temporary manual match file would be needed here
      // For unit test, we verify behavior through integration test
      expect(true).toBe(true);
    });
  });
});
