import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPairs, fetchEfficiencyStudy, type PairsResponse, type PairRow, type PairStatus, type EfficiencyStudy, type PairLive } from '../api/client.js';
import { PairQueue } from '../components/PairQueue.js';
import { PairDossier } from '../components/PairDossier.js';
import { PAIR_STATUS } from '../lib/pairStatus.js';
import { useCountUp } from '../lib/useCountUp.js';

type StatusFilter = 'curated' | 'strict' | PairStatus;
type SortKey = 'opportunity' | 'gap' | 'liquidity';

const LOAD_STAGES = [
  'fetching the cached verifier corpus…',
  'pulling live order books from both venues…',
  'pricing every matched pair…',
];

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
  const [study, setStudy] = useState<EfficiencyStudy | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoSelected = useRef(false);

  // Re-price the terminal on demand (and every 120s). This is the live capability — it re-fetches
  // current prices for the cached, batch-verified corpus; it does NOT re-run the verification batch.
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetchPairs();
      setData(r);
    } catch { /* keep prior data */ }
    finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 120_000);
    return () => clearInterval(t);
  }, [reload]);

  // The funnel headline (52,858 → 3,791 cross-listed → 0) comes from the Efficiency Lab study.
  useEffect(() => {
    fetchEfficiencyStudy().then((r) => setStudy(r.study ?? null)).catch(() => {});
  }, []);

  // The first load really does this work (~12s): read the cached verifier corpus, pull both
  // venues' active books, and re-price every matched pair. Narrate it instead of a bare spinner.
  const [loadStage, setLoadStage] = useState(0);
  useEffect(() => {
    if (data) return;
    setLoadStage(0);
    const t1 = setTimeout(() => setLoadStage(1), 3500);
    const t2 = setTimeout(() => setLoadStage(2), 8500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [data]);

  // Live prices reported back by the open dossier overwrite the corpus prices in the queue,
  // so a row and its dossier never show two different gaps for the same pair.
  const [liveById, setLiveById] = useState<Record<string, PairLive>>({});
  const onLive = useCallback((id: string, live: PairLive) => setLiveById((m) => ({ ...m, [id]: live })), []);

  const pairs = useMemo(() => {
    const base = data?.pairs ?? [];
    if (!Object.keys(liveById).length) return base;
    return base.map((p) => {
      const l = liveById[p.id];
      if (!l) return p;
      // Both venues confirmed closed by the per-pair probe — the only evidence strong enough to
      // call a pair settled. Bulk-scan "not live" is too weak (ID churn / partial venue pulls).
      const settledLive = !!(l.polymarket?.found && l.kalshi?.found && !l.polymarket.active && !l.kalshi.active);
      const polyLive = l.polymarket?.found && l.polymarket.yes != null ? l.polymarket.yes : null;
      const kalRaw = l.kalshi?.found && l.kalshi.yes != null ? l.kalshi.yes : null;
      if (polyLive == null && kalRaw == null) return { ...p, settledLive };
      const kalLive = kalRaw == null ? null : p.yesAligned ? kalRaw : 1 - kalRaw;
      const polyYes = polyLive ?? p.polymarket.yes;
      const kalYes = kalLive ?? p.kalshi.yes;
      return {
        ...p,
        settledLive,
        polymarket: { ...p.polymarket, yes: polyYes },
        kalshi: { ...p.kalshi, yes: kalYes },
        gap: polyYes != null && kalYes != null ? Math.abs(polyYes - kalYes) : p.gap,
      };
    });
  }, [data, liveById]);
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
    // A pair with no live book on either side can't be traded — its corpus "gap" is history,
    // not opportunity. Demote those below every live pair regardless of sort.
    const settledLast = (a: PairRow, b: PairRow, cmp: number) => {
      const aDead = !!a.settledLive;
      const bDead = !!b.settledLive;
      if (aDead !== bDead) return aDead ? 1 : -1;
      return cmp;
    };
    if (sort === 'gap') out.sort((a, b) => settledLast(a, b, b.gap - a.gap));
    else if (sort === 'liquidity') out.sort((a, b) => settledLast(a, b, b.liquidity - a.liquidity));
    // 'opportunity' keeps the server's credibility order (survivors → strict → liquidity), settled last.
    else out.sort((a, b) => settledLast(a, b, 0));
    return out;
  }, [pairs, statusFilter, search, sort]);

  const selected: PairRow | null = useMemo(
    () => pairs.find((p) => p.id === selectedId) ?? null,
    [pairs, selectedId]
  );

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  // Open the top pair on first load so the dossier is never a blank pane.
  useEffect(() => {
    if (!autoSelected.current && filtered.length > 0) {
      autoSelected.current = true;
      setSelectedId(filtered[0].id);
    }
  }, [filtered]);

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
  const chips: { id: StatusFilter; label: string; count?: number; color?: string; title?: string }[] = [
    { id: 'curated', label: 'Matches', count: counts ? counts.survivor + counts.same_contract : undefined },
    {
      id: 'survivor',
      label: 'Apparent gaps',
      count: counts?.survivor,
      color: PAIR_STATUS.survivor.color,
      title:
        'After all 45 strict-recheck corrections: 221 in the study − 45 corrected = 176. The Lab counts 215 because it applies the 39 strict-recheck kills at the strict gate of the funnel instead.',
    },
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
      {/* The thesis, stated before a click: the whole funnel from tradeable universe to 0 executable. */}
      <VerdictStrip funnel={study?.funnel} universeTotal={study?.universe.total} />

      {/* Header: freshness + search + status chips + sort */}
      <div className="shrink-0 border-b border-[#1E293B] bg-[#0E1223]">
        <div className="h-11 flex items-center gap-2.5 px-4">
          <div className="shrink-0">
            <div className="text-[11px] font-semibold text-[#E2E8F0] leading-none">Live cross-platform pairs</div>
            <div className="text-[9px] text-[#64748B] mt-0.5">
              {verifiedDate ? `cached verifier run · ${verifiedDate}` : LOAD_STAGES[loadStage]}
              {data ? ` · ${data.meta.total.toLocaleString()} pairs · open one for live prices` : ''}
              {data?.meta.pricesAsOf
                ? ` · prices as of ${new Date(data.meta.pricesAsOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : ''}
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
          <button
            onClick={reload}
            disabled={refreshing}
            title="Re-fetch current prices for the verified corpus (does not re-run the verification batch)"
            className="ml-1 flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded text-[#64748B] hover:text-[#06B6D4] transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
            {refreshing ? 'refreshing…' : 'refresh prices'}
          </button>
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
              title={ch.title}
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
          <PairDossier pair={selected} onOpenLab={onOpenLab} verification={data?.meta.verification ?? null} onLive={onLive} />
        </div>
      </div>
    </div>
  );
}

function FunnelNum({ value, label, color, hero }: { value: number; label: string; color?: string; hero?: boolean }) {
  const shown = useCountUp(value);
  return (
    <div className="flex flex-col leading-none shrink-0">
      <span
        className={`font-mono tabular-nums font-bold ${hero ? 'text-[22px]' : 'text-[18px]'}`}
        style={{ color: color ?? '#F8FAFC' }}
      >
        {shown.toLocaleString()}
      </span>
      <span className="text-[9px] text-[#64748B] uppercase tracking-wider mt-1">{label}</span>
    </div>
  );
}

/**
 * The verdict strip — the funnel from tradeable universe to zero executable arbitrage, stated as the
 * Scanner's headline before any click. Numbers count up on load; the terminal-green 0 is the finding.
 */
function VerdictStrip({ funnel, universeTotal }: { funnel?: EfficiencyStudy['funnel']; universeTotal?: number }) {
  const audited = funnel?.tradeable ?? universeTotal ?? 0;
  const crossListed = funnel?.sameContract ?? 0;
  const executable = funnel?.clearExecutableArb ?? 0;
  const Arrow = () => <span className="text-[#334155] text-[15px] shrink-0 px-0.5">→</span>;
  return (
    <div className="shrink-0 border-b border-[#1E293B] bg-gradient-to-r from-[#0B1120] via-[#111a30] to-[#0B1120] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <FunnelNum value={audited} label="tradeable markets" />
        <Arrow />
        <FunnelNum value={crossListed} label="same-contract candidates" color="#38BDF8" />
        <Arrow />
        <FunnelNum value={executable} label="executable arbitrage" color="#22C55E" hero />
        <div className="flex-1" />
        <div className="hidden lg:block text-right shrink-0">
          <div className="text-[12px] text-[#E2E8F0] font-semibold leading-tight">Easy to find. Hard to execute.</div>
          <div className="text-[9px] text-[#64748B] leading-tight mt-0.5">every apparent edge, run to ground</div>
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
