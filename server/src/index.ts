import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDatabase, getDatabase } from '../../src/database/schema.js';
import { marketRoutes, getMarketCounts } from './routes/markets.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { researchRoutes } from './routes/research.js';
import { calibrationRoutes } from './routes/calibration.js';

const app = new Hono();

// Middleware
app.use('*', cors());

// Routes
app.route('/api/markets', marketRoutes);
app.route('/api/opportunities', opportunityRoutes);
app.route('/api', researchRoutes);
app.route('/api/calibration', calibrationRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// System status — no self-fetch, uses direct DB queries and cache checks
app.get('/api/status', (c) => {
  const db = getDatabase();

  const snapshots = db.prepare('SELECT COUNT(*) as c FROM market_snapshots').get() as { c: number };
  const matches = db.prepare('SELECT COUNT(*) as c FROM matched_markets').get() as { c: number };
  const opps = db.prepare('SELECT COUNT(*) as c FROM opportunities').get() as { c: number };
  const forecasts = db.prepare('SELECT COUNT(*) as c FROM user_forecasts').get() as { c: number };

  let embeddingCount = 0;
  try {
    embeddingCount = (db.prepare('SELECT COUNT(*) as c FROM market_embedding_meta').get() as { c: number }).c;
  } catch { /* table may not exist yet */ }

  // Get cached market counts directly (no HTTP self-fetch)
  const counts = getMarketCounts();

  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasXAI = !!process.env.XAI_API_KEY;
  const hasMetaculus = true; // public API, always available

  return c.json({
    api: { status: 'ok' },
    markets: {
      polymarket: { count: counts.polymarket },
      kalshi: { count: counts.kalshi },
    },
    database: {
      snapshots: snapshots.c,
      matches: matches.c,
      opportunities: opps.c,
      forecasts: forecasts.c,
    },
    embeddings: {
      count: embeddingCount,
      hasApiKey: hasOpenAI || hasXAI,
    },
    ai: {
      provider: hasXAI ? 'xai' : hasOpenAI ? 'openai' : 'none',
      hasOpenAI,
      hasXAI,
      hasXSearch: hasXAI,
    },
    metaculus: { available: hasMetaculus },
  });
});

// Initialize database and start server
initDatabase();

const port = parseInt(process.env.PORT || '3001', 10);

console.log(`API server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
