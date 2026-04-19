import React, { useState, useEffect, useCallback } from 'react';
import { MarketCard } from '../components/MarketCard.js';
import { fetchMarkets, type Market } from '../api/client.js';

function WelcomeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 border border-cyan-800/30 rounded-lg p-6 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white mb-2">Prediction Market Scanner</h2>
          <p className="text-sm text-gray-300 mb-3">
            Browse live markets from Polymarket and Kalshi in one place.
            Click any market for detailed odds, AI research briefs, and superforecaster data.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            <span className="bg-gray-800 px-2 py-1 rounded">Watchlist &mdash; curated picks</span>
            <span className="bg-gray-800 px-2 py-1 rounded">AI Briefs &mdash; news-powered analysis</span>
            <span className="bg-gray-800 px-2 py-1 rounded">Calibration &mdash; track your accuracy</span>
            <span className="bg-gray-800 px-2 py-1 rounded">Save &mdash; bookmark markets</span>
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300 text-sm shrink-0">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function MarketListPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [category, setCategory] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('pms-welcome-dismissed'));

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarkets({
        platform: platform === 'all' ? undefined : platform,
        search: debouncedSearch || undefined,
        category: category || undefined,
        limit: 200,
      });
      setMarkets(result.markets);
      setTotal(result.total);
      if (result.categories) setCategories(result.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, [platform, debouncedSearch, category]);

  useEffect(() => {
    load();
  }, [load]);

  const platformTabs = [
    { id: 'all', label: 'All' },
    { id: 'polymarket', label: 'Polymarket' },
    { id: 'kalshi', label: 'Kalshi' },
  ];

  return (
    <div>
      {/* Welcome banner for first-time visitors */}
      {showWelcome && (
        <WelcomeBanner onDismiss={() => {
          setShowWelcome(false);
          localStorage.setItem('pms-welcome-dismissed', '1');
        }} />
      )}

      {/* Search + Platform Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {platformTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPlatform(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                platform === tab.id
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setCategory('')}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              !category
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(category === cat ? '' : cat)}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                category === cat
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Status */}
      {loading && markets.length === 0 && (
        <div className="text-center py-12 text-gray-500">Loading markets...</div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 text-red-400">
          {error}
          <button
            onClick={load}
            className="ml-3 text-sm underline hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && markets.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500">
          {debouncedSearch
            ? `No markets matching "${debouncedSearch}"`
            : 'No markets found. Is the API server running?'}
        </div>
      )}

      {/* Results count */}
      {markets.length > 0 && (
        <div className="text-sm text-gray-500 mb-4">
          Showing {markets.length} of {total} markets
          {loading && <span className="ml-2 text-cyan-500">Refreshing...</span>}
        </div>
      )}

      {/* Market grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {markets.map((market) => (
          <MarketCard key={`${market.platform}-${market.id}`} market={market} />
        ))}
      </div>
    </div>
  );
}
