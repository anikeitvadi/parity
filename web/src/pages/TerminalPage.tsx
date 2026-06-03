import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFeed, fetchMarketDetail, type FeedItem, type MarketDetailResponse } from '../api/client.js';
import { OpportunityQueue } from '../components/OpportunityQueue.js';
import { DecisionPane } from '../components/DecisionPane.js';
import { ConsensusGapMap } from '../components/ConsensusGapMap.js';

type SortKey = 'volume' | 'divergence' | 'closing';

export function TerminalPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [selectedId, setSelectedId] = useState<{ platform: string; id: string } | null>(null);
  const [detail, setDetail] = useState<MarketDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'panels' | 'gapmap'>('panels');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('volume');

  const detailCache = useRef(new Map<string, MarketDetailResponse>());

  // Initial data fetch + auto-refresh
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchFeed();
        setItems(data.items || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 120_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch detail when selection changes
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }

    const key = `${selectedId.platform}:${selectedId.id}`;
    const cached = detailCache.current.get(key);
    if (cached) { setDetail(cached); return; }

    setDetailLoading(true);
    fetchMarketDetail(selectedId.platform, selectedId.id)
      .then((d) => {
        detailCache.current.set(key, d);
        setDetail(d);
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const getFiltered = useCallback(() => {
    let list = items;
    if (typeFilter) list = list.filter((o) => o.type === typeFilter);
    if (platformFilter) list = list.filter((o) => o.platform === platformFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) => o.marketQuestion.toLowerCase().includes(q));
    }
    // Sort (copy first — never mutate state)
    return [...list].sort((a, b) => {
      if (sort === 'divergence') {
        const da = a.divergence == null ? -1 : Math.abs(a.divergence);
        const db = b.divergence == null ? -1 : Math.abs(b.divergence);
        return db - da;
      }
      if (sort === 'closing') {
        const ca = a.closeDate ? new Date(a.closeDate).getTime() : Infinity;
        const cb = b.closeDate ? new Date(b.closeDate).getTime() : Infinity;
        return ca - cb;
      }
      return b.volume - a.volume; // default: most traded first
    });
  }, [items, typeFilter, platformFilter, search, sort]);

  const filtered = getFiltered();

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'g') {
        setView((v) => v === 'panels' ? 'gapmap' : 'panels');
        return;
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = selectedId
          ? filtered.findIndex((o) => o.marketId === selectedId.id && o.platform === selectedId.platform)
          : -1;
        const next = e.key === 'ArrowDown'
          ? Math.min(idx + 1, filtered.length - 1)
          : Math.max(idx - 1, 0);
        if (filtered[next]) {
          setSelectedId({ platform: filtered[next].platform, id: filtered[next].marketId });
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const onSelect = useCallback((platform: string, id: string) => {
    setSelectedId({ platform, id });
    setView('panels');
  }, []);

  const typeFilters = [
    { id: '', label: 'ALL' },
    { id: 'price_gap', label: 'GAP' },
    { id: 'toss_up', label: 'TOSS' },
    { id: 'closing_soon', label: 'CLOSE' },
    { id: 'high_conviction', label: 'CONV' },
    { id: 'contrarian', label: 'CONTR' },
  ];

  const platformFilters = [
    { id: '', label: 'ALL' },
    { id: 'polymarket', label: 'POLY' },
    { id: 'kalshi', label: 'KALSHI' },
  ];

  const sorts: { id: SortKey; label: string }[] = [
    { id: 'volume', label: 'Volume' },
    { id: 'divergence', label: 'Divergence' },
    { id: 'closing', label: 'Closing' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar: search + filters + sort + view toggle */}
      <div className="h-8 shrink-0 flex items-center gap-2 px-3 border-b border-[#1E293B] bg-[#0E1223]">
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-44 bg-transparent border border-[#1E293B] rounded px-2 py-0.5 text-[12px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#06B6D4]"
        />

        {/* Platform filter */}
        <div className="flex gap-0.5">
          {platformFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setPlatformFilter(f.id)}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                platformFilter === f.id ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="text-[#334155]">|</span>

        {/* Type filter */}
        <div className="flex gap-0.5">
          {typeFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                typeFilter === f.id ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sort */}
        <span className="text-[10px] text-[#64748B]">sort</span>
        <div className="flex gap-0.5">
          {sorts.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                sort === s.id ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-[#64748B] tabular-nums">
          {filtered.length}{loading && ' · …'}
        </span>
        <button
          onClick={() => setView((v) => v === 'panels' ? 'gapmap' : 'panels')}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
            view === 'gapmap' ? 'bg-cyan-500/20 text-cyan-400' : 'text-[#64748B] hover:text-[#94A3B8]'
          }`}
        >
          {view === 'gapmap' ? '← Panels' : 'Gap Map'}
        </button>
      </div>

      {/* Main content */}
      {view === 'panels' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: market list */}
          <div className="w-[560px] shrink-0 border-r border-[#1E293B] overflow-y-auto">
            <OpportunityQueue
              items={filtered}
              selectedId={selectedId}
              onSelect={onSelect}
              loading={loading}
            />
          </div>

          {/* Right: decision pane (evidence + brief + your call, or dashboard) */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <DecisionPane
              detail={detail}
              loading={detailLoading}
              selectedId={selectedId}
              onSelectMarket={onSelect}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ConsensusGapMap items={filtered} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}
