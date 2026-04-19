import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDatabase, getDatabase } from '../../src/database/schema.js';
import { marketRoutes } from './routes/markets.js';
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

// System status
app.get('/api/status', async (c) => {
  const db = getDatabase();

  const snapshots = db.prepare('SELECT COUNT(*) as c FROM market_snapshots').get() as { c: number };
  const matches = db.prepare('SELECT COUNT(*) as c FROM matched_markets').get() as { c: number };
  const opps = db.prepare('SELECT COUNT(*) as c FROM opportunities').get() as { c: number };
  const forecasts = db.prepare('SELECT COUNT(*) as c FROM user_forecasts').get() as { c: number };

  let embeddingCount = 0;
  try {
    embeddingCount = (db.prepare('SELECT COUNT(*) as c FROM market_embedding_meta').get() as { c: number }).c;
  } catch { /* table may not exist yet */ }

  // Check market counts from cache or quick fetch
  let polyCount = 0;
  let kalshiCount = 0;
  try {
    const mkts = await (await fetch('http://localhost:3001/api/markets?limit=1')).json() as { total: number };
    // Get per-platform counts
    const polyRes = await (await fetch('http://localhost:3001/api/markets?platform=polymarket&limit=1')).json() as { total: number };
    const kalshiRes = await (await fetch('http://localhost:3001/api/markets?platform=kalshi&limit=1')).json() as { total: number };
    polyCount = polyRes.total;
    kalshiCount = kalshiRes.total;
  } catch { /* ignore */ }

  return c.json({
    api: { status: 'ok' },
    markets: {
      polymarket: { count: polyCount, cached: true },
      kalshi: { count: kalshiCount, cached: true },
    },
    database: {
      snapshots: snapshots.c,
      matches: matches.c,
      opportunities: opps.c,
      forecasts: forecasts.c,
    },
    embeddings: {
      count: embeddingCount,
      hasApiKey: !!process.env.OPENAI_API_KEY || !!process.env.XAI_API_KEY,
    },
    ai: {
      provider: process.env.XAI_API_KEY ? 'xai' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
      hasXSearch: !!process.env.XAI_API_KEY,
    },
  });
});

// Initialize database and start server
initDatabase();

const port = parseInt(process.env.PORT || '3001', 10);

console.log(`API server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
