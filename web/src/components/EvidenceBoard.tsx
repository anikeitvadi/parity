import React from 'react';
import type { MarketDetailResponse } from '../api/client.js';
import { getYesPrice, formatVolume, formatClosing } from '../lib/utils.js';
import { useVerifierIndex } from '../lib/useVerifierIndex.js';
import { VerifierPanel } from './VerifierPanel.js';

interface Props {
  detail: MarketDetailResponse | null;
  loading: boolean;
}

export function EvidenceBoard({ detail, loading }: Props) {
  const { index: verifierIndex, study } = useVerifierIndex();

  if (!detail && !loading) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-[#64748B]">
        <div className="text-center">
          <div className="text-[#334155] text-2xl mb-2">←</div>
          Select a market from the queue
        </div>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-3/4 bg-[#0E1223] rounded animate-pulse" />
        <div className="h-40 bg-[#0E1223] rounded animate-pulse" />
        <div className="h-20 bg-[#0E1223] rounded animate-pulse" />
      </div>
    );
  }

  const { market, crossPlatform, settlement, priceHistory, metaculus } = detail;
  const yesPrice = getYesPrice(market.prices);
  const closing = market.closeDate ? formatClosing(market.closeDate) : null;
  const rec = verifierIndex.get(market.id);
  const feeFloorPp = Math.round((study?.fees.roundTrip ?? 0.09) * 100);

  // Compute movement from price history
  const movement = computeMovement(priceHistory);

  return (
    <div className="p-3 space-y-3">
      {/* Market Header */}
      <div>
        <div className="flex items-start gap-2">
          <h2 className="text-[14px] font-semibold text-[#F8FAFC] leading-snug flex-1">
            {market.question}
          </h2>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
            market.platform === 'polymarket' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'
          }`}>
            {market.platform === 'polymarket' ? 'POLY' : 'KALSHI'}
          </span>
        </div>
        <div className="flex gap-3 mt-1 text-[11px] text-[#64748B]">
          {market.volume != null && market.volume > 0 && <span>{formatVolume(market.volume)} vol</span>}
          {market.liquidity != null && market.liquidity > 0 && <span>{formatVolume(market.liquidity)} liq</span>}
          {closing && <span className={closing.urgent ? 'text-[#F59E0B]' : ''}>Closes {closing.text}</span>}
          {market.platform === 'polymarket' && typeof (market.metadata as Record<string, unknown>)?.slug === 'string' && (
            <a href={`https://polymarket.com/event/${(market.metadata as Record<string, string>).slug}`} target="_blank" rel="noopener noreferrer" className="text-[#06B6D4] hover:underline">↗ View</a>
          )}
        </div>
      </div>

      {/* Price Chart */}
      {priceHistory && priceHistory.length > 1 && (
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2">Price History (7d)</div>
          <PriceSparkline
            history={priceHistory}
            platform={market.platform}
            metaculusPrediction={metaculus?.prediction}
            crossPlatformPrice={crossPlatform?.matchedMarket ? getYesPrice(crossPlatform.matchedMarket.prices) : undefined}
            crossPlatformPlatform={crossPlatform?.matchedPlatform}
          />
        </div>
      )}

      {/* Current Price — big display */}
      <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider">Current Odds</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-[#22C55E]">{Math.round(yesPrice * 100)}%</span>
            <span className="text-[12px] text-[#64748B]">YES</span>
            <span className="text-[12px] text-[#334155] mx-1">/</span>
            <span className="text-lg font-mono text-[#EF4444]">{Math.round((1 - yesPrice) * 100)}%</span>
            <span className="text-[12px] text-[#64748B]">NO</span>
          </div>
        </div>
        {movement && (
          <div className={`text-right ${movement.positive ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
            <div className="text-[14px] font-mono font-medium">{movement.text}</div>
            <div className="text-[10px] text-[#64748B]">{movement.period}</div>
          </div>
        )}
      </div>

      {/* Live cross-platform match — shown only when the frozen study has NOT verified this market
          (a studied market gets the richer, audited verifier verdict below instead). */}
      {!rec && crossPlatform?.matchedMarket && (
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2">Cross-Platform (live)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-[#64748B] capitalize">{market.platform}</div>
              <div className="text-[18px] font-mono font-bold text-[#F8FAFC]">{Math.round(yesPrice * 100)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-[#64748B] capitalize">{crossPlatform.matchedPlatform}</div>
              <div className="text-[18px] font-mono font-bold text-[#F8FAFC]">
                {Math.round(getYesPrice(crossPlatform.matchedMarket.prices) * 100)}%
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px]">
            <span className="text-[#F59E0B] font-mono font-medium">
              {Math.round(Math.abs(yesPrice - getYesPrice(crossPlatform.matchedMarket.prices)) * 100)}pp gap
            </span>
            <span className="text-[#64748B]"> · Match: {Math.round(crossPlatform.confidence * 100)}%</span>
          </div>
        </div>
      )}

      {/* Study-backed verifier verdict — the frozen-run counterpart, gap-vs-fee ruler, contract
          checklist, and an honest is-this-actionable line. Falls back to a 'live only' note. */}
      <VerifierPanel rec={rec} feeFloorPp={feeFloorPp} />

      {/* Metaculus Signal */}
      {metaculus && (
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2">Metaculus Superforecasters</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] text-[#64748B]">Forecasters</div>
              <div className="text-[16px] font-mono font-bold text-[#06B6D4]">{Math.round(metaculus.prediction * 100)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-[#64748B]">Market</div>
              <div className="text-[16px] font-mono font-bold text-[#F8FAFC]">{Math.round(metaculus.marketPrice * 100)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-[#64748B]">Divergence</div>
              <div className={`text-[16px] font-mono font-bold ${metaculus.divergence > 0.05 ? 'text-[#F59E0B]' : 'text-[#64748B]'}`}>
                {Math.round(metaculus.divergence * 100)}pp
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[#64748B] mt-1">
            "{metaculus.title}" · Confidence: {Math.round(metaculus.confidence * 100)}%
          </div>
        </div>
      )}

      {/* Settlement Warnings */}
      {settlement?.riskFactors && settlement.riskFactors.length > 0 && (
        <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded p-3">
          <div className="text-[10px] text-[#F59E0B] uppercase tracking-wider mb-1">Settlement Risk</div>
          {settlement.riskFactors.map((rf, i) => (
            <div key={i} className="text-[11px] text-[#F59E0B]/80">• {rf}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

/** Platform tint — Polymarket blue, Kalshi green (locked); violet only as a neutral cross-ref. */
function platformColor(p?: string): string {
  return p === 'kalshi' ? '#22C55E' : p === 'polymarket' ? '#60A5FA' : '#8B5CF6';
}

function HoverDot({ leftPct, topPct, color }: { leftPct: number; topPct: number; color: string }) {
  return (
    <div
      className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-2.5 h-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/**
 * The elevated price-history chart — a real time-series (now backed by live CLOB history) drawn as
 * a platform-colored line over an area-fill, with Metaculus + cross-platform reference lines and an
 * interactive hover crosshair that reads out the price + date at any point. Distortion-free: the SVG
 * fills the box (preserveAspectRatio none) for the line/area, while the dots + crosshair are HTML
 * overlays positioned by percentage.
 */
function PriceSparkline({
  history,
  platform,
  metaculusPrediction,
  crossPlatformPrice,
  crossPlatformPlatform,
}: {
  history: { timestamp: number; data: { prices: Record<string, number> } }[];
  platform: string;
  metaculusPrediction?: number;
  crossPlatformPrice?: number;
  crossPlatformPlatform?: string;
}) {
  const prices = history.map((s) => getYesPrice(s.data.prices));
  const [hover, setHover] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  if (prices.length < 2) return null;

  const lineColor = platformColor(platform);
  const xpColor = platformColor(crossPlatformPlatform);

  const lo = Math.min(...prices, metaculusPrediction ?? 1, crossPlatformPrice ?? 1) - 0.03;
  const hi = Math.max(...prices, metaculusPrediction ?? 0, crossPlatformPrice ?? 0) + 0.03;
  const range = hi - lo || 0.1;
  const xPct = (i: number) => (i / (prices.length - 1)) * 100;
  const yPct = (p: number) => 100 - ((p - lo) / range) * 100;

  const linePts = prices.map((p, i) => `${xPct(i)},${yPct(p)}`).join(' ');
  const areaPts = `0,100 ${linePts} 100,100`;
  const hIdx = hover == null ? null : Math.max(0, Math.min(prices.length - 1, hover));
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * (prices.length - 1)));
  const gid = `pf-${platform}`;

  return (
    <div>
      <div
        ref={ref}
        className="relative h-24 cursor-crosshair"
        onMouseMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (r) setHover(Math.round(((e.clientX - r.left) / r.width) * (prices.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areaPts} fill={`url(#${gid})`} />
          {metaculusPrediction != null && (
            <line x1="0" y1={yPct(metaculusPrediction)} x2="100" y2={yPct(metaculusPrediction)} stroke="#06B6D4" strokeWidth="1" strokeDasharray="4,3" opacity="0.5" vectorEffect="non-scaling-stroke" />
          )}
          {crossPlatformPrice != null && (
            <line x1="0" y1={yPct(crossPlatformPrice)} x2="100" y2={yPct(crossPlatformPrice)} stroke={xpColor} strokeWidth="1" strokeDasharray="2,4" opacity="0.55" vectorEffect="non-scaling-stroke" />
          )}
          <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {hIdx == null ? (
          <HoverDot leftPct={xPct(prices.length - 1)} topPct={yPct(prices[prices.length - 1])} color={lineColor} />
        ) : (
          <>
            <div className="absolute top-0 bottom-0 border-l border-dashed border-[#475569] pointer-events-none" style={{ left: `${xPct(hIdx)}%` }} />
            <HoverDot leftPct={xPct(hIdx)} topPct={yPct(prices[hIdx])} color={lineColor} />
            <div className="absolute top-0 left-0 text-[10px] font-mono bg-[#020617]/80 px-1 rounded pointer-events-none">
              <span className="text-[#F8FAFC]">{Math.round(prices[hIdx] * 100)}%</span>
              <span className="text-[#64748B]"> · {fmtDate(history[hIdx].timestamp)}</span>
            </div>
          </>
        )}

        <div className="absolute top-0.5 right-1 text-right text-[8px] font-mono leading-tight pointer-events-none">
          {crossPlatformPrice != null && <div style={{ color: xpColor }}>XP {Math.round(crossPlatformPrice * 100)}%</div>}
          {metaculusPrediction != null && <div className="text-[#06B6D4]">MC {Math.round(metaculusPrediction * 100)}%</div>}
        </div>
      </div>

      <div className="flex justify-between text-[8px] font-mono text-[#64748B] mt-1">
        {ticks.map((ti, k) => (
          <span key={k}>{fmtDate(history[ti].timestamp)}</span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-[9px] text-[#64748B] mt-1.5">
        <LegendItem color={lineColor} label={`${platform === 'kalshi' ? 'Kalshi' : 'Polymarket'} YES`} />
        {crossPlatformPrice != null && <LegendItem color={xpColor} label="Cross-platform" />}
        {metaculusPrediction != null && <LegendItem color="#06B6D4" label="Metaculus" />}
        <span className="ml-auto text-[#475569]">hover for readout</span>
      </div>
    </div>
  );
}

function computeMovement(
  priceHistory?: { timestamp: number; data: { prices: Record<string, number> } }[]
): { text: string; period: string; positive: boolean } | null {
  if (!priceHistory || priceHistory.length < 2) return null;

  const latest = getYesPrice(priceHistory[priceHistory.length - 1].data.prices);
  const dayAgo = Date.now() - 86400000;

  // Find price closest to 24h ago
  let oldPrice = getYesPrice(priceHistory[0].data.prices);
  for (const snap of priceHistory) {
    if (snap.timestamp <= dayAgo) oldPrice = getYesPrice(snap.data.prices);
  }

  const diff = Math.round((latest - oldPrice) * 100);
  if (diff === 0) return { text: 'Flat', period: '24h', positive: true };
  return {
    text: `${diff > 0 ? '+' : ''}${diff}pp`,
    period: '24h',
    positive: diff > 0,
  };
}
