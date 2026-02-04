import { describe, it, expect } from 'vitest';
import { PolymarketSettlementParser, PolymarketMarketData } from '../../src/parsers/polymarket-parser.js';

describe('PolymarketSettlementParser', () => {
  const parser = new PolymarketSettlementParser();

  describe('parse', () => {
    it('extracts basic market information', () => {
      const market: PolymarketMarketData = {
        id: 'poly-123',
        question: 'Will Bitcoin reach $100k by January 2026?',
        description: 'This market resolves YES if BTC price exceeds $100,000 according to CoinGecko.',
        outcomes: ['Yes', 'No'],
      };

      const result = parser.parse(market);

      expect(result.platform).toBe('polymarket');
      expect(result.marketId).toBe('poly-123');
      expect(result.question).toBe('Will Bitcoin reach $100k by January 2026?');
      expect(result.settlementType).toBe('binary');
    });

    it('extracts dates from question text', () => {
      const market: PolymarketMarketData = {
        id: 'poly-456',
        question: 'Will the Fed raise rates on March 15, 2026?',
        outcomes: ['Yes', 'No'],
      };

      const result = parser.parse(market);

      expect(result.extracted.dates.length).toBeGreaterThan(0);
      const dateStr = result.extracted.dates[0].toISOString();
      expect(dateStr).toContain('2026-03-15');
    });

    it('uses end_date_iso for resolution date when available', () => {
      const market: PolymarketMarketData = {
        id: 'poly-789',
        question: 'Will event X happen?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2026-06-01T00:00:00Z',
      };

      const result = parser.parse(market);

      expect(result.resolutionDate).toBeDefined();
      expect(result.resolutionDate!.toISOString()).toContain('2026-06-01');
    });

    it('extracts data source from description', () => {
      const market: PolymarketMarketData = {
        id: 'poly-abc',
        question: 'Will unemployment rise?',
        description: 'Resolves based on BLS data from the Bureau of Labor Statistics.',
        outcomes: ['Yes', 'No'],
      };

      const result = parser.parse(market);

      expect(result.dataSource).toContain('BLS');
    });

    it('uses resolution_source field when provided', () => {
      const market: PolymarketMarketData = {
        id: 'poly-def',
        question: 'Will X happen?',
        outcomes: ['Yes', 'No'],
        resolution_source: 'Official government source',
      };

      const result = parser.parse(market);

      expect(result.dataSource).toBe('Official government source');
    });

    it('extracts keywords from question', () => {
      const market: PolymarketMarketData = {
        id: 'poly-keywords',
        question: 'Will Trump win the 2028 presidential election?',
        outcomes: ['Yes', 'No'],
      };

      const result = parser.parse(market);

      expect(result.extracted.keywords).toContain('trump');
      expect(result.extracted.keywords).toContain('presidential');
      expect(result.extracted.keywords).toContain('election');
      // Stop words filtered
      expect(result.extracted.keywords).not.toContain('will');
      expect(result.extracted.keywords).not.toContain('the');
    });

    it('extracts named entities', () => {
      const market: PolymarketMarketData = {
        id: 'poly-entities',
        question: 'Will Elon Musk acquire Twitter?',
        description: 'Based on SEC filings and public announcements from Tesla Inc.',
        outcomes: ['Yes', 'No'],
      };

      const result = parser.parse(market);

      expect(result.extracted.entities).toContain('Elon Musk');
      expect(result.extracted.entities).toContain('Twitter');
    });

    it('handles categorical markets', () => {
      const market: PolymarketMarketData = {
        id: 'poly-categorical',
        question: 'Who will win the election?',
        outcomes: ['Candidate A', 'Candidate B', 'Candidate C'],
      };

      const result = parser.parse(market);

      expect(result.settlementType).toBe('categorical');
    });
  });

  describe('extractKeywords', () => {
    it('filters stop words', () => {
      const keywords = parser.extractKeywords('Will the president be elected in the year?');

      expect(keywords).toContain('president');
      expect(keywords).toContain('elected');
      expect(keywords).toContain('year');
      expect(keywords).not.toContain('will');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('be');
      expect(keywords).not.toContain('in');
    });

    it('filters short words', () => {
      const keywords = parser.extractKeywords('Is it a yes or no?');

      // 'yes' and 'no' are stop words
      // 'is', 'it', 'a', 'or' are too short or stop words
      expect(keywords).toHaveLength(0);
    });
  });

  describe('extractEntities', () => {
    it('extracts capitalized names', () => {
      const entities = parser.extractEntities('Joe Biden met with Vladimir Putin in Geneva.');

      expect(entities).toContain('Joe Biden');
      expect(entities).toContain('Vladimir Putin');
      expect(entities).toContain('Geneva');
    });

    it('deduplicates entities', () => {
      const entities = parser.extractEntities('Trump said Trump would. Trump mentioned.');

      expect(entities.filter(e => e === 'Trump')).toHaveLength(1);
    });
  });

  describe('extractDataSource', () => {
    it('extracts "according to" sources', () => {
      const source = parser.extractDataSource('Resolves according to the Federal Reserve announcement.');

      expect(source).toBe('the Federal Reserve announcement');
    });

    it('extracts "as reported by" sources', () => {
      const source = parser.extractDataSource('Price as reported by CoinGecko at midnight UTC.');

      expect(source).toBe('CoinGecko at midnight UTC');
    });

    it('returns undefined when no source found', () => {
      const source = parser.extractDataSource('This market resolves when the event happens.');

      expect(source).toBeUndefined();
    });
  });
});
