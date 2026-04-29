import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PretextHero } from '../components/PretextHero.js';

export function HomePage() {
  const [stats, setStats] = useState<{ total: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, kRes] = await Promise.all([
          fetch('/api/markets?platform=polymarket&limit=1'),
          fetch('/api/markets?platform=kalshi&limit=1'),
        ]);
        const p = await pRes.json();
        const k = await kRes.json();
        setStats({ total: (p.total || 0) + (k.total || 0) });
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <>
      <PretextHero />

      {/* Centered content card — pointer-events-none on wrapper so canvas gets mouse, auto on card */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-120px)] pointer-events-none">
        <div className="bg-gray-950/85 backdrop-blur-md border border-gray-800 rounded-2xl p-10 max-w-lg w-full mx-6 text-center shadow-2xl shadow-black/50 pointer-events-auto">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-3">
            Prediction Market Scanner
          </h1>

          <p className="text-gray-400 text-sm leading-relaxed mb-2">
            Live odds from Polymarket and Kalshi in one place.
            AI research briefs powered by real-time news.
            Superforecaster signals from Metaculus.
          </p>

          {stats && (
            <p className="text-xs text-gray-600 mb-6 flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {stats.total} markets live
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link
              to="/markets"
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Browse Markets
            </Link>
            <Link
              to="/watchlist"
              className="px-6 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700"
            >
              Watchlist
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-gray-500">
            <Link to="/calibration" className="hover:text-gray-300 transition-colors">Calibration Coach</Link>
            <Link to="/saved" className="hover:text-gray-300 transition-colors">Saved Markets</Link>
            <Link to="/status" className="hover:text-gray-300 transition-colors">System Status</Link>
          </div>
        </div>
      </div>
    </>
  );
}
