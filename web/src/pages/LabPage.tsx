import React, { useEffect, useState } from 'react';
import { fetchEfficiencyStudy, type EfficiencyStudy, type EfficiencyPair } from '../api/client.js';

/** A single headline number with a label and optional sublabel. */
function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="border border-[#1E293B] rounded-md px-4 py-3 bg-[#0E1223]">
      <div className="text-[22px] font-semibold text-[#F8FAFC] tabular-nums leading-none">{value}</div>
      <div className="text-[11px] text-[#94A3B8] mt-1.5">{label}</div>
      {sub && <div className="text-[10px] text-[#64748B] mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Scatter of every matched cross-platform pair: Polymarket price (x) vs Kalshi
 * price (y). Points on the dashed diagonal = the two platforms agree. The whole
 * story is how tightly everything hugs the line — and how few points there are.
 */
function PairScatter({ pairs, fees }: { pairs: EfficiencyPair[]; fees: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 520;
  const H = 520;
  const pad = { top: 20, right: 20, bottom: 44, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const toX = (p: number) => pad.left + p * plotW;
  const toY = (p: number) => pad.top + (1 - p) * plotH;

  const hp = hovered != null ? pairs[hovered] : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[520px]">
      <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="#0E1223" rx="4" />

      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={toX(v)} y1={pad.top} x2={toX(v)} y2={pad.top + plotH} stroke="#1E293B" strokeWidth="1" />
          <line x1={pad.left} y1={toY(v)} x2={pad.left + plotW} y2={toY(v)} stroke="#1E293B" strokeWidth="1" />
          <text x={toX(v)} y={pad.top + plotH + 16} fill="#64748B" fontSize="10" textAnchor="middle" fontFamily="IBM Plex Mono">{Math.round(v * 100)}%</text>
          <text x={pad.left - 8} y={toY(v) + 3} fill="#64748B" fontSize="10" textAnchor="end" fontFamily="IBM Plex Mono">{Math.round(v * 100)}%</text>
        </g>
      ))}

      {/* Diagonal = platforms agree */}
      <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />

      <text x={pad.left + plotW / 2} y={H - 6} fill="#64748B" fontSize="10" textAnchor="middle">Polymarket price →</text>
      <text x={14} y={pad.top + plotH / 2} fill="#64748B" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${pad.top + plotH / 2})`}>Kalshi price →</text>

      {pairs.map((p, i) => {
        const r = Math.max(4, Math.min(16, 3 + Math.log10(Math.max(p.volume, 1)) * 2));
        // Red when the gap clears round-trip fees (a "real-looking" gap), else cyan.
        const beatsFees = p.gap > fees;
        const isHovered = hovered === i;
        return (
          <circle
            key={i}
            cx={toX(p.polymarketYes)}
            cy={toY(p.kalshiYes)}
            r={isHovered ? r + 2 : r}
            fill={beatsFees ? '#EF4444' : '#22D3EE'}
            opacity={isHovered ? 1 : 0.8}
            stroke={isHovered ? '#F8FAFC' : 'none'}
            strokeWidth={isHovered ? 1.5 : 0}
            className="cursor-pointer transition-all duration-150"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        );
      })}

      {hp && (
        <g>
          <rect x={Math.min(toX(hp.polymarketYes) + 10, W - 240)} y={Math.max(toY(hp.kalshiYes) - 52, pad.top)} width={230} height={48} fill="#020617" stroke="#334155" strokeWidth="1" rx="4" opacity="0.97" />
          <text x={Math.min(toX(hp.polymarketYes) + 18, W - 232)} y={Math.max(toY(hp.kalshiYes) - 36, pad.top + 16)} fill="#F8FAFC" fontSize="10" fontFamily="IBM Plex Sans">
            {hp.question.slice(0, 42)}{hp.question.length > 42 ? '…' : ''}
          </text>
          <text x={Math.min(toX(hp.polymarketYes) + 18, W - 232)} y={Math.max(toY(hp.kalshiYes) - 20, pad.top + 32)} fill="#94A3B8" fontSize="9" fontFamily="IBM Plex Mono">
            P {Math.round(hp.polymarketYes * 100)}% · K {Math.round(hp.kalshiYes * 100)}% · gap {(hp.gap * 100).toFixed(1)}pp · sim {(hp.similarity * 100).toFixed(0)}%
          </text>
        </g>
      )}
    </svg>
  );
}

function ExperimentCard({ status, title, body }: { status: 'done' | 'running'; title: string; body: string }) {
  return (
    <div className="border border-[#1E293B] rounded-md p-3 bg-[#0E1223]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${status === 'done' ? 'bg-[#064E3B] text-[#6EE7B7]' : 'bg-[#1E293B] text-[#94A3B8]'}`}>
          {status === 'done' ? 'Done' : 'Running'}
        </span>
        <span className="text-[12px] font-semibold text-[#F8FAFC]">{title}</span>
      </div>
      <p className="text-[11px] text-[#94A3B8] leading-relaxed">{body}</p>
    </div>
  );
}

export function LabPage() {
  const [state, setState] = useState<{ loading: boolean; study?: EfficiencyStudy; error?: string }>({ loading: true });

  useEffect(() => {
    fetchEfficiencyStudy()
      .then((r) => {
        if (!r.available || !r.study) setState({ loading: false, error: 'No study artifact yet. Run `npm run study`.' });
        else setState({ loading: false, study: r.study });
      })
      .catch((e) => setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' }));
  }, []);

  if (state.loading) {
    return <div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">Loading lab…</div>;
  }
  if (state.error || !state.study) {
    return <div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">{state.error}</div>;
  }

  const s = state.study;
  const overlapPct = ((s.matching.matchedPairs / s.universe.total) * 100).toFixed(1);
  const date = new Date(s.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-[920px] mx-auto">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-[16px] font-semibold text-[#F8FAFC]">Market Efficiency Lab</h1>
          <span className="text-[10px] text-[#64748B] font-mono">measured {date} · regenerate: npm run study</span>
        </div>
        <p className="text-[12px] text-[#94A3B8] mb-4 max-w-[640px]">
          Does a retail trader have a cross-platform edge between Polymarket and Kalshi? This is the
          measurement, not a verdict. Experiment 1 below is conclusive and reproducible.
        </p>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Stat value={s.universe.total.toLocaleString()} label="Live markets scanned" sub={`Poly ${s.universe.polymarket.toLocaleString()} · Kalshi ${s.universe.kalshi.toLocaleString()}`} />
          <Stat value={String(s.matching.matchedPairs)} label="Same event, both platforms" sub={`${overlapPct}% overlap · cosine ≥ ${s.matching.similarityThreshold}`} />
          <Stat value={`${(s.gapDistribution.medianGap * 100).toFixed(1)}pp`} label="Median price gap" sub={`fees cost ${(s.fees.roundTrip * 100).toFixed(0)}pp round-trip`} />
          <Stat value={String(s.actionable.meetsDetectorThreshold_19pp)} label="Tradeable gaps" sub="clear fees + arb threshold" />
        </div>

        <div className="grid md:grid-cols-[520px_1fr] gap-5 items-start">
          {/* Experiment 1: the scatter */}
          <div className="border border-[#1E293B] rounded-md p-3 bg-[#020617]">
            <div className="mb-2">
              <div className="text-[12px] font-semibold text-[#F8FAFC]">Experiment 1 — Cross-platform efficiency</div>
              <div className="text-[10px] text-[#64748B]">
                Each dot is one event on both platforms. On the dashed line = prices agree.
                Red = gap beats fees. {s.matching.matchedPairs} points out of {s.universe.total.toLocaleString()} markets.
              </div>
            </div>
            <PairScatter pairs={s.pairs} fees={s.fees.roundTrip} />
          </div>

          {/* Findings + other experiments */}
          <div className="space-y-3">
            <div className="border border-[#1E293B] rounded-md p-3 bg-[#0E1223]">
              <div className="text-[12px] font-semibold text-[#F8FAFC] mb-1.5">What the data says</div>
              <ul className="text-[11px] text-[#94A3B8] leading-relaxed space-y-1.5 list-disc pl-4">
                <li>The platforms barely list the same events: <span className="text-[#F8FAFC]">{s.matching.matchedPairs} of {s.universe.total.toLocaleString()}</span> ({overlapPct}%).</li>
                <li>Where they overlap, the median gap ({(s.gapDistribution.medianGap * 100).toFixed(1)}pp) is below the {(s.fees.roundTrip * 100).toFixed(0)}pp round-trip fee floor.</li>
                <li><span className="text-[#F8FAFC]">{s.actionable.meetsDetectorThreshold_19pp}</span> gaps clear the arbitrage threshold. The largest is most likely a settlement-definition mismatch, not free money.</li>
              </ul>
            </div>
            <ExperimentCard status="running" title="Experiment 2 — Metaculus vs. market" body="When superforecasters disagree with the market by 10+ points, who's right? A backtest that needs resolved outcomes over time — the harness is collecting them now." />
            <ExperimentCard status="running" title="Experiment 3 — Personal calibration" body="Log your probability calls, score them with Brier, and see where you're overconfident. The method works; the sample is still thin." />
          </div>
        </div>
      </div>
    </div>
  );
}
