import { useEffect, useRef, useState } from 'react';
import type { PairRow } from '../api/client.js';
import { verdictDisplay, PAIR_STATUS, usd, POLY, KALSHI, FEE } from '../lib/pairStatus.js';

/**
 * The queue — one row per cross-platform PAIR (an event on both venues), not per market. Each row
 * reads as a decision: a color-coded verdict rail, the two YES prices (blue/green), the gap as the
 * visual anchor, and the thinner-side liquidity beneath it. Sorted/filtered by the parent.
 */

/** Flash a price cell green/red for ~0.7s when the value changes on the live poll (dev/live only). */
function usePriceFlash(value: number): string {
  const prev = useRef(value);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (value !== prev.current) {
      const dir = value > prev.current ? 'flash-up' : 'flash-down';
      prev.current = value;
      setFlash(dir);
      const t = setTimeout(() => setFlash(''), 700);
      return () => clearTimeout(t);
    }
  }, [value]);
  return flash;
}

function PairRowItem({ pair, selected, onSelect }: { pair: PairRow; selected: boolean; onSelect: (id: string) => void }) {
  const v = verdictDisplay(pair);
  const railColor = v.strict ? KALSHI : v.suspicious ? '#F87171' : PAIR_STATUS[pair.status].color;
  const polyFlash = usePriceFlash(pair.polymarket.yes);
  const kalFlash = usePriceFlash(pair.kalshi.yes);
  return (
    <div
      onClick={() => onSelect(pair.id)}
      className={`group relative flex items-center gap-2 pl-3.5 pr-2.5 py-[7px] cursor-pointer transition-colors ${
        selected ? 'bg-[#0E1223]' : 'hover:bg-[#0E1223]/50'
      }`}
    >
      {/* Verdict rail — replaces the repeated chip: green = same-contract, amber = apparent gap,
          blue = candidate, red = suspected mismatch, gray = topical / near-settled. */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] transition-colors"
        style={{ background: selected ? '#06B6D4' : railColor, opacity: selected ? 1 : 0.7 }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {pair.strictSurvivor && !v.suspicious && (
            <span className="text-[#FBBF24] text-[9px] leading-none shrink-0" title="strict 7/7 contract match">★</span>
          )}
          {v.suspicious && (
            <span className="text-[#F87171] text-[9px] leading-none shrink-0" title={v.suspicious}>⚠</span>
          )}
          <div className="truncate text-[12px] text-[#E2E8F0] leading-tight group-hover:text-white">{pair.event}</div>
        </div>
        <div className="truncate text-[10px] text-[#64748B] leading-tight mt-[3px]">{pair.kalshi.title}</div>
      </div>

      <div className="flex items-center justify-end gap-1 shrink-0 w-[58px] font-mono text-[11px] tabular-nums">
        <span className={`w-7 text-right rounded-sm px-px ${polyFlash}`} style={{ color: POLY }} title="Polymarket YES">
          {Math.round(pair.polymarket.yes * 100)}
        </span>
        <span className="text-[#334155]">/</span>
        <span className={`w-7 text-right rounded-sm px-px ${kalFlash}`} style={{ color: KALSHI }} title="Kalshi YES">
          {Math.round(pair.kalshi.yes * 100)}
        </span>
      </div>

      <div className="w-[52px] shrink-0 flex flex-col items-end leading-none">
        <span
          className="font-mono text-[13px] font-semibold tabular-nums"
          style={{ color: pair.beatsFees ? FEE : '#475569' }}
          title={pair.beatsFees ? 'gap clears the fee floor' : 'gap inside the fee floor'}
        >
          {(pair.gap * 100).toFixed(1)}
        </span>
        <span className="font-mono text-[9px] text-[#475569] mt-1" title="thinner-side liquidity">
          {usd(pair.liquidity)}
        </span>
      </div>
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
          <div key={i} className="h-9 bg-[#0E1223] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="text-[12px]">
      <div className="sticky top-0 z-10 flex items-center gap-2 pl-3.5 pr-2.5 py-1 text-[9px] uppercase tracking-wider text-[#64748B] bg-[#020617] border-b border-[#1E293B]">
        <span className="flex-1">Event · both venues</span>
        <span className="w-[58px] text-right">
          <span style={{ color: POLY }}>Poly</span> / <span style={{ color: KALSHI }}>Kal</span>
        </span>
        <span className="w-[52px] text-right">Gap / Liq</span>
      </div>
      {pairs.map((p) => (
        <PairRowItem key={p.id} pair={p} selected={selectedId === p.id} onSelect={onSelect} />
      ))}
    </div>
  );
}
