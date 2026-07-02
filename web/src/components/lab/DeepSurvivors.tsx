import { useMemo } from 'react';
import type { StrictSurvivorPair } from '../../api/client';

/**
 * The deep four — the strict spec-match survivors with > $10k on the thinner side. These clear
 * every automated gate, so they're the honest last word: even here the residual gap traces to
 * resolution-language nuance or live/near-resolved timing, not free money. We do NOT assert a
 * per-pair verdict; instead we diff the two real questions and highlight where their wording
 * diverges, letting the contract nuance show itself. Executability stays unproven.
 */

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);

const STOP = new Set([
  'will', 'be', 'the', 'a', 'an', 'of', 'on', 'in', 'at', 'to', 'or', 'and', 'by', 'is', 'are',
  'vs', 'vs.', 'for', 'with', 'than', 'more', '2026', 'q2', 'when', 'total',
]);
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9.]/g, '');

/** Render `text`, highlighting meaningful tokens that do NOT appear on the other side — so the
 *  contract-language divergence (e.g. "Champion" vs "Title Holder") surfaces from the data itself. */
export function DiffText({ text, other }: { text: string; other: string }) {
  const otherSet = useMemo(() => new Set(other.split(/\s+/).map(norm).filter(Boolean)), [other]);
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok)) return tok;
        const n = norm(tok);
        const unique = n.length > 2 && !STOP.has(n) && !otherSet.has(n);
        return unique ? (
          <span key={i} className="text-[#FBBF24] bg-[#78350F]/30 rounded px-0.5">
            {tok}
          </span>
        ) : (
          <span key={i}>{tok}</span>
        );
      })}
    </>
  );
}

export function DeepSurvivors({ survivors }: { survivors: StrictSurvivorPair[] }) {
  const deep = useMemo(
    () =>
      survivors
        .filter((p) => p.strict_survivor && p.liquidity_tier === '>10k')
        .sort((a, b) => b.thinnerSideVolume - a.thinnerSideVolume),
    [survivors]
  );
  if (deep.length === 0) return null;

  return (
    <div className="border border-[#1E293B] rounded-md bg-[#0E1223] p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-[14px] font-semibold text-[#F8FAFC]">The deep {deep.length === 4 ? 'four' : deep.length}</h2>
        <span className="text-[10px] text-[#64748B]">&gt; $10k / side · pass all 7 contract checks</span>
      </div>
      <p className="text-[11px] text-[#94A3B8] leading-relaxed mb-4 max-w-[760px]">
        The last line of defense is manual. These survive every automated gate, yet a price gap
        remains. Read the two phrasings — the residual traces to resolution-language nuance or to
        timing on live / near-resolved markets, not to free money.
      </p>

      <div className="space-y-2.5">
        {deep.map((p, i) => (
          <div key={`${p.polymarketId}-${i}`} className="border border-[#1E293B] rounded-md bg-[#020617] p-3">
            <div className="flex items-center gap-2 mb-2 text-[9px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-[#0E1223] border border-[#1E293B] text-[#94A3B8]">{p.category}</span>
              <span className="px-1.5 py-0.5 rounded bg-[#0E1223] border border-[#1E293B] text-[#94A3B8]">{usd(p.thinnerSideVolume)} / side</span>
              <span className="px-1.5 py-0.5 rounded bg-[#78350F]/40 border border-[#92400E]/40 text-[#FBBF24] tabular-nums">{(p.gap * 100).toFixed(1)}pp gap</span>
              <span className="px-1.5 py-0.5 rounded bg-[#064E3B]/40 text-[#6EE7B7]">7/7 checks</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="text-[11.5px] text-[#CBD5E1] leading-snug">
                <span className="text-[#60A5FA] font-mono text-[9px] block mb-0.5">POLYMARKET</span>
                <DiffText text={p.polymarketQuestion} other={p.kalshiQuestion} />
              </div>
              <div className="text-[11.5px] text-[#CBD5E1] leading-snug">
                <span className="text-[#22C55E] font-mono text-[9px] block mb-0.5">KALSHI</span>
                <DiffText text={p.kalshiQuestion} other={p.polymarketQuestion} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#64748B] mt-4 leading-relaxed border-t border-[#1E293B] pt-3">
        Executability is unproven: no order-book depth, slippage, or settlement-timing test has been run.
        &ldquo;Same contract&rdquo; is a semantic and spec verdict — not a risk-free trade.
      </p>
    </div>
  );
}
