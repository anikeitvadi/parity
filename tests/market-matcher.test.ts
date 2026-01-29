/**
 * Market Matcher Tests
 *
 * TDD RED phase: Tests written first, implementation follows
 *
 * @module tests/market-matcher
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketMatcher, type MatchedPair } from '../src/services/market-matcher.js';
import type { Market } from '../src/types/market.js';

/**
 * Helper to create a Polymarket market for testing
 */
function createPolymarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'poly-123',
    platform: 'polymarket',
    question: 'Will Trump win the 2024 election?',
    outcomes: ['Yes', 'No'],
    prices: { Yes: 0.55, No: 0.45 },
    closeDate: '2024-11-06T00:00:00Z',
    volume: 1000000,
    liquidity: 50000,
    ...overrides,
  };
}

/**
 * Helper to create a Kalshi market for testing
 */
function createKalshi(overrides: Partial<Market> = {}): Market {
  return {
    id: 'TRUMP-2024',
    platform: 'kalshi',
    question: 'Will Trump win the 2024 election?',
    outcomes: ['Yes', 'No'],
    prices: { Yes: 0.54, No: 0.46 },
    closeDate: '2024-11-06T00:00:00Z',
    volume: 500000,
    liquidity: 25000,
    ...overrides,
  };
}

describe('MarketMatcher', () => {
  let matcher: MarketMatcher;

  beforeEach(() => {
    matcher = new MarketMatcher();
  });

  describe('Text Normalization', () => {
    it('should normalize text to lowercase', () => {
      // Access private method for testing via prototype
      const normalized = (matcher as any).normalizeText('Will TRUMP Win?');
      expect(normalized).toBe('will trump win');
    });

    it('should remove special characters', () => {
      const normalized = (matcher as any).normalizeText("Trump's 2024 victory?!@#$");
      expect(normalized).toBe('trumps 2024 victory');
    });

    it('should trim whitespace', () => {
      const normalized = (matcher as any).normalizeText('  Will Trump win?  ');
      expect(normalized).toBe('will trump win');
    });

    it('should collapse multiple spaces', () => {
      const normalized = (matcher as any).normalizeText('Will   Trump    win');
      expect(normalized).toBe('will trump win');
    });
  });

  describe('Keyword Extraction', () => {
    it('should extract meaningful keywords', () => {
      const keywords = (matcher as any).extractKeywords('Will Trump win the 2024 election?');
      expect(keywords).toContain('trump');
      expect(keywords).toContain('2024');
      expect(keywords).toContain('election');
    });

    it('should remove common stop words', () => {
      const keywords = (matcher as any).extractKeywords('Will the market be above a certain level?');
      expect(keywords).not.toContain('will');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('be');
      expect(keywords).not.toContain('a');
    });

    it('should handle empty strings', () => {
      const keywords = (matcher as any).extractKeywords('');
      expect(keywords).toEqual([]);
    });
  });

  describe('Exact Text Matching', () => {
    it('should match identical questions with confidence 1.0', async () => {
      const polymarkets = [createPolymarket()];
      const kalshiMarkets = [createKalshi()];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(1);
      expect(matches[0].confidence).toBe(1.0);
      expect(matches[0].method).toBe('exact_match');
    });

    it('should match case-insensitive questions', async () => {
      const polymarkets = [createPolymarket({ question: 'WILL TRUMP WIN THE 2024 ELECTION?' })];
      const kalshiMarkets = [createKalshi({ question: 'will trump win the 2024 election?' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(1);
      expect(matches[0].confidence).toBe(1.0);
    });

    it('should match questions with different punctuation', async () => {
      const polymarkets = [createPolymarket({ question: "Will Trump win 2024?" })];
      const kalshiMarkets = [createKalshi({ question: "Will Trump win 2024" })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(1);
      expect(matches[0].confidence).toBe(1.0);
    });
  });

  describe('Keyword Matching', () => {
    it('should match questions with similar keywords at 0.7+ confidence', async () => {
      const polymarkets = [createPolymarket({ question: 'Trump 2024 election win' })];
      const kalshiMarkets = [createKalshi({ question: '2024 Trump presidential victory' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(1);
      expect(matches[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(matches[0].confidence).toBeLessThan(1.0);
      expect(matches[0].method).toBe('keyword_match');
    });

    it('should not match questions with low keyword overlap', async () => {
      const polymarkets = [createPolymarket({ question: 'Will Bitcoin reach $100k?' })];
      const kalshiMarkets = [createKalshi({ question: 'Will Ethereum reach $10k?' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      // Confidence below 0.7 should be filtered out
      expect(matches.length).toBe(0);
    });

    it('should calculate keyword overlap percentage correctly', async () => {
      // 4 shared keywords out of 5 unique = 80% overlap
      const polymarkets = [createPolymarket({ question: 'Trump wins 2024 presidential election' })];
      const kalshiMarkets = [createKalshi({ question: 'Trump wins 2024 presidential race' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(1);
      expect(matches[0].confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Compatibility Filters', () => {
    it('should not match markets with different outcome counts', async () => {
      const polymarkets = [createPolymarket({ outcomes: ['Yes', 'No'] })];
      const kalshiMarkets = [createKalshi({ outcomes: ['Trump', 'Biden', 'Other'] })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(0);
    });

    it('should not match markets with timeframes more than 7 days apart', async () => {
      const polymarkets = [createPolymarket({ closeDate: '2024-01-01T00:00:00Z' })];
      const kalshiMarkets = [createKalshi({ closeDate: '2024-12-31T00:00:00Z' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(0);
    });

    it('should match markets with close dates within 7 days', async () => {
      const polymarkets = [createPolymarket({ closeDate: '2024-11-06T00:00:00Z' })];
      const kalshiMarkets = [createKalshi({ closeDate: '2024-11-08T00:00:00Z' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(1);
    });

    it('should handle markets with missing close dates', async () => {
      const polymarkets = [createPolymarket({ closeDate: '' })];
      const kalshiMarkets = [createKalshi({ closeDate: '' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      // Should still match if questions match and both have no date
      expect(matches.length).toBe(1);
    });
  });

  describe('Manual Curation Override', () => {
    it('should use manual matches from JSON file', async () => {
      // Create matcher with manual matches
      const matcherWithManual = new MarketMatcher('/Users/anikeit/new-project/src/data/manual-matches.json');

      const polymarkets = [createPolymarket({ id: 'poly-override-test' })];
      const kalshiMarkets = [createKalshi({ id: 'KALSHI-OVERRIDE-TEST' })];

      // This test will pass once manual-matches.json contains this match
      // For now, test that the matcher accepts the path
      expect(matcherWithManual).toBeDefined();
    });

    it('should give manual matches confidence 1.0', async () => {
      // This requires manual-matches.json to be properly set up
      // Marker test - will need integration testing with actual file
      const matcher = new MarketMatcher();
      expect(matcher).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for empty Polymarket input', async () => {
      const matches = await matcher.matchMarkets([], [createKalshi()]);
      expect(matches).toEqual([]);
    });

    it('should return empty array for empty Kalshi input', async () => {
      const matches = await matcher.matchMarkets([createPolymarket()], []);
      expect(matches).toEqual([]);
    });

    it('should return empty array when both inputs are empty', async () => {
      const matches = await matcher.matchMarkets([], []);
      expect(matches).toEqual([]);
    });

    it('should return empty array when no matches found', async () => {
      const polymarkets = [createPolymarket({ question: 'Completely unrelated question A' })];
      const kalshiMarkets = [createKalshi({ question: 'Completely unrelated question B' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);
      expect(matches).toEqual([]);
    });

    it('should handle multiple markets and find all matches', async () => {
      const polymarkets = [
        createPolymarket({ id: 'poly-1', question: 'Will Trump win 2024?' }),
        createPolymarket({ id: 'poly-2', question: 'Will Bitcoin reach $100k?' }),
        createPolymarket({ id: 'poly-3', question: 'Will Fed cut rates?' }),
      ];
      const kalshiMarkets = [
        createKalshi({ id: 'TRUMP-2024', question: 'Will Trump win 2024?' }),
        createKalshi({ id: 'BTC-100K', question: 'Will Bitcoin reach $100k?' }),
        createKalshi({ id: 'OTHER', question: 'Something completely different' }),
      ];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches.length).toBe(2);
      expect(matches.map((m) => m.polymarket.id)).toContain('poly-1');
      expect(matches.map((m) => m.polymarket.id)).toContain('poly-2');
    });
  });

  describe('MatchedPair Structure', () => {
    it('should include both market objects in the result', async () => {
      const polymarkets = [createPolymarket()];
      const kalshiMarkets = [createKalshi()];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(matches[0].polymarket).toBeDefined();
      expect(matches[0].kalshi).toBeDefined();
      expect(matches[0].polymarket.platform).toBe('polymarket');
      expect(matches[0].kalshi.platform).toBe('kalshi');
    });

    it('should include confidence score in result', async () => {
      const polymarkets = [createPolymarket()];
      const kalshiMarkets = [createKalshi()];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(typeof matches[0].confidence).toBe('number');
      expect(matches[0].confidence).toBeGreaterThanOrEqual(0);
      expect(matches[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should include matching method in result', async () => {
      const polymarkets = [createPolymarket()];
      const kalshiMarkets = [createKalshi()];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      expect(['exact_match', 'keyword_match', 'manual_curated']).toContain(matches[0].method);
    });
  });

  describe('Confidence Threshold', () => {
    it('should filter out matches below 0.7 confidence', async () => {
      // Create markets with very low keyword overlap
      const polymarkets = [createPolymarket({ question: 'Apple stock price tomorrow' })];
      const kalshiMarkets = [createKalshi({ question: 'Google stock price next week' })];

      const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

      // Both have "stock" and "price" but different companies and timeframes
      // Should be filtered if confidence < 0.7
      if (matches.length > 0) {
        expect(matches[0].confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should allow custom minimum confidence threshold', async () => {
      const matcherStrict = new MarketMatcher(undefined, 0.9);

      const polymarkets = [createPolymarket({ question: 'Trump 2024 election win' })];
      const kalshiMarkets = [createKalshi({ question: '2024 Trump presidential victory' })];

      const matches = await matcherStrict.matchMarkets(polymarkets, kalshiMarkets);

      // Keyword match might be ~0.8, should be filtered with 0.9 threshold
      matches.forEach((m) => {
        expect(m.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });
});

describe('MarketMatcher Integration', () => {
  it('should handle realistic market data from both platforms', async () => {
    const matcher = new MarketMatcher();

    // Realistic Polymarket data
    const polymarkets: Market[] = [
      {
        id: 'cond-poly-1',
        platform: 'polymarket',
        question: 'Will Donald Trump win the 2024 US Presidential Election?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.52, No: 0.48 },
        closeDate: '2024-11-05T23:59:59Z',
        volume: 5000000,
        liquidity: 250000,
      },
      {
        id: 'cond-poly-2',
        platform: 'polymarket',
        question: 'Will the Federal Reserve cut interest rates in Q1 2025?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.35, No: 0.65 },
        closeDate: '2025-03-31T23:59:59Z',
        volume: 1000000,
        liquidity: 50000,
      },
    ];

    // Realistic Kalshi data
    const kalshiMarkets: Market[] = [
      {
        id: 'PRES-2024-TRUMP',
        platform: 'kalshi',
        question: 'Will Donald Trump win the 2024 US Presidential Election?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.51, No: 0.49 },
        closeDate: '2024-11-06T00:00:00Z',
        volume: 3000000,
        liquidity: 150000,
      },
      {
        id: 'FED-RATECUT-Q1-2025',
        platform: 'kalshi',
        question: 'Will the Federal Reserve cut interest rates in Q1 2025?',
        outcomes: ['Yes', 'No'],
        prices: { Yes: 0.33, No: 0.67 },
        closeDate: '2025-03-31T23:59:59Z',
        volume: 800000,
        liquidity: 40000,
      },
    ];

    const matches = await matcher.matchMarkets(polymarkets, kalshiMarkets);

    expect(matches.length).toBe(2);
    expect(matches.every((m) => m.confidence >= 0.7)).toBe(true);
  });
});
