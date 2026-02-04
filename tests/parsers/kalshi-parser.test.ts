import { describe, it, expect } from 'vitest';
import { KalshiSettlementParser, KalshiMarketData } from '../../src/parsers/kalshi-parser.js';

describe('KalshiSettlementParser', () => {
  const parser = new KalshiSettlementParser();

  describe('parse', () => {
    it('extracts basic market information', () => {
      const market: KalshiMarketData = {
        ticker: 'INXU-26FEB07-T3880',
        title: 'S&P 500 above 3880 on February 7?',
        rules_primary: 'This market resolves Yes if the S&P 500 index closes at or above 3880 on February 7, 2026.',
      };

      const result = parser.parse(market);

      expect(result.platform).toBe('kalshi');
      expect(result.marketId).toBe('INXU-26FEB07-T3880');
      expect(result.question).toBe('S&P 500 above 3880 on February 7?');
      expect(result.outcomes).toEqual(['Yes', 'No']);
    });

    it('extracts dates from rules text', () => {
      const market: KalshiMarketData = {
        ticker: 'TEST-MARKET',
        title: 'Test market',
        rules_primary: 'This market resolves based on data from June 15, 2026.',
      };

      const result = parser.parse(market);

      expect(result.extracted.dates.length).toBeGreaterThan(0);
      const dateStr = result.extracted.dates[0].toISOString();
      expect(dateStr).toContain('2026-06-15');
    });

    it('uses expiration_time for resolution date', () => {
      const market: KalshiMarketData = {
        ticker: 'TEST-EXP',
        title: 'Test expiration',
        rules_primary: 'Market rules here.',
        expiration_time: '2026-03-15T16:00:00Z',
      };

      const result = parser.parse(market);

      expect(result.resolutionDate).toBeDefined();
      expect(result.resolutionDate!.toISOString()).toContain('2026-03-15');
    });

    it('extracts data source from rules', () => {
      const market: KalshiMarketData = {
        ticker: 'UNEMP-TEST',
        title: 'Unemployment test',
        rules_primary: 'Resolves based on the Bureau of Labor Statistics report.',
      };

      const result = parser.parse(market);

      expect(result.dataSource).toBe('the Bureau of Labor Statistics report');
    });

    it('extracts domain from settlement_source_url', () => {
      const market: KalshiMarketData = {
        ticker: 'URL-TEST',
        title: 'URL source test',
        rules_primary: 'Market resolves when criteria are met.',
        settlement_source_url: 'https://www.bls.gov/news.release/empsit.nr0.htm',
      };

      const result = parser.parse(market);

      expect(result.dataSource).toBe('bls.gov');
    });

    it('prefers text-extracted source over URL domain', () => {
      const market: KalshiMarketData = {
        ticker: 'PREF-TEST',
        title: 'Preference test',
        rules_primary: 'Resolves according to Federal Reserve announcement.',
        settlement_source_url: 'https://www.federalreserve.gov/',
      };

      const result = parser.parse(market);

      expect(result.dataSource).toBe('Federal Reserve announcement');
    });

    it('handles scalar strike types', () => {
      const greaterMarket: KalshiMarketData = {
        ticker: 'SCALAR-GT',
        title: 'Greater than test',
        rules_primary: 'Resolves Yes if value > 100.',
        strike_type: 'greater',
      };

      const result = parser.parse(greaterMarket);

      expect(result.settlementType).toBe('scalar');
    });

    it('includes secondary rules', () => {
      const market: KalshiMarketData = {
        ticker: 'SEC-RULES',
        title: 'Secondary rules test',
        rules_primary: 'Main resolution criteria.',
        rules_secondary: 'Edge case: if data is revised, use initial release.',
      };

      const result = parser.parse(market);

      expect(result.primaryRule).toBe('Main resolution criteria.');
      expect(result.secondaryRule).toBe('Edge case: if data is revised, use initial release.');
    });

    it('extracts keywords from rules', () => {
      const market: KalshiMarketData = {
        ticker: 'KEYW-TEST',
        title: 'Keyword test',
        rules_primary: 'Market resolves based on unemployment rate from BLS employment report.',
      };

      const result = parser.parse(market);

      expect(result.extracted.keywords).toContain('unemployment');
      expect(result.extracted.keywords).toContain('rate');
      expect(result.extracted.keywords).toContain('employment');
      expect(result.extracted.keywords).toContain('report');
    });

    it('extracts named entities', () => {
      const market: KalshiMarketData = {
        ticker: 'ENT-TEST',
        title: 'Will Jerome Powell announce rate cut?',
        rules_primary: 'Based on Federal Reserve FOMC meeting statement.',
      };

      const result = parser.parse(market);

      expect(result.extracted.entities).toContain('Jerome Powell');
      expect(result.extracted.entities).toContain('Federal Reserve');
    });
  });

  describe('extractKeywords', () => {
    it('filters stop words and short words', () => {
      const keywords = parser.extractKeywords('The market will be resolved by the committee.');

      expect(keywords).toContain('market');
      expect(keywords).toContain('resolved');
      expect(keywords).toContain('committee');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('will');
      expect(keywords).not.toContain('be');
      expect(keywords).not.toContain('by');
    });
  });

  describe('extractDataSource', () => {
    it('handles multiple patterns', () => {
      expect(parser.extractDataSource('published by Reuters')).toBe('Reuters');
      expect(parser.extractDataSource('per SEC filings')).toBe('SEC filings');
      expect(parser.extractDataSource('official data from Treasury')).toBe('Treasury');
    });

    it('returns undefined when no pattern matches', () => {
      const source = parser.extractDataSource('This market will resolve when complete.');

      expect(source).toBeUndefined();
    });
  });

  describe('extractDomainFromUrl', () => {
    it('extracts domain without www', () => {
      expect(parser.extractDomainFromUrl('https://www.example.com/path')).toBe('example.com');
      expect(parser.extractDomainFromUrl('https://bls.gov/data')).toBe('bls.gov');
    });

    it('returns undefined for invalid URLs', () => {
      expect(parser.extractDomainFromUrl('not-a-url')).toBeUndefined();
      expect(parser.extractDomainFromUrl(undefined)).toBeUndefined();
    });
  });
});
