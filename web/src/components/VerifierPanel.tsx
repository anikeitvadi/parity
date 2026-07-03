import React from 'react';
import { STATE_META, TONE_CLASS, type VerifierRecord } from '../lib/verifier.js';
import type { StrictSurvivorChecklist } from '../api/client.js';

/**
 * The selected market's study-backed verdict — the decision-pane counterpart to the queue's Verif
 * chip. When this live market joined the frozen study (~19%), we render its real cross-platform
 * counterpart, a gap ruler against the round-trip fee floor, the 7-point contract checklist, and an
 * honest is-this-actionable line. When it did NOT join, we say so plainly ("live only") rather than
 * implying a verification that never ran.
 */

const POLY = '#60A5FA';
const KALSHI = '#22C55E';
const FEE = '#F59E0B';

const CHECKS: { key: keyof StrictSurvivorChecklist; label: string }[] = [
  { key: 'same_event', label: 'Event' },
  { key: 'same_entity', label: 'Entity' },
  { key: 'same_window', label: 'Window' },
  { key: 'same_line', label: 'Line' },
  { key: 'same_settlement', label: 'Settle' },
  { key: 'same_direction', label: 'Dir' },
  { key: 'same_structure', label: 'Struct' },
];

/** One-line "is there anything to act on here" verdict, derived from the terminal state. */
function actionability(rec: VerifierRecord): { tone: 'slate' | 'amber' | 'red' | 'green'; text: string } {
  switch (rec.state) {
    case 'candidate':
      return { tone: 'slate', text: 'Prices agree within the fee floor — no cross-platform edge to act on.' };
    case 'semantic_survivor':
      return { tone: 'amber', text: 'Apparent gap clears fees, but the thinner side is under $500 — too thin to execute.' };
    case 'spec_mismatch':
      return { tone: 'red', text: 'The gap is an illusion: a different contract on inspection — not the same bet.' };
    case 'strict_match':
      return { tone: 'green', text: 'Same contract on all seven checks — yet executability is unproven (no depth / slippage / timing test).' };
    case 'deep_survivor':
      return { tone: 'green', text: 'Survives every automated gate; the residual traces to wording or timing, not free money.' };
    default:
      return { tone: 'slate', text: '' };
  }
}

/** Absolute-price ruler: both YES prices on a 0–100% track with the gap shaded between them. */
function GapRuler({ polyYes, kalshiYes, clears }: { polyYes: number; kalshiYes: number; clears: boolean }) {
  const lo = Math.min(polyYes, kalshiYes);
  const hi = Math.max(polyYes, kalshiYes);
  const gapColor = clears ? FEE : '#475569';
  return (
    <div className="relative h-6">
      {/* track */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#1E293B]" />
      {/* shaded gap segment */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full"
        style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, background: gapColor, opacity: 0.7 }}
      />
      {/* platform markers */}
      <Marker pct={polyYes} color={POLY} />
      <Marker pct={kalshiYes} color={KALSHI} />
    </div>
  );
}

function Marker({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      className="absolute top-1/2 w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-[#0E1223]"
      style={{ left: `${pct * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function PriceStat({ platform, yes }: { platform: 'polymarket' | 'kalshi'; yes: number }) {
  const poly = platform === 'polymarket';
  return (
    <div>
      <div className="text-[10px] font-mono" style={{ color: poly ? POLY : KALSHI }}>
        {poly ? 'POLYMARKET' : 'KALSHI'}
      </div>
      <div className="text-[18px] font-mono font-bold text-[#F8FAFC] tabular-nums">{Math.round(yes * 100)}%</div>
    </div>
  );
}

export function VerifierPanel({
  rec,
  feeFloorPp = 9,
}: {
  rec?: VerifierRecord;
  feeFloorPp?: number;
}) {
  // Not in the frozen study — say so plainly, no implied verification.
  if (!rec) {
    return (
      <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-[#64748B] uppercase tracking-wider">Study verification</span>
          <span className={`text-[8px] font-semibold rounded px-1.5 py-0.5 ${TONE_CLASS.slate}`}>LIVE ONLY</span>
        </div>
        <p className="text-[11px] text-[#64748B] leading-relaxed">
          Not in the frozen study run — its cross-platform match is unverified. The
          <span className="text-[#94A3B8]"> Study Explorer</span> holds the audited survivor set.
        </p>
      </div>
    );
  }

  const meta = STATE_META[rec.state];
  const verdict = actionability(rec);
  const gapPp = rec.gap * 100;
  const hasPrices = (rec.polyYes ?? 0) > 0 && (rec.kalshiYes ?? 0) > 0;

  return (
    <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#64748B] uppercase tracking-wider">Study verification</span>
        <span className={`text-[8px] font-semibold rounded px-1.5 py-0.5 ${TONE_CLASS[meta.tone]}`} title={meta.blurb}>
          {meta.label}
        </span>
      </div>

      {/* Counterpart question */}
      {rec.counterpartQuestion && (
        <div>
          <div className="text-[9px] font-mono mb-0.5" style={{ color: rec.counterpartPlatform === 'polymarket' ? POLY : KALSHI }}>
            {rec.counterpartPlatform === 'polymarket' ? 'POLYMARKET' : 'KALSHI'} counterpart
          </div>
          <div className="text-[11px] text-[#CBD5E1] leading-snug">{rec.counterpartQuestion}</div>
        </div>
      )}

      {/* Gap ruler against the fee floor */}
      {hasPrices && (
        <div>
          <div className="flex items-start justify-between mb-1.5">
            <PriceStat platform="polymarket" yes={rec.polyYes!} />
            <PriceStat platform="kalshi" yes={rec.kalshiYes!} />
          </div>
          <GapRuler polyYes={rec.polyYes!} kalshiYes={rec.kalshiYes!} clears={rec.feeClearing} />
          <div className="flex items-center justify-between text-[10px] mt-1">
            <span className="font-mono tabular-nums" style={{ color: rec.feeClearing ? FEE : '#94A3B8' }}>
              {gapPp.toFixed(1)}pp gap
            </span>
            <span className="text-[#64748B]">
              {rec.feeClearing ? 'clears' : 'within'} the {feeFloorPp}pp round-trip fee floor
            </span>
          </div>
        </div>
      )}

      {/* 7-point contract checklist (liquid survivors only) */}
      {rec.checklist && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {CHECKS.map((ch) => {
            const ok = rec.checklist![ch.key] as boolean;
            return (
              <span
                key={ch.key}
                title={`${ch.label}: ${ok ? 'match' : 'MISMATCH'}`}
                className={`text-[9px] font-mono px-1 py-0.5 rounded ${ok ? 'bg-[#064E3B]/40 text-[#6EE7B7]' : 'bg-[#7F1D1D]/50 text-[#FCA5A5]'}`}
              >
                {ok ? '✓' : '✗'} {ch.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Spec-mismatch reason — the concrete reason the gap is not the same bet */}
      {rec.specMismatchReason && (
        <div className="text-[10px] text-[#FCA5A5] leading-snug">spec mismatch — {rec.specMismatchReason}</div>
      )}

      {/* Is-this-actionable verdict */}
      {verdict.text && (
        <div className={`text-[11px] leading-snug rounded px-2 py-1.5 ${TONE_CLASS[verdict.tone]}`}>
          {verdict.text}
        </div>
      )}
    </div>
  );
}
