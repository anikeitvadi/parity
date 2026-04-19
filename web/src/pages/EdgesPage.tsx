import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { scanForEdges, type ScanResult } from '../api/client.js';
import { PriceBar } from '../components/PriceBar.js';

interface WatchlistItem {
  id: string;
  type: string;
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  insight: string;
  category?: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  toss_up: {
    label: 'Toss-Up',
    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    desc: 'Close to 50/50 — the crowd can\'t decide. Research could give you an edge.',
  },
  closing_soon: {
    label: 'Closing Soon',
    color: 'bg-red-500/15 text-red-400 border-red-500/30',
    desc: 'Resolving within a week. Last chance to take a position.',
  },
  high_conviction: {
    label: 'High Conviction',
    color: 'bg-green-500/15 text-green-400 border-green-500/30',
    desc: 'The crowd is very confident. Easy money or overconfidence?',
  },
  contrarian: {
    label: 'Contrarian',
    color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    desc: 'The crowd thinks this is unlikely. If you disagree, there could be value.',
  },
  price_gap: {
    label: 'Price Gap',
    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    desc: 'Same event priced differently on Polymarket vs Kalshi. Semantic AI matching.',
  },
};

export function EdgesPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await scanForEdges(typeFilter || undefined) as unknown as {
        opportunities: WatchlistItem[];
        cached: boolean;
      };
      setItems(data.opportunities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    scan();
  }, [scan]);

  const filters = [
    { id: '', label: 'All' },
    { id: 'price_gap', label: 'Price Gaps' },
    { id: 'toss_up', label: 'Toss-Ups' },
    { id: 'closing_soon', label: 'Closing Soon' },
    { id: 'high_conviction', label: 'High Conviction' },
    { id: 'contrarian', label: 'Contrarian' },
  ];

  // Group items by type for display
  const grouped = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    const list = grouped.get(item.type) || [];
    list.push(item);
    grouped.set(item.type, list);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Watchlist</h1>
        <button
          onClick={scan}
          disabled={loading}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium shrink-0"
        >
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Markets worth a closer look, picked from live data across Polymarket and Kalshi.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setTypeFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              typeFilter === f.id
                ? 'bg-gray-700 text-white'
                : 'bg-gray-900 border border-gray-700 text-gray-400 hover:text-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && items.length === 0 && (
        <div className="text-center py-16 text-gray-500">Scanning markets...</div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && !error && (
        <div className="text-center py-16 text-gray-500">
          No markets found. Try a different filter or refresh.
        </div>
      )}

      {/* Grouped sections */}
      {!typeFilter && items.length > 0 && (
        <div className="space-y-8">
          {['price_gap', 'toss_up', 'closing_soon', 'high_conviction', 'contrarian'].map((type) => {
            const group = grouped.get(type);
            if (!group || group.length === 0) return null;
            const config = TYPE_CONFIG[type];

            return (
              <section key={type}>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-gray-200">{config.label}</h2>
                  <p className="text-xs text-gray-500">{config.desc}</p>
                </div>
                <div className="space-y-2">
                  {group.map((item) => (
                    <WatchlistCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Flat list when filtered */}
      {typeFilter && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <WatchlistCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistCard({ item }: { item: WatchlistItem }) {
  const config = TYPE_CONFIG[item.type] || { label: item.type, color: 'bg-gray-700 text-gray-300 border-gray-600' };

  return (
    <Link
      to={`/market/${item.platform}/${encodeURIComponent(item.marketId)}`}
      className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
    >
      {/* Price */}
      <div className="w-20 shrink-0">
        <PriceBar yesPrice={item.yesPrice} size="sm" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-100 truncate">
          {item.marketQuestion}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {item.insight}
        </div>
        <div className="flex flex-wrap gap-x-3 mt-1.5 text-xs text-gray-500">
          {item.category && <span>{item.category}</span>}
          <span className="capitalize">{item.platform}</span>
          {item.volume > 0 && <span>${Math.round(item.volume).toLocaleString()} volume</span>}
          {item.closeDate && (
            <span>
              Closes {new Date(item.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Type badge */}
      <span className={`text-xs px-2 py-1 rounded border shrink-0 hidden sm:inline ${config.color}`}>
        {config.label}
      </span>
    </Link>
  );
}
