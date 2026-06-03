import React from 'react';
import type { MarketDetailResponse } from '../api/client.js';
import { getYesPrice, formatVolume, formatClosing } from '../lib/utils.js';

interface Props {
  detail: MarketDetailResponse | null;
  loading: boolean;
}

export function EvidenceBoard({ detail, loading }: Props) {
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
            market.platform === 'polymarket' ? 'bg-blue-500/10 text-blue-400' : 'bg-violet-500/10 text-violet-400'
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
            metaculusPrediction={metaculus?.prediction}
            crossPlatformPrice={crossPlatform?.matchedMarket ? getYesPrice(crossPlatform.matchedMarket.prices) : undefined}
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

      {/* Cross-Platform Comparison */}
      {crossPlatform?.matchedMarket && (
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2">Cross-Platform</div>
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

function PriceSparkline({
  history,
  metaculusPrediction,
  crossPlatformPrice,
}: {
  history: { timestamp: number; data: { prices: Record<string, number> } }[];
  metaculusPrediction?: number;
  crossPlatformPrice?: number;
}) {
  const prices = history.map((s) => getYesPrice(s.data.prices));
  if (prices.length < 2) return null;

  const min = Math.min(...prices, metaculusPrediction ?? 1, crossPlatformPrice ?? 1) - 0.03;
  const max = Math.max(...prices, metaculusPrediction ?? 0, crossPlatformPrice ?? 0) + 0.03;
  const range = max - min || 0.1;

  const w = 320;
  const h = 100;
  const pad = 4;

  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const last = points[points.length - 1];

  const refY = (val: number) => h - pad - ((val - min) / range) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
      {/* Metaculus reference line */}
      {metaculusPrediction != null && (
        <>
          <line x1={pad} y1={refY(metaculusPrediction)} x2={w - pad} y2={refY(metaculusPrediction)} stroke="#06B6D4" strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
          <text x={w - pad - 2} y={refY(metaculusPrediction) - 3} fill="#06B6D4" fontSize="8" textAnchor="end" opacity="0.7">MC {Math.round(metaculusPrediction * 100)}%</text>
        </>
      )}

      {/* Cross-platform reference line */}
      {crossPlatformPrice != null && (
        <>
          <line x1={pad} y1={refY(crossPlatformPrice)} x2={w - pad} y2={refY(crossPlatformPrice)} stroke="#8B5CF6" strokeWidth="1" strokeDasharray="2,4" opacity="0.4" />
          <text x={w - pad - 2} y={refY(crossPlatformPrice) - 3} fill="#8B5CF6" fontSize="8" textAnchor="end" opacity="0.6">XP {Math.round(crossPlatformPrice * 100)}%</text>
        </>
      )}

      {/* Price line */}
      <polyline points={polyline} fill="none" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Current price dot */}
      <circle cx={last.x} cy={last.y} r="3" fill="#22C55E" />
    </svg>
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
