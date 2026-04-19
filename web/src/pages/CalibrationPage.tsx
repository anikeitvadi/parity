import React, { useState, useEffect, useCallback } from 'react';

interface Forecast {
  id: number;
  market_question: string;
  platform: string;
  forecast_probability: number;
  market_price_at_forecast: number;
  category: string | null;
  resolved: number;
  outcome: number | null;
  brier_score: number | null;
  created_at: number;
}

interface CalibrationStats {
  totalForecasts: number;
  resolvedForecasts: number;
  meanBrierScore: number | null;
  assessment: string;
  calibrationCurve: { range: string; midpoint: number; forecasts: number; observedFrequency: number }[];
  byCategory: Record<string, { avgBrier: number; count: number }>;
}

export function CalibrationPage() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [stats, setStats] = useState<CalibrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'resolved' | 'stats'>('stats');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [forecastRes, statsRes] = await Promise.all([
        fetch(`/api/calibration/forecasts?resolved=${tab === 'resolved' ? 'true' : 'false'}`),
        fetch('/api/calibration/stats'),
      ]);
      const forecastData = await forecastRes.json();
      const statsData = await statsRes.json();
      setForecasts(forecastData.forecasts || []);
      setStats(statsData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: number, outcome: boolean) => {
    await fetch(`/api/calibration/resolve/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    });
    load();
  };

  const tabs = [
    { id: 'stats' as const, label: 'Overview' },
    { id: 'pending' as const, label: 'Pending' },
    { id: 'resolved' as const, label: 'Resolved' },
  ];

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Calibration Coach</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Track your prediction accuracy over time. Log forecasts on markets, resolve them when they settle,
        and see where you're overconfident or underconfident.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab === t.id
                ? 'bg-gray-700 text-white'
                : 'bg-gray-900 border border-gray-700 text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats Overview */}
      {tab === 'stats' && stats && (
        <div className="space-y-6">
          {/* Score cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Forecasts" value={String(stats.totalForecasts)} />
            <StatCard label="Resolved" value={String(stats.resolvedForecasts)} />
            <StatCard
              label="Brier Score"
              value={stats.meanBrierScore != null ? stats.meanBrierScore.toFixed(3) : '—'}
              subtitle={stats.meanBrierScore != null ? (stats.meanBrierScore < 0.2 ? 'Good' : stats.meanBrierScore < 0.25 ? 'Average' : 'Needs work') : undefined}
              color={stats.meanBrierScore != null ? (stats.meanBrierScore < 0.2 ? 'text-green-400' : stats.meanBrierScore < 0.25 ? 'text-yellow-400' : 'text-red-400') : undefined}
            />
            <StatCard label="Assessment" value={stats.assessment || '—'} />
          </div>

          {/* Calibration curve */}
          {stats.calibrationCurve.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Calibration Curve</h3>
              <p className="text-xs text-gray-500 mb-4">
                Perfect calibration = the bars match the diagonal. If you say 70%, it should happen 70% of the time.
              </p>
              <div className="flex items-end gap-2 h-40">
                {stats.calibrationCurve.map((bucket) => {
                  const height = bucket.observedFrequency * 100;
                  const expected = bucket.midpoint * 100;
                  const isOver = height > expected + 5;
                  const isUnder = height < expected - 5;
                  return (
                    <div key={bucket.range} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end h-32 relative">
                        {/* Expected line */}
                        <div
                          className="absolute w-full border-t border-dashed border-gray-600"
                          style={{ bottom: `${expected}%` }}
                        />
                        {/* Actual bar */}
                        <div
                          className={`w-full rounded-t transition-all ${
                            isOver ? 'bg-red-500/60' : isUnder ? 'bg-yellow-500/60' : 'bg-green-500/60'
                          }`}
                          style={{ height: `${Math.max(2, height)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{bucket.range}</span>
                      <span className="text-xs text-gray-600">n={bucket.forecasts}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/60" /> Calibrated</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/60" /> Overconfident</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/60" /> Underconfident</span>
              </div>
            </div>
          )}

          {/* By category */}
          {Object.keys(stats.byCategory).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">By Category</h3>
              <div className="space-y-2">
                {Object.entries(stats.byCategory)
                  .sort(([, a], [, b]) => a.avgBrier - b.avgBrier)
                  .map(([cat, data]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{cat}</span>
                      <div className="flex gap-4 text-gray-500">
                        <span>{data.count} forecasts</span>
                        <span className={data.avgBrier < 0.2 ? 'text-green-400' : data.avgBrier < 0.25 ? 'text-yellow-400' : 'text-red-400'}>
                          Brier: {data.avgBrier.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {stats.totalForecasts === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">No forecasts yet</div>
              <div className="text-gray-600 text-sm max-w-md mx-auto">
                Go to any market detail page and use the "Log Forecast" button to start tracking your predictions.
                As markets resolve, your calibration data will appear here.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending forecasts */}
      {tab === 'pending' && (
        <div className="space-y-2">
          {loading && forecasts.length === 0 && (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          )}
          {!loading && forecasts.length === 0 && (
            <div className="text-center py-12 text-gray-500">No pending forecasts</div>
          )}
          {forecasts.filter((f) => !f.resolved).map((f) => (
            <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{f.market_question}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Your forecast: <span className="text-cyan-400 font-medium">{(f.forecast_probability * 100).toFixed(0)}%</span>
                    {' '} | Market was: {(f.market_price_at_forecast * 100).toFixed(0)}%
                    {f.category && <> | {f.category}</>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => resolve(f.id, true)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => resolve(f.id, false)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolved forecasts */}
      {tab === 'resolved' && (
        <div className="space-y-2">
          {loading && forecasts.length === 0 && (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          )}
          {!loading && forecasts.length === 0 && (
            <div className="text-center py-12 text-gray-500">No resolved forecasts yet</div>
          )}
          {forecasts.filter((f) => f.resolved).map((f) => (
            <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{f.market_question}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Forecast: {(f.forecast_probability * 100).toFixed(0)}%
                    {' '} | Outcome: <span className={f.outcome ? 'text-green-400' : 'text-red-400'}>{f.outcome ? 'Yes' : 'No'}</span>
                    {f.category && <> | {f.category}</>}
                  </div>
                </div>
                <div className={`text-sm font-mono ${f.brier_score != null && f.brier_score < 0.15 ? 'text-green-400' : f.brier_score != null && f.brier_score < 0.25 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {f.brier_score != null ? f.brier_score.toFixed(3) : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-white'}`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
    </div>
  );
}
