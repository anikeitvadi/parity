/**
 * Kalshi settlement rule parser
 *
 * Extracts settlement criteria from Kalshi market metadata.
 * Kalshi provides more structured data (rules_primary, rules_secondary)
 * compared to Polymarket's free-text descriptions.
 *
 * @module parsers/kalshi-parser
 */

import * as chrono from 'chrono-node';
import type { SettlementCriteria } from '../types/settlement.js';

/** Stop words to filter from keyword extraction */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'will', 'be', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'done',
  'this', 'that', 'these', 'those', 'it', 'its', 'they',
  'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'yes', 'no', 'not', 'more', 'than', 'before', 'after',
]);

/** Kalshi strike types */
export type KalshiStrikeType = 'greater' | 'less' | 'between' | 'functional' | 'custom';

/** Kalshi market data structure (subset of fields we need) */
export interface KalshiMarketData {
  ticker: string;
  title: string;
  rules_primary: string;
  rules_secondary?: string;
  strike_type?: KalshiStrikeType;
  expiration_time?: string;
  settlement_source_url?: string;
}

/**
 * Parser for extracting settlement criteria from Kalshi markets.
 *
 * Key parsing targets:
 * - title: Market question/title
 * - rules_primary: Main resolution criteria (Kalshi-specific)
 * - rules_secondary: Edge cases and clarifications
 * - strike_type: Type of settlement (greater/less/between/etc)
 * - expiration_time: When market resolves
 * - settlement_source_url: Official data source
 */
export class KalshiSettlementParser {
  /**
   * Parse Kalshi market data into settlement criteria.
   *
   * @param market - Kalshi market data
   * @returns Extracted settlement criteria
   */
  parse(market: KalshiMarketData): SettlementCriteria {
    const text = this.buildFullText(market);

    // Extract dates from text using chrono-node
    const parsedDates = chrono.parse(text);
    const dates = parsedDates
      .map(result => result.start.date())
      .filter((date): date is Date => date !== null);

    // Get resolution date from expiration_time first, then parsed dates
    let resolutionDate: Date | undefined;
    if (market.expiration_time) {
      const expDate = new Date(market.expiration_time);
      if (!isNaN(expDate.getTime())) {
        resolutionDate = expDate;
      }
    }
    if (!resolutionDate && dates.length > 0) {
      resolutionDate = dates.reduce((latest, date) =>
        date > latest ? date : latest
      );
    }

    // Extract keywords from rules_primary (most relevant for matching)
    const keywords = this.extractKeywords(market.rules_primary);

    // Extract named entities from full text
    const entities = this.extractEntities(text);

    // Extract data source from rules or dedicated field
    const dataSource = this.extractDataSource(market.rules_primary) ||
                       this.extractDomainFromUrl(market.settlement_source_url);

    return {
      platform: 'kalshi',
      marketId: market.ticker,
      question: market.title,
      primaryRule: market.rules_primary,
      secondaryRule: market.rules_secondary,
      outcomes: ['Yes', 'No'], // Kalshi is always binary
      resolutionDate,
      dataSource,
      settlementType: this.mapStrikeTypeToSettlement(market.strike_type),
      extracted: {
        dates,
        keywords,
        entities,
      },
    };
  }

  /**
   * Build full text for parsing.
   */
  private buildFullText(market: KalshiMarketData): string {
    const parts = [market.title, market.rules_primary];
    if (market.rules_secondary) {
      parts.push(market.rules_secondary);
    }
    return parts.join(' ');
  }

  /**
   * Extract keywords from text, filtering stop words.
   */
  extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  }

  /**
   * Extract named entities (capitalized multi-word phrases).
   */
  extractEntities(text: string): string[] {
    // Common sentence-starting words to filter out
    const sentenceStarters = new Set([
      'Will', 'Can', 'Does', 'Is', 'Are', 'Was', 'Were', 'Has', 'Have',
      'Should', 'Would', 'Could', 'May', 'Might', 'Must', 'The', 'This',
      'That', 'These', 'Those', 'What', 'When', 'Where', 'Why', 'How', 'Who',
      'Based', 'According', 'Per', 'From', 'Market', 'Resolves'
    ]);

    const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

    // Process matches: strip sentence starters from the beginning
    const processed = matches.map(entity => {
      const words = entity.split(' ');
      // Remove leading sentence starters
      while (words.length > 0 && sentenceStarters.has(words[0])) {
        words.shift();
      }
      return words.join(' ');
    }).filter(entity => entity.length > 0);

    return [...new Set(processed)];
  }

  /**
   * Extract data source from resolution text.
   */
  extractDataSource(text: string): string | undefined {
    const patterns = [
      // More specific patterns first
      /official data from ([^,.]+)/i,
      /as reported by ([^,.]+)/i,
      /published by ([^,.]+)/i,
      /according to ([^,.]+)/i,
      /based on ([^,.]+)/i,
      /data from ([^,.]+)/i,
      /source: ([^,.]+)/i,
      /per ([^,.]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Extract domain name from settlement source URL.
   */
  extractDomainFromUrl(url?: string): string | undefined {
    if (!url) return undefined;

    try {
      const parsed = new URL(url);
      // Return domain without www
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }

  /**
   * Map Kalshi strike type to our settlement type.
   */
  private mapStrikeTypeToSettlement(
    strikeType?: KalshiStrikeType
  ): 'binary' | 'scalar' | 'categorical' {
    if (!strikeType) return 'binary';

    switch (strikeType) {
      case 'greater':
      case 'less':
      case 'between':
        return 'scalar';
      case 'functional':
      case 'custom':
      default:
        return 'binary';
    }
  }
}
