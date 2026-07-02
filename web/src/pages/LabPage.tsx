import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
import {
  fetchEfficiencyStudy,
  fetchStrictSurvivors,
  fetchCorrections,
  type EfficiencyStudy,
  type EfficiencyPair,
  type StrictSurvivors,
  type Corrections,
} from '../api/client.js';
import { CompressionWaterfall } from '../components/lab/CompressionWaterfall.js';
import { ComparisonMatrix } from '../components/lab/ComparisonMatrix.js';
import { ConsensusField3D } from '../components/lab/consensus3d/ConsensusField3D.js';
import { EvidenceWall } from '../components/lab/EvidenceWall.js';
import { DeepSurvivors } from '../components/lab/DeepSurvivors.js';
import { correctedFunnelCounts } from '../lib/funnel.js';

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

// The priceable same-contract pairs (the legitimate comparison set) by funnel stage — same
// resolution criteria, live price both sides. Excludes topical-only and degenerate-price pairs.
const PRICEABLE_STAGES = new Set(['validated_same_contract', 'semantic_survivor', 'apparent_fee_clearing_gap']);

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
 * Experiment 1, chart 1 — each priceable same-contract pair's gap on one axis,
 * with the three decision lines overlaid. The point reads in a glance: the mass
 * of gaps sits left of the fee line.
 */
function GapDistribution({ pairs }: { pairs: ChartPair[] }) {
  const maxGap = Math.max(22, Math.ceil(Math.max(0, ...pairs.map((p) => p.gapPp)) + 1));
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
          domain: [0, maxGap],
          label: 'Absolute YES-price gap (pp) →',
          ticks: [0, 3, 9, 19].filter((t) => t <= maxGap),
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
    [pairs, maxGap]
  );
  return <PlotFigure render={render} />;
}

/**
 * Experiment 1, chart 2 — semantic similarity (how confident the match is) vs the
 * absolute gap, sized by volume. The same-contract pairs cluster at high
 * similarity with gaps that mostly stay under the fee line.
 */
function SimilarityVsGap({ pairs }: { pairs: ChartPair[] }) {
  const maxGap = Math.max(22, Math.ceil(Math.max(0, ...pairs.map((p) => p.gapPp)) + 1));
  const minSim = Math.floor(Math.min(1, ...pairs.map((p) => p.similarity)) * 20) / 20;
  const simDomain: [number, number] = [Number.isFinite(minSim) ? minSim : 0.55, 1];
  const simTicks = [0.55, 0.6, 0.7, 0.8, 0.9, 1.0].filter((t) => t >= simDomain[0]);
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
          domain: simDomain,
          ticks: simTicks,
          tickFormat: (d: number) => d.toFixed(2),
        },
        y: {
          label: '↑ Gap (pp)',
          domain: [0, maxGap],
          ticks: [0, 3, 9, 19].filter((t) => t <= maxGap),
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
    [pairs, maxGap, simDomain, simTicks]
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
  const [state, setState] = useState<{
    loading: boolean;
    study?: EfficiencyStudy;
    strict?: StrictSurvivors;
    corrections?: Corrections;
    error?: string;
  }>({ loading: true });

  useEffect(() => {
    Promise.all([
      fetchEfficiencyStudy(),
      fetchStrictSurvivors().catch(() => ({ available: false as const })),
      fetchCorrections().catch(() => ({ available: false as const })),
    ])
      .then(([study, strict, corrections]) => {
        if (!study.available || !study.study) {
          setState({ loading: false, error: 'No study artifact yet. Run `npm run study`.' });
          return;
        }
        setState({
          loading: false,
          study: study.study,
          strict: 'data' in strict ? strict.data : undefined,
          corrections: 'data' in corrections ? corrections.data : undefined,
        });
      })
      .catch((e) => setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' }));
  }, []);

  const s = state.study;
  // The legitimate comparison set: priceable same-contract pairs (live price both sides),
  // identified by funnel stage so it's robust to which per-pair flags are populated.
  const chartPairs: ChartPair[] = useMemo(
    () =>
      (s?.pairs ?? [])
        .filter((p: EfficiencyPair) => p.funnel_stage != null && PRICEABLE_STAGES.has(p.funnel_stage))
        .map((p: EfficiencyPair) => ({
          question: p.question,
          gapPp: p.gap * 100,
          similarity: p.similarity,
          volume: Math.max(p.volume, 1),
          beatsFees: p.gap > (s?.fees.roundTrip ?? 0.09),
        })),
    [s]
  );

  // The 221 apparent gaps (semantic survivors) as real question pairs, for the evidence wall's
  // "all apparent" view.
  const apparentPairs: EfficiencyPair[] = useMemo(
    () => (s?.pairs ?? []).filter((p) => p.triage_label === 'semantic_survivor'),
    [s]
  );

  if (state.loading) {
    return <div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">Loading lab…</div>;
  }
  if (state.error || !s) {
    return <div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">{state.error}</div>;
  }

  const f = s.funnel;
  const m = s.matching;
  const feePp = (s.fees.roundTrip * 100).toFixed(0);
  const medianPp = (s.gapDistribution.medianGap * 100).toFixed(1);
  const slices = (s.categorySlices ?? []).slice(0, 6);
  const polyDenom = `${s.universe.polymarketIsLowerBound ? '≥' : ''}${s.universe.polymarket.toLocaleString()}`;
  const date = new Date(s.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  // Apparent gaps minus the scope/entity false positives (county-vs-statewide, etc.). Every bottom-
  // of-funnel count is derived from the real pair arrays so the whole page stays consistent. The
  // 7-point strict-check failures are NOT treated as removals here — they are the funnel's own
  // liquid→strict cull, shown as such.
  const correctionKeys = new Set((state.corrections?.corrections ?? []).map((c) => `${c.polymarketId}::${c.kalshiId}`));
  const semanticFalsePositives = (state.corrections?.corrections ?? []).filter(
    (c) => c.correction_source !== 'strict_reverify' && c.original_verdict === 'semantic_survivor'
  ).length;
  const correctedFunnel = correctedFunnelCounts(s, state.strict?.pairs ?? [], correctionKeys, semanticFalsePositives);
  const correctedSemantic = correctedFunnel.semanticSurvivors;
  const apparentCorrected = apparentPairs.filter((p) => !correctionKeys.has(`${p.polymarketId}::${p.kalshiId}`));
  // Drop only the pairs the strict check wrongly passed (county); keep the genuine 7-point mismatches
  // in the wall so the "44 → spec check → cull" story still renders.
  const correctedSurvivors = (state.strict?.pairs ?? []).filter(
    (p) => !(correctionKeys.has(`${p.polymarketId}::${p.kalshiId}`) && p.strict_survivor)
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1800px] mx-auto px-5 pt-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-[16px] font-semibold text-[#F8FAFC]">Market Efficiency Lab</h1>
          <span className="text-[10px] text-[#64748B] font-mono">single reproducible scan · {date}</span>
        </div>
        <p className="text-[12px] text-[#94A3B8] mb-5 max-w-[720px]">
          Does a retail trader have a cross-platform edge between Polymarket and Kalshi? This is the
          measurement, not a verdict. It enumerates every active <span className="text-[#CBD5E1]">standalone</span> market on
          both platforms (parlay / multi-leg contracts excluded — not directly comparable), compares the
          <span className="text-[#CBD5E1]"> tradeable</span> subset, and audits every fee-clearing gap down to the
          deepest residuals to separate real mispricings from settlement traps.
        </p>

        {/* The scale of the scan — the computational weight behind one reproducible pass. */}
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-md border border-[#1E293B] bg-[#0B1120] px-4 py-2.5">
          <span className="text-[9px] uppercase tracking-wider text-[#64748B] shrink-0">scale of one scan</span>
          {([
            [((s.universe.polymarket * s.universe.kalshi) / 1e9).toFixed(2) + 'B', 'possible cross-listings'],
            [s.universe.total.toLocaleString(), 'standalone markets'],
            [(f?.sameEvent ?? m.topicalOverlaps).toLocaleString(), 'same-event pairs'],
            [(s.verification?.provenance?.reduce((a, p) => a + (p.n ?? 0), 0) || s.verification?.cachedVerdicts || 0).toLocaleString(), 'AI verification calls'],
          ] as [string, string][]).map(([v, l]) => (
            <div key={l} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] font-semibold text-[#E2E8F0] tabular-nums">{v}</span>
              <span className="text-[10px] text-[#64748B]">{l}</span>
            </div>
          ))}
          <span className="text-[10px] text-[#475569] ml-auto shrink-0">one command · reproducible</span>
        </div>

      </div>

      {/* Signature visual — full-bleed 3D consensus field: real markets, threads, gap flares. */}
      <div className="mb-5">
        <ConsensusField3D study={s} apparentCount={correctedSemantic} />
      </div>

      <div className="max-w-[1800px] mx-auto px-5 pb-5">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Stat value={s.universe.total.toLocaleString()} label="Standalone markets enumerated" sub={`Poly ${polyDenom} · Kalshi ${s.universe.kalshi.toLocaleString()}`} />
          <Stat value={(f?.sameContract ?? m.sameContract).toLocaleString()} label="Candidate same-contract (cached)" sub={`of ${(f?.sameEvent ?? m.topicalOverlaps).toLocaleString()} same-event · few strict-verified`} />
          <Stat value={correctedSemantic.toLocaleString()} label="Apparent gaps" sub={`clear ${feePp}pp fees + entity/scope`} />
          <Stat value={String(f?.clearExecutableArb ?? 0)} label="Clear executable arbitrage" sub="after liquidity + spec + manual" />
        </div>

        {/* Proof spine — the funnel as a waterfall + the exact ledger. */}
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-5 mb-5 items-start">
          <CompressionWaterfall study={s} corrected={correctedFunnel} />
          <ComparisonMatrix study={s} corrected={correctedFunnel} />
        </div>

        {/* The survivors — apparent gaps under audit. */}
        {state.strict && (
          <div className="mb-5">
            <EvidenceWall
              survivors={correctedSurvivors}
              apparent={apparentCorrected}
              specMismatchReasons={state.strict.specMismatchReasons}
              semanticCount={correctedSemantic}
            />
          </div>
        )}

        {/* The deep four — the strict survivors that clear every automated gate. */}
        {state.strict && (
          <div className="mb-5">
            <DeepSurvivors survivors={correctedSurvivors} />
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_320px] gap-5 items-start">
          {/* Experiment 1: the two charts */}
          <div className="border border-[#1E293B] rounded-md p-3 bg-[#020617] space-y-4">
            <div>
              <div className="text-[12px] font-semibold text-[#F8FAFC]">Experiment 1 — Cross-platform efficiency</div>
              <div className="text-[10px] text-[#64748B]">
                {(f?.priceable ?? m.sameContractPriceable).toLocaleString()} same-contract pairs with a live price on
                both sides. Each dot is one shared contract; size = volume. Gaps use the correctly-oriented YES side.
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
                <li>Despite {s.universe.total.toLocaleString()} standalone markets, only <span className="text-[#F8FAFC]">{(f?.sameContract ?? m.sameContract).toLocaleString()}</span> are flagged same-contract by the cached verifier (mostly not strict-spec verified — the label over-matches on look-alike questions).</li>
                <li>Where the contracts genuinely match, prices agree — median gap <span className="text-[#F8FAFC]">{medianPp}pp</span>, below the {feePp}pp round-trip fee floor.</li>
                <li>A deterministic + strict re-check culls look-alike mismatches — a county race vs the statewide race, a first-half total vs the full match — leaving <span className="text-[#F8FAFC]">{correctedSemantic.toLocaleString()}</span> genuine same-event apparent gaps.</li>
                <li>Even so, liquidity, contract-spec matching, and manual review leave <span className="text-[#F8FAFC]">{f?.clearExecutableArb ?? 0}</span> clear executable {(f?.clearExecutableArb ?? 0) === 1 ? 'arbitrage' : 'arbitrages'} — <span className="text-[#F8FAFC]">{correctedFunnel.strictSpecSurvivors}</span> strict and <span className="text-[#F8FAFC]">{correctedFunnel.deepStrictSurvivors}</span> deep survivors; the rest are thin, spec mismatches, or settlement traps.</li>
              </ul>
              <p className="text-[10px] text-[#64748B] mt-2 leading-relaxed">
                One scan, not a verdict on market efficiency — re-run <span className="font-mono">npm run study</span> to reproduce.
              </p>
            </div>

            {slices.length > 0 && (
              <div className="border border-[#1E293B] rounded-md p-3 bg-[#0E1223]">
                <div className="text-[12px] font-semibold text-[#F8FAFC] mb-1.5">Overlaps by category</div>
                <div className="text-[10px] text-[#64748B] mb-2">Analysis slice — &ldquo;is value hiding in sports?&rdquo; — not a filter on the universe.</div>
                <table className="w-full text-[10px] text-[#94A3B8]">
                  <thead className="text-[#64748B]">
                    <tr><th className="text-left font-normal pb-1">Category</th><th className="text-right font-normal pb-1">Pairs</th><th className="text-right font-normal pb-1">Median</th><th className="text-right font-normal pb-1">&gt;fees</th></tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {slices.map((c) => (
                      <tr key={c.category}>
                        <td className="text-left text-[#CBD5E1] py-0.5">{c.category}</td>
                        <td className="text-right">{c.pairs}</td>
                        <td className="text-right">{c.medianGapPp.toFixed(1)}pp</td>
                        <td className="text-right">{c.beatsFees}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <ExperimentCard status="running" title="Experiment 2 — Metaculus vs. market" body="When superforecasters disagree with the market by 10+ points, who's right? A backtest that needs resolved outcomes over time — the harness is collecting them now." />
            <ExperimentCard status="running" title="Experiment 3 — Personal calibration" body="Log your probability calls, score them with Brier, and see where you're overconfident. The method works; the sample is still thin." />
          </div>
        </div>
      </div>
    </div>
  );
}
