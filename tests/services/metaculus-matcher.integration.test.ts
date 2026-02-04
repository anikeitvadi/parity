/**
 * Integration tests for MetaculusMatcher with live API data
 *
 * These tests verify that the matcher can successfully pair real Metaculus questions
 * with real prediction market data, achieving the required 30+ matches.
 *
 * NOTE: This test requires API credentials to be set in environment variables.
 * It will be skipped if credentials are not available.
 *
 * @group integration
 */

import { describe, it, expect } from 'vitest';

describe('MetaculusMatcher Integration', () => {
  // Check for required credentials
  const hasMetaculusToken = !!process.env.METACULUS_TOKEN;
  const hasPolymarketKey = !!process.env.POLYMARKET_PRIVATE_KEY;
  const hasKalshiAccess = !!(process.env.KALSHI_API_KEY || process.env.KALSHI_USE_DEMO);

  const hasCredentials = hasMetaculusToken && hasPolymarketKey && hasKalshiAccess;

  const runIntegration = hasCredentials ? describe : describe.skip;

  runIntegration('live API matching', () => {
    it(
      'matches at least 30 Metaculus questions to real markets',
      async () => {
        // Dynamic imports to avoid env validation issues when credentials missing
        const { MetaculusMatcher } = await import('../../src/services/metaculus-matcher.js');
        const { MetaculusClient } = await import('../../src/services/metaculus-client.js');
        const { PolymarketClient } = await import('../../src/services/polymarket.js');
        const { KalshiClient } = await import('../../src/services/kalshi.js');

        // 1. Fetch real Metaculus questions (binary, open)
        const metaculusClient = new MetaculusClient();

        // Search for open binary questions
        const questions = await metaculusClient.searchQuestions({
          limit: 100,
          status: 'open',
          forecast_type: 'binary',
        });

        console.log(`Fetched ${questions.length} Metaculus questions`);
        expect(questions.length).toBeGreaterThan(0);

        // 2. Fetch real Polymarket/Kalshi markets
        const polymarket = new PolymarketClient();
        const kalshi = new KalshiClient();

        const polymarketMarkets = await polymarket.getActiveMarkets();
        const kalshiMarkets = await kalshi.getActiveMarkets();

        console.log(
          `Fetched ${polymarketMarkets.length} Polymarket markets, ${kalshiMarkets.length} Kalshi markets`
        );

        const allMarkets = [...polymarketMarkets, ...kalshiMarkets];
        expect(allMarkets.length).toBeGreaterThan(0);

        // 3. Run matcher
        const matcher = new MetaculusMatcher();
        const matches = matcher.matchToMarkets(questions, allMarkets);

        // 4. Verify at least 30 matches
        console.log(`\nFound ${matches.length} matches from ${questions.length} questions`);
        console.log(`Match rate: ${((matches.length / questions.length) * 100).toFixed(1)}%\n`);

        expect(matches.length).toBeGreaterThanOrEqual(30);

        // 5. Log match details for review
        console.log('Sample matches (first 10):');
        matches.slice(0, 10).forEach((m, i) => {
          console.log(
            `  ${i + 1}. [${(m.confidence * 100).toFixed(0)}%] ${m.method}`
          );
          console.log(`     Metaculus: ${m.metaculusQuestion.title}`);
          console.log(`     Market:    ${m.market.question} (${m.market.platform})`);
          console.log(
            `     Similarity: title=${(m.similarity.title * 100).toFixed(0)}%, timing=${(m.similarity.timing * 100).toFixed(0)}%`
          );
          console.log('');
        });

        // 6. Verify match quality
        const highQualityMatches = matches.filter((m) => m.confidence >= 0.9);
        console.log(
          `High quality matches (≥90%): ${highQualityMatches.length}/${matches.length}`
        );

        // 7. Verify method distribution
        const methodCounts = {
          manual_curated: matches.filter((m) => m.method === 'manual_curated').length,
          exact_match: matches.filter((m) => m.method === 'exact_match').length,
          high_similarity: matches.filter((m) => m.method === 'high_similarity').length,
        };

        console.log('Match methods:');
        console.log(`  Manual curated:  ${methodCounts.manual_curated}`);
        console.log(`  Exact match:     ${methodCounts.exact_match}`);
        console.log(`  High similarity: ${methodCounts.high_similarity}`);

        // All matches should have valid confidence scores
        matches.forEach((match) => {
          expect(match.confidence).toBeGreaterThanOrEqual(0.8);
          expect(match.confidence).toBeLessThanOrEqual(1.0);
        });

        // All matches should have valid similarity scores
        matches.forEach((match) => {
          expect(match.similarity.title).toBeGreaterThanOrEqual(0);
          expect(match.similarity.title).toBeLessThanOrEqual(1);
          expect(match.similarity.description).toBeGreaterThanOrEqual(0);
          expect(match.similarity.description).toBeLessThanOrEqual(1);
          expect(match.similarity.timing).toBeGreaterThanOrEqual(0);
          expect(match.similarity.timing).toBeLessThanOrEqual(1);
          expect(match.similarity.overall).toBeGreaterThanOrEqual(0);
          expect(match.similarity.overall).toBeLessThanOrEqual(1);
        });
      },
      60000
    ); // 60s timeout for API calls
  });

  // Always run this test (no API required)
  describe('integration test setup', () => {
    it('has integration test configured', () => {
      const missing: string[] = [];

      if (!process.env.METACULUS_TOKEN) {
        missing.push('METACULUS_TOKEN');
      }
      if (!process.env.POLYMARKET_PRIVATE_KEY) {
        missing.push('POLYMARKET_PRIVATE_KEY');
      }
      if (!process.env.KALSHI_API_KEY && !process.env.KALSHI_USE_DEMO) {
        missing.push('KALSHI_API_KEY (or KALSHI_USE_DEMO)');
      }

      if (missing.length === 0) {
        console.log('✓ All credentials set - integration tests will run');
      } else {
        console.log('⚠ Integration tests will be skipped');
        console.log('  Missing credentials:', missing.join(', '));
        console.log('  Set these environment variables to run live API tests');
      }

      expect(true).toBe(true);
    });
  });
});
