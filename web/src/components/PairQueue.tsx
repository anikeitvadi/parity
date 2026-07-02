import type { PairRow } from '../api/client.js';
import { verdictDisplay, usd, POLY, KALSHI, FEE } from '../lib/pairStatus.js';

/**
 * The queue — one row per cross-platform PAIR (an event on both venues), not per market. Each row
 * reads as a decision: the two YES prices, the gap, how deep the thinner side is, and the verifier's
 * status. Sorted/filtered by the parent; this is pure presentation.
 */

function StatusChip({ pair }: { pair: PairRow }) {
  const v = verdictDisplay(pair);
  const title = v.suspicious
    ? `⚠ ${v.suspicious} — contract may differ`
    : v.strict
      ? 'Same contract · strict-spec verified (7/7)'
      : `${v.label} · cached verifier label, not strict-spec verified`;
  return (
    <span
      className={`w-[74px] shrink-0 text-center text-[8px] font-semibold rounded px-1 py-0.5 border ${v.chip}`}
      title={title}
    >
      {v.short}
    </span>
  );
}

function PairRowItem({ pair, selected, onSelect }: { pair: PairRow; selected: boolean; onSelect: (id: string) => void }) {
  const gapPct = (pair.gap * 100).toFixed(1);
  return (
    <div
      onClick={() => onSelect(pair.id)}
      className={`flex items-center gap-1.5 px-2 py-[6px] cursor-pointer border-l-2 transition-colors ${
        selected ? 'bg-[#0E1223] border-[#06B6D4]' : 'border-transparent hover:bg-[#0E1223]/60'
      }`}
    >
      <StatusChip pair={pair} />
      <div className="flex-1 min-w-0 px-0.5">
        <div className="truncate text-[#F8FAFC] leading-tight">{pair.event}</div>
        <div className="truncate text-[10px] text-[#64748B] leading-tight">{pair.kalshi.title}</div>
      </div>
      <span className="w-9 shrink-0 text-right font-mono tabular-nums" style={{ color: POLY }} title="Polymarket YES">
        {Math.round(pair.polymarket.yes * 100)}
      </span>
      <span className="w-9 shrink-0 text-right font-mono tabular-nums" style={{ color: KALSHI }} title="Kalshi YES">
        {Math.round(pair.kalshi.yes * 100)}
      </span>
      <span
        className="w-12 shrink-0 text-right font-mono tabular-nums"
        style={{ color: pair.beatsFees ? FEE : '#64748B' }}
        title={pair.beatsFees ? 'gap clears the fee floor' : 'gap inside the fee floor'}
      >
        {gapPct}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[#64748B] tabular-nums" title="thinner-side volume">
        {usd(pair.liquidity)}
      </span>
    </div>
  );
}

export function PairQueue({
  pairs,
  selectedId,
  onSelect,
  loading,
}: {
  pairs: PairRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  if (loading && pairs.length === 0) {
    return (
      <div className="p-3 space-y-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-8 bg-[#0E1223] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="text-[12px]">
      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-2 py-1 text-[9px] uppercase tracking-wider text-[#64748B] bg-[#020617] border-b border-[#1E293B]">
        <span className="w-[74px] shrink-0 text-center">Verdict</span>
        <span className="flex-1 px-0.5">Event · both venues</span>
        <span className="w-9 shrink-0 text-right" style={{ color: POLY }}>Poly</span>
        <span className="w-9 shrink-0 text-right" style={{ color: KALSHI }}>Kal</span>
        <span className="w-12 shrink-0 text-right">Gap</span>
        <span className="w-12 shrink-0 text-right">Liq</span>
      </div>
      {pairs.map((p) => (
        <PairRowItem key={p.id} pair={p} selected={selectedId === p.id} onSelect={onSelect} />
      ))}
    </div>
  );
}
