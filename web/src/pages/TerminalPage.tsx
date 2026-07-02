import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPairs, type PairsResponse, type PairRow, type PairStatus } from '../api/client.js';
import { PairQueue } from '../components/PairQueue.js';
import { PairDossier } from '../components/PairDossier.js';
import { PAIR_STATUS } from '../lib/pairStatus.js';

type StatusFilter = 'curated' | 'strict' | PairStatus;
type SortKey = 'opportunity' | 'gap' | 'liquidity';

/**
 * The Scanner: a LIVE cross-platform pair terminal. Every row is one event listed on both
 * Polymarket and Kalshi; the verifier's verdict (cached from the Efficiency Lab run) says whether
 * the apparent gap is the same contract, a spec mismatch, or a near-settled artifact — and the
 * dossier shows why it is or isn't tradable. Same verifier as the Lab; this is the applied terminal.
 */
export function TerminalPage({ onOpenLab }: { onOpenLab?: () => void }) {
  const [data, setData] = useState<PairsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('curated');
  const [sort, setSort] = useState<SortKey>('opportunity');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchPairs();
        if (alive) setData(r);
      } catch { /* keep prior data */ }
      if (alive) setLoading(false);
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const pairs = data?.pairs ?? [];
  const counts = data?.meta.counts;

  const filtered = useMemo(() => {
    let list =
      statusFilter === 'curated'
        ? pairs.filter((p) => p.status === 'survivor' || p.status === 'same_contract')
        : statusFilter === 'strict'
          ? pairs.filter((p) => p.strictSurvivor)
          : pairs.filter((p) => p.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.event.toLowerCase().includes(q) || p.kalshi.title.toLowerCase().includes(q));
    }
    const out = [...list];
    if (sort === 'gap') out.sort((a, b) => b.gap - a.gap);
    else if (sort === 'liquidity') out.sort((a, b) => b.liquidity - a.liquidity);
    // 'opportunity' keeps the server's credibility order (survivors → strict → liquidity).
    return out;
  }, [pairs, statusFilter, search, sort]);

  const selected: PairRow | null = useMemo(
    () => pairs.find((p) => p.id === selectedId) ?? null,
    [pairs, selectedId]
  );

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  // Keyboard nav through the filtered list.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex((p) => p.id === selectedId);
        const next = e.key === 'ArrowDown' ? Math.min(idx + 1, filtered.length - 1) : Math.max(idx - 1, 0);
        if (filtered[next]) setSelectedId(filtered[next].id);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filtered, selectedId]);

  const verifiedDate = data?.meta.verifiedAt
    ? new Date(data.meta.verifiedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  const strictCount = pairs.filter((p) => p.strictSurvivor).length;
  const chips: { id: StatusFilter; label: string; count?: number; color?: string }[] = [
    { id: 'curated', label: 'Best verified' },
    { id: 'survivor', label: 'Apparent gaps', count: counts?.survivor, color: PAIR_STATUS.survivor.color },
    { id: 'strict', label: 'Strict matches ★', count: strictCount, color: PAIR_STATUS.survivor.color },
    { id: 'same_contract', label: 'Candidates', count: counts?.same_contract, color: PAIR_STATUS.same_contract.color },
    { id: 'spec_mismatch', label: 'Spec mismatch', count: counts?.spec_mismatch, color: PAIR_STATUS.spec_mismatch.color },
    { id: 'topical', label: 'Topical', count: counts?.topical, color: PAIR_STATUS.topical.color },
    { id: 'stale', label: 'Near-settled', count: counts?.stale, color: PAIR_STATUS.stale.color },
  ];

  const sorts: { id: SortKey; label: string }[] = [
    { id: 'opportunity', label: 'Best' },
    { id: 'gap', label: 'Gap' },
    { id: 'liquidity', label: 'Liquidity' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header: identity + freshness + search + status chips + sort */}
      <div className="shrink-0 border-b border-[#1E293B] bg-[#0E1223]">
        <div className="h-11 flex items-center gap-2.5 px-4">
          <div className="shrink-0">
            <div className="text-[12px] font-semibold text-[#F8FAFC] leading-none">Cross-platform pairs</div>
            <div className="text-[9px] text-[#64748B] mt-0.5">
              {verifiedDate ? `cached verifier run · ${verifiedDate}` : 'loading…'}
              {data ? ` · ${data.meta.total.toLocaleString()} pairs · open one for live prices` : ''}
            </div>
          </div>

          <div className="relative w-64 ml-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#475569]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0B0F1D] border border-[#1E293B] rounded-md pl-8 pr-2 py-1.5 text-[12px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30"
            />
          </div>

          <div className="flex-1" />

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
          {onOpenLab && (
            <button onClick={onOpenLab} className="ml-1 px-2 py-0.5 text-[10px] font-medium rounded text-[#64748B] hover:text-[#06B6D4] transition-colors">
              Methodology →
            </button>
          )}
        </div>

        {/* Status filter chips with live counts */}
        <div className="h-9 flex items-center gap-1 px-4 border-t border-[#1E293B]/60 overflow-x-auto">
          {chips.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setStatusFilter(ch.id)}
              className={`shrink-0 flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                statusFilter === ch.id ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              {ch.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: ch.color }} />}
              {ch.label}
              {ch.count != null && <span className="text-[#475569] tabular-nums">{ch.count.toLocaleString()}</span>}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px] text-[#64748B] tabular-nums shrink-0">{filtered.length.toLocaleString()} shown</span>
        </div>
      </div>

      {/* Body: queue + dossier */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[560px] shrink-0 border-r border-[#1E293B] overflow-y-auto">
          {!loading && filtered.length === 0 ? (
            <EmptyState statusFilter={statusFilter} hasData={!!data} onReset={() => { setStatusFilter('curated'); setSearch(''); }} />
          ) : (
            <PairQueue pairs={filtered} selectedId={selectedId} onSelect={onSelect} loading={loading} />
          )}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <PairDossier pair={selected} onOpenLab={onOpenLab} verification={data?.meta.verification ?? null} />
        </div>
      </div>
    </div>
  );
}

/** Honest empty state — no live paired opportunities under the current filter. */
function EmptyState({ statusFilter, hasData, onReset }: { statusFilter: StatusFilter; hasData: boolean; onReset: () => void }) {
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-2">
        <div className="text-[12px] text-[#94A3B8]">No verified run loaded</div>
        <p className="text-[11px] text-[#64748B] max-w-[320px] leading-relaxed">
          The terminal reads the cached verifier run. Generate it with <span className="font-mono text-[#94A3B8]">npm run study</span>, then reload.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-2">
      <div className="text-[12px] text-[#94A3B8]">No pairs under this filter</div>
      <p className="text-[11px] text-[#64748B] max-w-[320px] leading-relaxed">
        Nothing matches {statusFilter === 'curated'
          ? 'your search'
          : `the "${statusFilter === 'strict' ? 'Strict matches' : PAIR_STATUS[statusFilter as PairStatus]?.label}" filter and search`}{' '}
        right now.
      </p>
      <button onClick={onReset} className="text-[11px] text-[#06B6D4] hover:underline">Reset filters</button>
    </div>
  );
}
