import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
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

/** Shared dark-theme styling for every Plot figure. */
const PLOT_STYLE = {
  background: 'transparent',
  color: '#94A3B8',
  fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
  fontSize: '10px',
} as const;

/** The three decision lines the app applies to a raw gap, in percentage points. */
const THRESHOLDS = [
  { pp: 3, label: '3pp surfaced', color: '#22D3EE' },
  { pp: 9, label: '9pp fees', color: '#F59E0B' },
  { pp: 19, label: '19pp detector', color: '#EF4444' },
];

interface ChartPair {
  question: string;
  gapPp: number;
  similarity: number;
  volume: number;
  beatsFees: boolean;
}

/**
 * Renders an Observable Plot figure responsively: it measures its own width and
 * re-plots when the width or the render function changes. `render` is given the
 * measured pixel width and returns a Plot node.
 */
function PlotFigure({ render }: { render: (width: number) => SVGSVGElement | HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0]?.contentRect.width ?? 0));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const node = render(width);
    el.append(node);
    return () => node.remove();
  }, [render, width]);

  return <div ref={ref} className="w-full" />;
}

/**
 * Experiment 1, chart 1 — every matched pair's gap on one axis, with the three
 * decision lines overlaid. The whole point reads in a glance: all seven gaps sit
 * left of the fee line, and the single largest doesn't reach the detector line.
 */
function GapDistribution({ pairs }: { pairs: ChartPair[] }) {
  const render = useCallback(
    (width: number) =>
      Plot.plot({
        width,
        height: 150,
        marginTop: 30,
        marginBottom: 36,
        marginLeft: 16,
        marginRight: 16,
        style: PLOT_STYLE,
        x: {
          domain: [0, 22],
          label: 'Absolute YES-price gap (pp) →',
          ticks: [0, 3, 9, 19],
          tickFormat: (d: number) => `${d}`,
          grid: false,
        },
        y: { axis: null, domain: [-1, 1] },
        marks: [
          Plot.ruleX([0], { stroke: '#1E293B' }),
          ...THRESHOLDS.map((t) =>
            Plot.ruleX([t.pp], { stroke: t.color, strokeDasharray: '3,3', strokeOpacity: 0.8 })
          ),
          Plot.text(THRESHOLDS, {
            x: 'pp',
            y: () => 1,
            text: 'label',
            fill: (d: (typeof THRESHOLDS)[number]) => d.color,
            dy: -8,
            fontSize: 9,
            textAnchor: 'middle',
          }),
          Plot.dot(pairs, {
            x: 'gapPp',
            y: () => 0,
            r: 'volume',
            fill: (d: ChartPair) => (d.beatsFees ? '#EF4444' : '#22D3EE'),
            fillOpacity: 0.85,
            stroke: '#020617',
            strokeWidth: 1,
            channels: {
              Market: 'question',
              Gap: (d: ChartPair) => `${d.gapPp.toFixed(1)}pp`,
              Similarity: (d: ChartPair) => `${(d.similarity * 100).toFixed(0)}%`,
            },
            tip: { format: { x: false, y: false, r: false, fill: false } },
          }),
        ],
        r: { range: [4, 15] },
      }),
    [pairs]
  );
  return <PlotFigure render={render} />;
}

/**
 * Experiment 1, chart 2 — semantic similarity (how confident the match is) vs the
 * absolute gap, sized by volume. Shows the seven survivors clustered just above
 * the 0.85 match floor, with gaps that mostly stay under the fee line.
 */
function SimilarityVsGap({ pairs }: { pairs: ChartPair[] }) {
  const render = useCallback(
    (width: number) =>
      Plot.plot({
        width,
        height: 240,
        marginTop: 16,
        marginBottom: 42,
        marginLeft: 44,
        marginRight: 16,
        style: PLOT_STYLE,
        grid: true,
        x: {
          label: 'Semantic similarity (cosine) →',
          domain: [0.85, 0.88],
          ticks: [0.85, 0.86, 0.87, 0.88],
          tickFormat: (d: number) => d.toFixed(2),
        },
        y: {
          label: '↑ Gap (pp)',
          domain: [0, 22],
          ticks: [0, 3, 9, 19],
          tickFormat: (d: number) => `${d}`,
        },
        marks: [
          Plot.ruleY([9], { stroke: '#F59E0B', strokeDasharray: '3,3', strokeOpacity: 0.7 }),
          Plot.ruleY([19], { stroke: '#EF4444', strokeDasharray: '3,3', strokeOpacity: 0.7 }),
          Plot.dot(pairs, {
            x: 'similarity',
            y: 'gapPp',
            r: 'volume',
            fill: (d: ChartPair) => (d.beatsFees ? '#EF4444' : '#22D3EE'),
            fillOpacity: 0.85,
            stroke: '#020617',
            strokeWidth: 1,
            channels: {
              Market: 'question',
              Gap: (d: ChartPair) => `${d.gapPp.toFixed(1)}pp`,
            },
            tip: { format: { x: false, y: false, r: false, fill: false } },
          }),
        ],
        r: { range: [4, 15] },
      }),
    [pairs]
  );
  return <PlotFigure render={render} />;
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

  const s = state.study;
  const chartPairs: ChartPair[] = useMemo(
    () =>
      (s?.pairs ?? []).map((p: EfficiencyPair) => ({
        question: p.question,
        gapPp: p.gap * 100,
        similarity: p.similarity,
        volume: Math.max(p.volume, 1),
        beatsFees: p.gap > s!.fees.roundTrip,
      })),
    [s]
  );

  if (state.loading) {
    return <div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">Loading lab…</div>;
  }
  if (state.error || !s) {
    return <div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">{state.error}</div>;
  }

  const overlapPct = ((s.matching.matchedPairs / s.universe.total) * 100).toFixed(1);
  const date = new Date(s.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-[920px] mx-auto">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-[16px] font-semibold text-[#F8FAFC]">Market Efficiency Lab</h1>
          <span className="text-[10px] text-[#64748B] font-mono">latest recorded scan · {date} · npm run study</span>
        </div>
        <p className="text-[12px] text-[#94A3B8] mb-4 max-w-[640px]">
          Does a retail trader have a cross-platform edge between Polymarket and Kalshi? This is the
          measurement, not a verdict — a single reproducible scan of every live market on both platforms,
          regenerated from live data with one command.
        </p>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Stat value={s.universe.total.toLocaleString()} label="Live markets scanned" sub={`Poly ${s.universe.polymarket.toLocaleString()} · Kalshi ${s.universe.kalshi.toLocaleString()}`} />
          <Stat value={String(s.matching.matchedPairs)} label="Same event, both platforms" sub={`${overlapPct}% overlap · cosine ≥ ${s.matching.similarityThreshold}`} />
          <Stat value={`${(s.gapDistribution.medianGap * 100).toFixed(1)}pp`} label="Median price gap" sub={`fees cost ${(s.fees.roundTrip * 100).toFixed(0)}pp round-trip`} />
          <Stat value={String(s.actionable.meetsDetectorThreshold_19pp)} label="Met arbitrage threshold" sub="gaps ≥ 19pp net of fees" />
        </div>

        <div className="grid md:grid-cols-[1fr_320px] gap-5 items-start">
          {/* Experiment 1: the two charts */}
          <div className="border border-[#1E293B] rounded-md p-3 bg-[#020617] space-y-4">
            <div>
              <div className="text-[12px] font-semibold text-[#F8FAFC]">Experiment 1 — Cross-platform efficiency</div>
              <div className="text-[10px] text-[#64748B]">
                {s.matching.matchedPairs} matched pairs out of {s.universe.total.toLocaleString()} live markets.
                Each dot is one event listed on both platforms; size = volume.
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-1">Gap vs decision thresholds</div>
              <GapDistribution pairs={chartPairs} />
            </div>

            <div>
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-1">Match confidence vs gap</div>
              <SimilarityVsGap pairs={chartPairs} />
            </div>

            <div className="flex items-center gap-4 text-[10px] text-[#64748B] pt-1 border-t border-[#1E293B]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22D3EE]" /> below fee line</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#EF4444]" /> gap beats fees</span>
              <span className="flex-1" />
              <span>○ size = volume</span>
            </div>
          </div>

          {/* Findings + other experiments */}
          <div className="space-y-3">
            <div className="border border-[#1E293B] rounded-md p-3 bg-[#0E1223]">
              <div className="text-[12px] font-semibold text-[#F8FAFC] mb-1.5">What this scan says</div>
              <ul className="text-[11px] text-[#94A3B8] leading-relaxed space-y-1.5 list-disc pl-4">
                <li>The platforms barely list the same events: <span className="text-[#F8FAFC]">{s.matching.matchedPairs} of {s.universe.total.toLocaleString()}</span> ({overlapPct}%).</li>
                <li>Where they overlap, the median gap ({(s.gapDistribution.medianGap * 100).toFixed(1)}pp) is below the {(s.fees.roundTrip * 100).toFixed(0)}pp round-trip fee floor.</li>
                <li><span className="text-[#F8FAFC]">{s.actionable.meetsDetectorThreshold_19pp}</span> gaps clear the arbitrage threshold. The largest ({(s.gapDistribution.maxGap * 100).toFixed(1)}pp) is most likely a settlement-definition mismatch, not free money.</li>
              </ul>
              <p className="text-[10px] text-[#64748B] mt-2 leading-relaxed">
                One scan, not a verdict on market efficiency — re-run <span className="font-mono">npm run study</span> to reproduce.
              </p>
            </div>
            <ExperimentCard status="running" title="Experiment 2 — Metaculus vs. market" body="When superforecasters disagree with the market by 10+ points, who's right? A backtest that needs resolved outcomes over time — the harness is collecting them now." />
            <ExperimentCard status="running" title="Experiment 3 — Personal calibration" body="Log your probability calls, score them with Brier, and see where you're overconfident. The method works; the sample is still thin." />
          </div>
        </div>
      </div>
    </div>
  );
}
