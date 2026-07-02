import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { fetchPairLive, fetchPairHistory, type PairRow, type PairLive, type PairHistory, type HistoryPoint, type PairsVerification } from '../api/client.js';
import { useResearch } from '../hooks/useResearch.js';
import { verdictDisplay, CHECKS, actionability, causeOfDeath, usd, pp, POLY, KALSHI, FEE } from '../lib/pairStatus.js';
import { DiffText } from './lab/DeepSurvivors.js';

/**
 * The cross-platform DOSSIER — the product. For one verified pair it answers, at a glance:
 * what is this on each venue, what's the gap vs the fee floor + detector threshold, how deep is the
 * thinner side, is the contract actually the same (7-point checklist), and is the apparent edge
 * real. The verifier's verdict is CACHED (from the Efficiency Lab run); prices are REFRESHED LIVE on
 * open (per side), so a study-backed row shows current prices — and says so honestly when a venue
 * has gone inactive.
 */

type Fresh = 'live' | 'inactive' | 'snapshot';

function FreshTag({ state }: { state: Fresh }) {
  if (state === 'live') return <span className="text-[8px] text-[#34D399]" title="refreshed live just now">● live</span>;
  if (state === 'inactive') return <span className="text-[8px] text-[#F59E0B]" title="market no longer trading — showing the study snapshot">◌ closed</span>;
  return <span className="text-[8px] text-[#64748B]" title="study snapshot price">❄ snapshot</span>;
}

function PriceRuler({ poly, kalshi, beatsFees }: { poly: number; kalshi: number; beatsFees: boolean }) {
  const lo = Math.min(poly, kalshi);
  const hi = Math.max(poly, kalshi);
  return (
    <div className="relative h-7">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#1E293B]" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full transition-all"
        style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, background: beatsFees ? FEE : '#475569', opacity: 0.75 }}
      />
      <Dot pct={poly} color={POLY} />
      <Dot pct={kalshi} color={KALSHI} />
    </div>
  );
}
function Dot({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      className="absolute top-1/2 w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-[#0B0F1D] transition-all"
      style={{ left: `${pct * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

/** Gap vs the two decision thresholds — fill = gap, ticks at the fee floor (9pp) and detector (19pp). */
function GapMeter({ gap, feeFloor }: { gap: number; feeFloor: number }) {
  const scale = Math.max(0.2, gap * 1.15);
  const at = (v: number) => `${(v / scale) * 100}%`;
  return (
    <div>
      <div className="relative h-2 rounded-full bg-[#0E1223] border border-[#1E293B] overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: at(gap), background: gap > feeFloor ? FEE : '#475569' }} />
        <div className="absolute inset-y-0 w-px bg-[#F59E0B]/80" style={{ left: at(feeFloor) }} />
        <div className="absolute inset-y-0 w-px bg-[#EF4444]/70" style={{ left: at(0.19) }} />
      </div>
      <div className="relative h-3 mt-0.5 text-[8px] text-[#64748B] font-mono">
        <span className="absolute -translate-x-1/2" style={{ left: at(feeFloor) }}>9pp fee</span>
        <span className="absolute -translate-x-1/2" style={{ left: at(0.19) }}>19pp</span>
      </div>
    </div>
  );
}

/** Dual-line 30-day history — Polymarket (blue) vs Kalshi (green), auto-scaled to the data band.
 *  Each series is drawn only when present; an absent venue is labelled honestly, never faked. */
function HistoryChart({ poly, kalshi }: { poly: HistoryPoint[]; kalshi: HistoryPoint[] }) {
  const all = [...poly, ...kalshi];
  if (all.length === 0) {
    return <div className="text-[10px] text-[#64748B] bg-[#0E1223] border border-[#1E293B] rounded p-3">No price history available for either venue.</div>;
  }
  const W = 100;
  const H = 40;
  const ts = all.map((p) => p.timestamp);
  const minT = Math.min(...ts);
  const spanT = Math.max(1, Math.max(...ts) - minT);
  const vals = all.map((p) => p.yes);
  let yMin = Math.min(...vals);
  let yMax = Math.max(...vals);
  const pad = Math.max(0.02, (yMax - yMin) * 0.15);
  yMin = Math.max(0, yMin - pad);
  yMax = Math.min(1, yMax + pad);
  const ySpan = Math.max(0.001, yMax - yMin);
  const x = (t: number) => ((t - minT) / spanT) * W;
  const y = (v: number) => H - ((v - yMin) / ySpan) * H;
  const path = (pts: HistoryPoint[]) =>
    pts.length ? 'M' + pts.map((p) => `${x(p.timestamp).toFixed(2)} ${y(p.yes).toFixed(2)}`).join(' L') : '';
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24 bg-[#0E1223] border border-[#1E293B] rounded">
          {poly.length > 0 && <path d={path(poly)} fill="none" stroke={POLY} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          {kalshi.length > 0 && <path d={path(kalshi)} fill="none" stroke={KALSHI} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="absolute top-1 right-1.5 text-[8px] font-mono text-[#64748B]">{Math.round(yMax * 100)}%</span>
        <span className="absolute bottom-1 right-1.5 text-[8px] font-mono text-[#64748B]">{Math.round(yMin * 100)}%</span>
      </div>
      <div className="flex items-center gap-3 text-[9px] text-[#64748B] mt-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-0.5" style={{ background: POLY }} />Poly{poly.length ? '' : ' (unavailable)'}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-0.5" style={{ background: KALSHI }} />Kalshi{kalshi.length ? '' : ' (unavailable)'}</span>
      </div>
    </div>
  );
}

function Side({ label, color, yes, volume, fresh }: { label: string; color: string; yes: number; volume: number; fresh: Fresh }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono font-semibold" style={{ color }}>{label}</span>
        <FreshTag state={fresh} />
      </div>
      <div className="text-[30px] font-mono font-bold text-[#F8FAFC] tabular-nums leading-tight">{Math.round(yes * 100)}%</div>
      <div className="text-[10px] text-[#64748B]">{usd(volume)} vol</div>
    </div>
  );
}

function Checklist({ checklist }: { checklist: Record<string, boolean | string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHECKS.map((ch) => {
        const ok = checklist[ch.key] === true;
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
  );
}

function Brief({ polyId }: { polyId: string }) {
  const { content, isStreaming, error, start, stop } = useResearch('polymarket', polyId);
  useEffect(() => stop, [stop, polyId]);
  return (
    <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
      {error && <div className="text-[11px] text-[#EF4444] mb-2">{error}</div>}
      {content ? (
        <div className="prose prose-invert max-w-none text-[12px] leading-relaxed [&_h1]:text-[13px] [&_h2]:text-[12px] [&_h3]:text-[12px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_li]:mb-0.5 [&_strong]:text-[#F8FAFC]">
          <Markdown>{content}</Markdown>
          {isStreaming && <span className="text-[#06B6D4] animate-pulse">|</span>}
        </div>
      ) : isStreaming ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#64748B] animate-pulse">Generating research brief…</span>
          <button onClick={stop} className="text-[10px] text-[#64748B] hover:text-[#EF4444]">Stop</button>
        </div>
      ) : (
        <button onClick={start} className="w-full py-2 text-[11px] font-medium text-[#06B6D4] border border-[#06B6D4]/30 rounded hover:bg-[#06B6D4]/10 transition-colors">
          Generate brief
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

/** Resolve a side's freshness + effective YES from the live readout, falling back to the snapshot. */
function resolveSide(snapshotYes: number, live: PairLive['polymarket'], orient?: (raw: number) => number): { yes: number; fresh: Fresh } {
  if (live?.found && live.active && live.yes != null) {
    return { yes: orient ? orient(live.yes) : live.yes, fresh: 'live' };
  }
  if (live?.found && !live.active) return { yes: snapshotYes, fresh: 'inactive' };
  return { yes: snapshotYes, fresh: 'snapshot' };
}

export function PairDossier({ pair, onOpenLab, verification }: { pair: PairRow | null; onOpenLab?: () => void; verification?: PairsVerification | null }) {
  const [live, setLive] = useState<PairLive | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<PairHistory | null>(null);
  const polyId = pair?.polymarket.id;
  const kalshiId = pair?.kalshi.id;

  useEffect(() => {
    if (!polyId || !kalshiId) { setLive(null); setHistory(null); return; }
    let alive = true;
    setLive(null);
    setHistory(null);
    setRefreshing(true);
    fetchPairLive(polyId, kalshiId)
      .then((r) => { if (alive) setLive(r); })
      .catch(() => { if (alive) setLive(null); })
      .finally(() => { if (alive) setRefreshing(false); });
    fetchPairHistory(polyId, kalshiId, 30)
      .then((r) => { if (alive) setHistory(r); })
      .catch(() => { if (alive) setHistory(null); });
    return () => { alive = false; };
  }, [polyId, kalshiId]);

  if (!pair) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
        <div className="text-[13px] text-[#94A3B8]">Select a cross-platform pair</div>
        <p className="text-[11px] text-[#64748B] max-w-[380px] leading-relaxed">
          Each row is one event listed on both Polymarket and Kalshi. Open it to refresh both prices live,
          see the gap against fees, how deep the thinner side is, and whether the verifier judged it the
          same contract — the same verifier that powers the Efficiency Lab.
        </p>
      </div>
    );
  }

  const v = verdictDisplay(pair);
  const verifiedDate = pair.verifiedAt
    ? new Date(pair.verifiedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

  // Effective prices: live where the venue is still trading, else the study snapshot.
  const p = resolveSide(pair.polymarket.yes, live?.polymarket ?? null);
  const k = resolveSide(pair.kalshi.yes, live?.kalshi ?? null, (raw) => (pair.yesAligned ? raw : 1 - raw));
  const polyVol = live?.polymarket?.found && live.polymarket.active && live.polymarket.volume != null ? live.polymarket.volume : pair.polymarket.volume;
  const kalshiVol = live?.kalshi?.found && live.kalshi.active && live.kalshi.volume != null ? live.kalshi.volume : pair.kalshi.volume;
  const gap = Math.abs(p.yes - k.yes);
  const beatsFees = gap > pair.feeFloor;
  const liquidity = Math.min(polyVol, kalshiVol);
  // The effective row for the actionability verdict (live gap + liquidity, cached contract verdict).
  const eff: PairRow = {
    ...pair,
    gap,
    beatsFees,
    liquidity,
    polymarket: { ...pair.polymarket, yes: p.yes, volume: polyVol },
    kalshi: { ...pair.kalshi, yes: k.yes, volume: kalshiVol },
  };

  const priceState = refreshing
    ? 'refreshing prices…'
    : p.fresh === 'live' || k.fresh === 'live'
      ? `prices live${live?.fetchedAt ? ` · ${new Date(live.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`
      : 'study-snapshot prices (markets not live)';

  // Orient the Kalshi history the same way as the prices, so both lines share a YES basis.
  const polyHist = history?.polymarket ?? [];
  const kalshiHist = (history?.kalshi ?? []).map((h) => ({ timestamp: h.timestamp, yes: pair.yesAligned ? h.yes : 1 - h.yes }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-[#F8FAFC] leading-snug">{pair.event}</h2>
            <span className={`shrink-0 text-[9px] font-semibold rounded px-1.5 py-0.5 border ${v.chip}`} title={v.suspicious ?? v.label}>
              {v.label}{v.strict ? ' · 7/7' : ''}
            </span>
          </div>
          <div className="text-[10px] text-[#64748B] mt-1 flex items-center gap-1.5 flex-wrap">
            <span className={refreshing ? 'text-[#06B6D4] animate-pulse' : ''}>{priceState}</span>
            <span className="text-[#334155]">·</span>
            <span>verdict cached {verifiedDate}</span>
            <span className="text-[#334155]">·</span>
            <button onClick={onOpenLab} className="text-[#06B6D4] hover:underline disabled:no-underline disabled:text-[#64748B]" disabled={!onOpenLab}>
              same verifier as the Efficiency Lab
            </button>
          </div>
        </div>

        {/* Hero — the two venues + the gap */}
        <div className="bg-[#0E1223] border border-[#1E293B] rounded-md p-3.5">
          <div className="flex items-start gap-4">
            <Side label="POLYMARKET" color={POLY} yes={p.yes} volume={polyVol} fresh={p.fresh} />
            <div className="text-center pt-3 shrink-0">
              <div className="text-[10px] text-[#64748B]">gap</div>
              <div className="text-[18px] font-mono font-bold tabular-nums" style={{ color: beatsFees ? FEE : '#94A3B8' }}>{pp(gap)}</div>
            </div>
            <Side label="KALSHI" color={KALSHI} yes={k.yes} volume={kalshiVol} fresh={k.fresh} />
          </div>
          <div className="mt-3"><PriceRuler poly={p.yes} kalshi={k.yes} beatsFees={beatsFees} /></div>
          <div className="mt-1.5"><GapMeter gap={gap} feeFloor={pair.feeFloor} /></div>
        </div>

        {/* Cause of death — the one-line answer to "why isn't this free money" */}
        <div className="rounded-md border border-[#1E293B] bg-[#0E1223] px-3 py-2.5">
          <div className="text-[9px] text-[#64748B] uppercase tracking-wider mb-1">Why this isn't free money</div>
          <div className="text-[11.5px] leading-snug text-[#E2E8F0]">{causeOfDeath(eff)}</div>
        </div>

        {/* 30-day price history, both venues */}
        <Section title="Price history · 30 days">
          {history ? <HistoryChart poly={polyHist} kalshi={kalshiHist} /> : <div className="h-24 bg-[#0E1223] border border-[#1E293B] rounded animate-pulse" />}
        </Section>

        {/* The two questions, verbatim */}
        <Section title="The two contracts">
          <div className="space-y-2">
            <div className="text-[11px] leading-snug">
              <span className="font-mono text-[9px]" style={{ color: POLY }}>POLY</span>{' '}
              <span className="text-[#CBD5E1]"><DiffText text={pair.polymarket.title} other={pair.kalshi.title} /></span>
            </div>
            <div className="text-[11px] leading-snug">
              <span className="font-mono text-[9px]" style={{ color: KALSHI }}>KAL</span>{' '}
              <span className="text-[#CBD5E1]"><DiffText text={pair.kalshi.title} other={pair.polymarket.title} /></span>
            </div>
          </div>
        </Section>

        {/* Verdict */}
        <Section title="Verifier verdict">
          <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3 space-y-2">
            {v.suspicious && (
              <div className="text-[11px] text-[#FBBF24] bg-[#78350F]/30 border border-[#B45309]/40 rounded px-2 py-1.5 leading-snug">
                ⚠ The cached verifier may be over-matching: <span className="font-medium">{v.suspicious}</span>. The two contracts likely differ.
              </div>
            )}
            {pair.corrected && (
              <div className="text-[10px] text-[#7DD3FC] bg-[#0C4A6E]/30 border border-[#075985]/40 rounded px-2 py-1.5 leading-snug">
                ↺ Reclassified to spec-mismatch by {pair.correctionSource === 'strict_reverify' ? 'the 7-point strict re-check' : 'a deterministic spec rule'}
                {pair.correctionReason ? `: ${pair.correctionReason}` : ''}. The original cached verdict over-matched.
              </div>
            )}
            {pair.reason && (
              <div className={`text-[11px] leading-snug ${pair.corrected ? 'text-[#64748B] line-through decoration-[#475569]/60' : 'text-[#CBD5E1]'}`}>
                {pair.reason}
              </div>
            )}
            <div className="text-[10px] text-[#64748B]">
              {v.strict ? 'Strict-spec verified · passed all 7 contract checks.' : 'Cached verifier label · not strict-spec verified.'}
            </div>
            {pair.checklist && <Checklist checklist={pair.checklist} />}
            <div className="flex items-center gap-3 text-[10px] text-[#64748B] pt-0.5">
              <span>Thinner side <span className="text-[#94A3B8] font-mono">{usd(liquidity)}</span></span>
              {pair.liquidityTier && <span>tier {pair.liquidityTier}</span>}
              <span>match {Math.round(pair.cosine * 100)}%</span>
            </div>
          </div>
        </Section>

        {/* Actionability */}
        <Section title="Is this actionable?">
          <div className={`text-[11px] leading-snug rounded px-3 py-2 border ${v.chip}`}>{actionability(eff)}</div>
        </Section>

        {/* AI brief — support, not centerpiece */}
        <Section title="Research brief">
          <Brief key={pair.polymarket.id} polyId={pair.polymarket.id} />
        </Section>

        {/* Provenance — one glance = the whole reliability story */}
        {verification && (
          <div className="text-[9px] text-[#475569] text-center pt-1 border-t border-[#1E293B]/60">
            verdict: cached batch · {verification.model} · prompt {verification.promptVersion} · 1 of{' '}
            {verification.verdictCount.toLocaleString()} AI verdicts
          </div>
        )}
      </div>
    </div>
  );
}
