import { useMemo, useState, type ReactNode } from 'react';
import type { EfficiencyPair, StrictSurvivorPair } from '../../api/client';

/**
 * The survivor evidence wall — the "here are the gaps; here's why each isn't tradeable" layer.
 * Leads with the 83 LIQUID semantic survivors (real money on both sides), each carrying the
 * 7-point contract-spec checklist that culls them to 44; the other 138 of the 221 apparent gaps
 * sit under $500/side (thin) and are accounted for, not hidden. An "all 221" view renders the
 * full apparent set lite. Nothing here is called arbitrage — these are apparent gaps under audit.
 */

const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;
const pp = (g: number) => `${(g * 100).toFixed(1)}pp`;

const CHECKS: { key: keyof StrictSurvivorPair['checklist']; label: string }[] = [
  { key: 'same_event', label: 'Event' },
  { key: 'same_entity', label: 'Entity' },
  { key: 'same_window', label: 'Window' },
  { key: 'same_line', label: 'Line' },
  { key: 'same_settlement', label: 'Settle' },
  { key: 'same_direction', label: 'Dir' },
  { key: 'same_structure', label: 'Struct' },
];

type View = 'liquid' | 'strict' | 'mismatch' | 'all';

function Chip({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' }) {
  const c = tone === 'amber' ? 'bg-[#78350F]/40 text-[#FBBF24] border-[#92400E]/40' : 'bg-[#0E1223] text-[#94A3B8] border-[#1E293B]';
  return <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded border ${c} font-mono`}>{children}</span>;
}

/** The 7-point contract checklist as compact ticks; a failed check is the reason a "same event"
 *  pair is not the same contract. */
function Checklist({ c }: { c: StrictSurvivorPair['checklist'] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHECKS.map((ch) => {
        const ok = c[ch.key] as boolean;
        return (
          <span
            key={ch.key}
            title={`${ch.label}: ${ok ? 'match' : 'MISMATCH'}`}
            className={`text-[9px] font-mono px-1 py-0.5 rounded ${
              ok ? 'bg-[#064E3B]/40 text-[#6EE7B7]' : 'bg-[#7F1D1D]/50 text-[#FCA5A5]'
            }`}
          >
            {ok ? '✓' : '✗'} {ch.label}
          </span>
        );
      })}
    </div>
  );
}

function RichCard({ p }: { p: StrictSurvivorPair }) {
  return (
    <div className="border border-[#1E293B] rounded-md bg-[#0E1223] p-3 break-inside-avoid mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {p.category && <Chip>{p.category}</Chip>}
          <Chip>{usd(p.thinnerSideVolume)} / side</Chip>
        </div>
        <span className={`font-mono tabular-nums text-[12px] ${p.gap > 0.09 ? 'text-[#FBBF24]' : 'text-[#94A3B8]'}`}>{pp(p.gap)}</span>
      </div>
      <div className="space-y-1 mb-2">
        <div className="text-[11px] text-[#CBD5E1] leading-snug">
          <span className="text-[#60A5FA] font-mono text-[9px] mr-1">POLY</span>
          {p.polymarketQuestion}
        </div>
        <div className="text-[11px] text-[#CBD5E1] leading-snug">
          <span className="text-[#22C55E] font-mono text-[9px] mr-1">KALSHI</span>
          {p.kalshiQuestion}
        </div>
      </div>
      <Checklist c={p.checklist} />
      {p.strict_survivor ? (
        <div className="text-[10px] text-[#6EE7B7] mt-1.5 font-mono">spec-match — same contract</div>
      ) : (
        <div className="text-[10px] text-[#FCA5A5] mt-1.5">
          spec mismatch{p.spec_mismatch_reason ? ` — ${p.spec_mismatch_reason}` : ''}
        </div>
      )}
    </div>
  );
}

function LiteCard({ p }: { p: EfficiencyPair }) {
  return (
    <div className="border border-[#1E293B] rounded-md bg-[#0E1223] p-2.5 break-inside-avoid mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {p.category && <Chip>{p.category}</Chip>}
          <Chip>{usd(p.volume)}</Chip>
        </div>
        <span className={`font-mono tabular-nums text-[12px] ${p.gap > 0.09 ? 'text-[#FBBF24]' : 'text-[#94A3B8]'}`}>{pp(p.gap)}</span>
      </div>
      <div className="text-[11px] text-[#CBD5E1] leading-snug">
        <span className="text-[#60A5FA] font-mono text-[9px] mr-1">POLY</span>
        {p.question}
      </div>
      <div className="text-[11px] text-[#CBD5E1] leading-snug">
        <span className="text-[#22C55E] font-mono text-[9px] mr-1">KALSHI</span>
        {p.kalshiQuestion}
      </div>
    </div>
  );
}

const TABS: { key: View; label: string }[] = [
  { key: 'liquid', label: 'Liquid' },
  { key: 'strict', label: 'Spec-match' },
  { key: 'mismatch', label: 'Spec mismatch' },
  { key: 'all', label: 'All apparent' },
];

export function EvidenceWall({
  survivors,
  apparent,
  specMismatchReasons,
  semanticCount,
}: {
  survivors: StrictSurvivorPair[];
  apparent: EfficiencyPair[];
  specMismatchReasons: Record<string, number>;
  semanticCount: number;
}) {
  const [view, setView] = useState<View>('liquid');

  const liquidSorted = useMemo(
    () => [...survivors].sort((a, b) => b.thinnerSideVolume - a.thinnerSideVolume),
    [survivors]
  );
  const apparentSorted = useMemo(() => [...apparent].sort((a, b) => b.volume - a.volume), [apparent]);

  const counts: Record<View, number> = {
    liquid: survivors.length,
    strict: survivors.filter((p) => p.strict_survivor).length,
    mismatch: survivors.filter((p) => !p.strict_survivor).length,
    all: semanticCount,
  };
  const thin = semanticCount - survivors.length;

  const richList =
    view === 'strict'
      ? liquidSorted.filter((p) => p.strict_survivor)
      : view === 'mismatch'
        ? liquidSorted.filter((p) => !p.strict_survivor)
        : liquidSorted;

  const topReasons = Object.entries(specMismatchReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="border border-[#1E293B] rounded-md bg-[#020617] p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-[14px] font-semibold text-[#F8FAFC]">The survivors</h2>
        <span className="text-[10px] text-[#64748B]">apparent gaps under audit — not arbitrage claims</span>
      </div>
      <p className="text-[11px] text-[#94A3B8] leading-relaxed mb-3 max-w-[760px]">
        {semanticCount} apparent gaps clear the {`9pp`} fee line and pass entity/scope verification. But{' '}
        <span className="text-[#CBD5E1]">{thin}</span> sit under $500 a side — too thin to trade. These{' '}
        <span className="text-[#CBD5E1]">{survivors.length}</span> have real money on both sides, so a 7-point contract
        check decides whether each is genuinely the <span className="text-[#CBD5E1]">same contract</span> — and it
        clears {counts.strict} of them, killing {counts.mismatch} on spec mismatch.
      </p>

      {/* Why the mismatches die — the punchline histogram. */}
      {topReasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[10px] text-[#64748B] uppercase tracking-wider">Top mismatch reasons:</span>
          {topReasons.map(([reason, n]) => (
            <Chip key={reason} tone="amber">
              {reason} · {n}
            </Chip>
          ))}
        </div>
      )}

      {/* View switch */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`text-[11px] px-2.5 py-1 rounded font-mono transition-colors ${
              view === t.key ? 'bg-[#1E293B] text-[#F8FAFC]' : 'bg-[#0E1223] text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            {t.label} <span className="tabular-nums">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* The wall — masonry via CSS columns; 221 nodes max, no virtualization needed. */}
      <div className="max-h-[560px] overflow-y-auto pr-1 [column-fill:_balance] columns-1 sm:columns-2 lg:columns-3 gap-3">
        {view === 'all'
          ? apparentSorted.map((p, i) => <LiteCard key={`${p.polymarketId ?? i}-${i}`} p={p} />)
          : richList.map((p, i) => <RichCard key={`${p.polymarketId}-${i}`} p={p} />)}
      </div>
    </div>
  );
}
