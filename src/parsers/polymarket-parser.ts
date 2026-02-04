/**
 * Polymarket settlement rule parser
 *
 * Extracts settlement criteria from Polymarket market metadata.
 * Uses chrono-node for date parsing from natural language text.
 *
 * @module parsers/polymarket-parser
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

/** Polymarket market data structure (subset of fields we need) */
export interface PolymarketMarketData {
  id: string;
  question: string;
  description?: string;
  outcomes: string[];
  end_date_iso?: string;
  resolution_source?: string;
}

/**
 * Parser for extracting settlement criteria from Polymarket markets.
 *
 * Key parsing targets:
 * - Question text: Main event description
 * - Description: Resolution criteria and rules
 * - Dates: Extracted via chrono-node
 * - Data sources: Look for phrases like "according to", "as reported by"
 */
export class PolymarketSettlementParser {
  /**
   * Parse Polymarket market data into settlement criteria.
   *
   * @param market - Polymarket market data
   * @returns Extracted settlement criteria
   */
  parse(market: PolymarketMarketData): SettlementCriteria {
    const text = this.buildFullText(market);

    // Extract dates from text using chrono-node
    const parsedDates = chrono.parse(text);
    const dates = parsedDates
      .map(result => result.start.date())
      .filter((date): date is Date => date !== null);

    // Try to get resolution date from end_date_iso first, then parsed dates
    let resolutionDate: Date | undefined;
    if (market.end_date_iso) {
      const endDate = new Date(market.end_date_iso);
      if (!isNaN(endDate.getTime())) {
        resolutionDate = endDate;
      }
    }
    if (!resolutionDate && dates.length > 0) {
      // Use the latest date found as likely resolution date
      resolutionDate = dates.reduce((latest, date) =>
        date > latest ? date : latest
      );
    }

    // Extract keywords from question
    const keywords = this.extractKeywords(market.question);

    // Extract named entities (capitalized phrases)
    const entities = this.extractEntities(text);

    // Try to identify data source
    const dataSource = this.extractDataSource(text) || market.resolution_source;

    return {
      platform: 'polymarket',
      marketId: market.id,
      question: market.question,
      primaryRule: market.description || market.question,
      secondaryRule: undefined,
      outcomes: market.outcomes,
      resolutionDate,
      dataSource,
      settlementType: this.determineSettlementType(market.outcomes),
      extracted: {
        dates,
        keywords,
        entities,
      },
    };
  }

  /**
   * Build full text for parsing by combining question and description.
   */
  private buildFullText(market: PolymarketMarketData): string {
    const parts = [market.question];
    if (market.description) {
      parts.push(market.description);
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
      'Based', 'According', 'Per', 'From'
    ]);

    // Match capitalized words that may be multi-word names
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

    // Deduplicate
    return [...new Set(processed)];
  }

  /**
   * Extract data source from resolution text.
   */
  extractDataSource(text: string): string | undefined {
    const patterns = [
      /according to ([^,.]+)/i,
      /as reported by ([^,.]+)/i,
      /based on ([^,.]+)/i,
      /per ([^,.]+)/i,
      /source: ([^,.]+)/i,
      /data from ([^,.]+)/i,
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
   * Determine settlement type from outcomes.
   */
  private determineSettlementType(outcomes: string[]): 'binary' | 'scalar' | 'categorical' {
    if (outcomes.length === 2) {
      const normalized = outcomes.map(o => o.toLowerCase());
      if (normalized.includes('yes') && normalized.includes('no')) {
        return 'binary';
      }
    }
    if (outcomes.length > 2) {
      return 'categorical';
    }
    return 'binary';
  }
}
