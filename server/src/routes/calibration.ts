import { Hono } from 'hono';
import { getDatabase } from '../../../src/database/schema.js';
import { calculateBrierScore, meanBrierScore, assessCalibration } from '../../../src/scoring/brier.js';

export const calibrationRoutes = new Hono();

interface ForecastRow {
  id: number;
  market_id: string;
  platform: string;
  market_question: string;
  forecast_probability: number;
  market_price_at_forecast: number;
  category: string | null;
  resolved: number;
  outcome: number | null;
  brier_score: number | null;
  created_at: number;
  resolved_at: number | null;
}

// POST /api/calibration/forecast — Log a new forecast
calibrationRoutes.post('/forecast', async (c) => {
  const body = await c.req.json() as {
    marketId: string;
    platform: string;
    marketQuestion: string;
    forecastProbability: number;
    marketPrice: number;
    category?: string;
  };

  if (!body.marketId || body.forecastProbability == null) {
    return c.json({ error: 'marketId and forecastProbability required' }, 400);
  }

  const prob = Math.max(0, Math.min(1, body.forecastProbability));

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO user_forecasts
    (market_id, platform, market_question, forecast_probability, market_price_at_forecast, category)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    body.marketId,
    body.platform || '',
    body.marketQuestion || '',
    prob,
    body.marketPrice || 0,
    body.category || null
  );

  return c.json({ id: result.lastInsertRowid, probability: prob });
});

// POST /api/calibration/resolve/:id — Resolve a forecast
calibrationRoutes.post('/resolve/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json() as { outcome: boolean };

  if (body.outcome == null) {
    return c.json({ error: 'outcome (true/false) required' }, 400);
  }

  const db = getDatabase();
  const forecast = db.prepare('SELECT * FROM user_forecasts WHERE id = ?').get(id) as ForecastRow | undefined;

  if (!forecast) {
    return c.json({ error: 'Forecast not found' }, 404);
  }

  const brier = calculateBrierScore(forecast.forecast_probability, body.outcome);

  db.prepare(`
    UPDATE user_forecasts
    SET resolved = 1, outcome = ?, brier_score = ?, resolved_at = ?
    WHERE id = ?
  `).run(body.outcome ? 1 : 0, brier, Date.now(), id);

  return c.json({ id, brier, assessment: assessCalibration(brier) });
});

// GET /api/calibration/forecasts — List all forecasts
calibrationRoutes.get('/forecasts', (c) => {
  const resolved = c.req.query('resolved');
  const db = getDatabase();

  let query = 'SELECT * FROM user_forecasts';
  const params: unknown[] = [];

  if (resolved === 'true') {
    query += ' WHERE resolved = 1';
  } else if (resolved === 'false') {
    query += ' WHERE resolved = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const forecasts = db.prepare(query).all(...params) as ForecastRow[];
  return c.json({ forecasts });
});

// GET /api/calibration/stats — Calibration statistics
calibrationRoutes.get('/stats', (c) => {
  const db = getDatabase();

  const allResolved = db.prepare(
    'SELECT forecast_probability, outcome FROM user_forecasts WHERE resolved = 1'
  ).all() as { forecast_probability: number; outcome: number }[];

  if (allResolved.length === 0) {
    return c.json({
      totalForecasts: 0,
      resolvedForecasts: 0,
      meanBrierScore: null,
      assessment: 'No resolved forecasts yet',
      calibrationCurve: [],
      byCategory: {},
    });
  }

  // Overall Brier score
  const forecasts = allResolved.map((r) => ({
    probability: r.forecast_probability,
    occurred: r.outcome === 1,
  }));
  const overall = meanBrierScore(forecasts);

  // Calibration curve: bucket forecasts into 10% ranges
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${(i + 1) * 10}%`,
    midpoint: (i * 10 + 5) / 100,
    forecasts: 0,
    outcomes: 0,
    observedFrequency: 0,
  }));

  for (const r of allResolved) {
    const idx = Math.min(9, Math.floor(r.forecast_probability * 10));
    buckets[idx].forecasts++;
    if (r.outcome === 1) buckets[idx].outcomes++;
  }

  for (const b of buckets) {
    b.observedFrequency = b.forecasts > 0 ? b.outcomes / b.forecasts : 0;
  }

  // By category
  const byCategoryRows = db.prepare(`
    SELECT category, AVG(brier_score) as avg_brier, COUNT(*) as count
    FROM user_forecasts
    WHERE resolved = 1 AND category IS NOT NULL
    GROUP BY category
  `).all() as { category: string; avg_brier: number; count: number }[];

  const byCategory: Record<string, { avgBrier: number; count: number }> = {};
  for (const r of byCategoryRows) {
    byCategory[r.category] = { avgBrier: r.avg_brier, count: r.count };
  }

  const totalForecasts = db.prepare('SELECT COUNT(*) as c FROM user_forecasts').get() as { c: number };

  return c.json({
    totalForecasts: totalForecasts.c,
    resolvedForecasts: allResolved.length,
    meanBrierScore: overall,
    assessment: assessCalibration(overall),
    calibrationCurve: buckets.filter((b) => b.forecasts > 0),
    byCategory,
  });
});
