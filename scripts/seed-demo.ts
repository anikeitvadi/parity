#!/usr/bin/env npx tsx
/**
 * Seed a demo database with real market data and sample user activity.
 * Run: npx tsx scripts/seed-demo.ts
 *
 * Creates demo.db with:
 * - Market snapshots from live Polymarket + Kalshi data
 * - Sample user forecasts with resolved outcomes
 * - Calibration data that shows a realistic accuracy profile
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { initDatabase } from '../src/database/schema.js';

const DEMO_DB = 'demo.db';

async function fetchMarkets(): Promise<any[]> {
  // Fetch from live API if server is running, otherwise fetch directly
  try {
    const res = await fetch('http://localhost:3001/api/markets?limit=100');
    if (res.ok) {
      const data = await res.json();
      return data.markets || [];
    }
  } catch { /* server not running */ }

  // Direct fetch from Polymarket
  console.log('Server not running, fetching directly from APIs...');
  const polyRes = await fetch('https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=100');
  const polyData = await polyRes.json();
  return (polyData || []).map((m: any) => ({
    id: m.conditionId || m.id || '',
    platform: 'polymarket',
    question: m.question,
    outcomes: ['Yes', 'No'],
    prices: {
      Yes: m.outcomePrices ? parseFloat(JSON.parse(m.outcomePrices)[0] || '0.5') : 0.5,
      No: m.outcomePrices ? parseFloat(JSON.parse(m.outcomePrices)[1] || '0.5') : 0.5,
    },
    closeDate: m.endDate || '',
    volume: parseFloat(m.volume || '0'),
    liquidity: parseFloat(m.liquidity || '0'),
    metadata: { slug: m.slug, category: m.category },
  }));
}

async function main() {
  console.log(`Seeding ${DEMO_DB}...`);

  // Initialize fresh demo database
  const db = initDatabase(DEMO_DB);

  // Fetch live market data
  const markets = await fetchMarkets();
  console.log(`Fetched ${markets.length} markets`);

  // Insert as snapshots
  const now = Date.now();
  const insertSnapshot = db.prepare(`
    INSERT OR IGNORE INTO market_snapshots (platform, market_id, timestamp, data)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const m of markets) {
      insertSnapshot.run(
        m.platform,
        m.id,
        now,
        JSON.stringify({
          question: m.question,
          outcomes: m.outcomes,
          prices: m.prices,
          volume: m.volume,
          liquidity: m.liquidity,
        })
      );

      // Also insert a snapshot from "3 days ago" with slightly different prices for price history
      const oldPrices = { ...m.prices };
      const shift = (Math.random() - 0.5) * 0.1;
      if (oldPrices.Yes != null) {
        oldPrices.Yes = Math.max(0.01, Math.min(0.99, oldPrices.Yes + shift));
        oldPrices.No = 1 - oldPrices.Yes;
      }
      insertSnapshot.run(
        m.platform,
        m.id,
        now - 3 * 86400000,
        JSON.stringify({
          question: m.question,
          outcomes: m.outcomes,
          prices: oldPrices,
          volume: (m.volume || 0) * 0.85,
          liquidity: (m.liquidity || 0) * 0.9,
        })
      );
    }
  });
  insertMany();
  console.log(`Inserted ${markets.length * 2} snapshots`);

  // Generate sample user forecasts
  const insertForecast = db.prepare(`
    INSERT INTO user_forecasts
    (market_id, platform, market_question, forecast_probability, market_price_at_forecast, category, resolved, outcome, brier_score, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Pick some markets for sample forecasts
  const forecastMarkets = markets.slice(0, 20);
  const categories = ['Politics', 'Sports', 'Economics', 'Technology', 'Geopolitics'];

  const insertForecasts = db.transaction(() => {
    for (let i = 0; i < forecastMarkets.length; i++) {
      const m = forecastMarkets[i];
      const marketPrice = m.prices?.Yes ?? 0.5;
      const category = categories[i % categories.length];

      // User's forecast — slightly different from market price (simulates having an opinion)
      const userForecast = Math.max(0.05, Math.min(0.95, marketPrice + (Math.random() - 0.5) * 0.2));

      // For older forecasts, simulate resolution
      const isResolved = i < 12; // first 12 are resolved
      const daysAgo = isResolved ? 7 + Math.floor(Math.random() * 20) : Math.floor(Math.random() * 5);
      const createdAt = now - daysAgo * 86400000;

      let outcome: number | null = null;
      let brierScore: number | null = null;
      let resolvedAt: number | null = null;

      if (isResolved) {
        // Simulate outcome — calibrated user is right ~65% of the time when confident
        const wasRight = userForecast > 0.5
          ? Math.random() < (0.5 + userForecast * 0.3)
          : Math.random() < (0.5 + (1 - userForecast) * 0.3);
        outcome = (userForecast > 0.5 ? wasRight : !wasRight) ? 1 : 0;
        brierScore = Math.pow(userForecast - outcome, 2);
        resolvedAt = createdAt + Math.floor(Math.random() * 10) * 86400000;
      }

      insertForecast.run(
        m.id,
        m.platform,
        m.question,
        userForecast,
        marketPrice,
        category,
        isResolved ? 1 : 0,
        outcome,
        brierScore,
        createdAt,
        resolvedAt
      );
    }
  });
  insertForecasts();
  console.log(`Inserted 20 sample forecasts (12 resolved, 8 pending)`);

  const stats = {
    snapshots: (db.prepare('SELECT COUNT(*) as c FROM market_snapshots').get() as { c: number }).c,
    forecasts: (db.prepare('SELECT COUNT(*) as c FROM user_forecasts').get() as { c: number }).c,
    resolved: (db.prepare('SELECT COUNT(*) as c FROM user_forecasts WHERE resolved = 1').get() as { c: number }).c,
  };

  console.log(`\nDemo database ready: ${DEMO_DB}`);
  console.log(`  Snapshots: ${stats.snapshots}`);
  console.log(`  Forecasts: ${stats.forecasts} (${stats.resolved} resolved)`);
  console.log(`\nTo use: npm run dev:web -- or copy demo.db to markets.db`);

  db.close();
}

main().catch(console.error);
