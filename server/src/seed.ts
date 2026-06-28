import type Database from 'better-sqlite3';

/**
 * Demo calibration forecasts for the public deploy.
 *
 * A fresh container starts with an empty markets.db, so the calibration track
 * record would render blank. When SEED_DEMO=true and no forecasts exist yet,
 * insert a small, fixed set so the "when you say 70%, does it happen 70%?"
 * story is visible. Deterministic by design — the same chart on every restart.
 *
 * The profile is a decent-but-slightly-overconfident forecaster (avg Brier
 * ~0.22, below the 0.25 coin-flip line) so the calibration view has a real
 * shape to read, not a flat line.
 */
interface DemoForecast {
  question: string;
  category: string;
  platform: string;
  probability: number;
  outcome: number | null; // null = still pending
  daysAgo: number;
}

const DEMO_FORECASTS: DemoForecast[] = [
  { question: 'Will the Fed cut interest rates at its next meeting?', category: 'Economics', platform: 'kalshi', probability: 0.55, outcome: 1, daysAgo: 38 },
  { question: 'Will the incumbent win the governor’s race?', category: 'Politics', platform: 'polymarket', probability: 0.62, outcome: 1, daysAgo: 35 },
  { question: 'Will a ceasefire be signed before quarter-end?', category: 'Geopolitics', platform: 'polymarket', probability: 0.70, outcome: 0, daysAgo: 33 },
  { question: 'Will the new model top the benchmark leaderboard?', category: 'Technology', platform: 'polymarket', probability: 0.48, outcome: 0, daysAgo: 30 },
  { question: 'Will headline inflation come in below 3% this print?', category: 'Economics', platform: 'kalshi', probability: 0.80, outcome: 1, daysAgo: 28 },
  { question: 'Will the underdog win the championship?', category: 'Sports', platform: 'polymarket', probability: 0.35, outcome: 0, daysAgo: 26 },
  { question: 'Will the bill pass the Senate this session?', category: 'Politics', platform: 'kalshi', probability: 0.90, outcome: 1, daysAgo: 24 },
  { question: 'Will the summit be held on schedule?', category: 'Geopolitics', platform: 'polymarket', probability: 0.75, outcome: 1, daysAgo: 22 },
  { question: 'Will the product launch ship this month?', category: 'Technology', platform: 'polymarket', probability: 0.40, outcome: 1, daysAgo: 20 },
  { question: 'Will GDP growth beat the consensus forecast?', category: 'Economics', platform: 'kalshi', probability: 0.85, outcome: 0, daysAgo: 18 },
  { question: 'Will the favorite reach the finals?', category: 'Sports', platform: 'polymarket', probability: 0.60, outcome: 1, daysAgo: 16 },
  { question: 'Will turnout exceed the previous record?', category: 'Politics', platform: 'kalshi', probability: 0.30, outcome: 0, daysAgo: 14 },
  // Still open — show up as pending in the track record.
  { question: 'Will the trade deal be ratified this year?', category: 'Geopolitics', platform: 'polymarket', probability: 0.65, outcome: null, daysAgo: 5 },
  { question: 'Will export controls be expanded next quarter?', category: 'Technology', platform: 'kalshi', probability: 0.45, outcome: null, daysAgo: 2 },
];

const DAY_MS = 86_400_000;

function clampPrice(p: number): number {
  return Math.round(Math.max(0.05, Math.min(0.95, p)) * 100) / 100;
}

/**
 * Insert demo forecasts when SEED_DEMO=true and the table is empty.
 * No-op locally (where you have real forecasts) and idempotent across restarts.
 */
export function maybeSeedDemoForecasts(db: Database.Database): void {
  if (process.env.SEED_DEMO !== 'true') return;

  const existing = (db.prepare('SELECT COUNT(*) as c FROM user_forecasts').get() as { c: number }).c;
  if (existing > 0) return;

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO user_forecasts
    (market_id, platform, market_question, forecast_probability, market_price_at_forecast, category, resolved, outcome, brier_score, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    DEMO_FORECASTS.forEach((f, i) => {
      const createdAt = now - f.daysAgo * DAY_MS;
      const resolved = f.outcome === null ? 0 : 1;
      const brier = f.outcome === null ? null : Math.pow(f.probability - f.outcome, 2);
      const resolvedAt = f.outcome === null ? null : Math.min(now, createdAt + 4 * DAY_MS);
      // Pretend the user disagreed slightly with the market at forecast time.
      const marketPrice = clampPrice(f.probability + (i % 2 === 0 ? 0.05 : -0.04));

      insert.run(
        `demo-${i}`,
        f.platform,
        f.question,
        f.probability,
        marketPrice,
        f.category,
        resolved,
        f.outcome,
        brier,
        createdAt,
        resolvedAt
      );
    });
  });
  insertAll();

  console.log(`Seeded ${DEMO_FORECASTS.length} demo forecasts (SEED_DEMO=true, empty table)`);
}
