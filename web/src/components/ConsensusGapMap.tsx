import React, { useState } from 'react';
import type { FeedItem } from '../api/client.js';

interface Props {
  items: FeedItem[];
  onSelect: (platform: string, id: string) => void;
}

interface Bubble {
  id: string;
  platform: string;
  marketId: string;
  question: string;
  marketPrice: number;
  signalPrice: number;
  volume: number;
  daysToClose: number | null;
  hasSignal: boolean;
}

export function ConsensusGapMap({ items, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Build bubbles. Markets without a cross-platform signal sit on the
  // diagonal (price == signal) and render faintly.
  const bubbles: Bubble[] = [];

  for (const item of items) {
    const hasSignal = item.signal != null;
    const signalPrice = item.signal ?? item.yesPrice;

    let daysToClose: number | null = null;
    if (item.closeDate) {
      daysToClose = Math.max(0, (new Date(item.closeDate).getTime() - Date.now()) / 86400000);
    }

    bubbles.push({
      id: item.id,
      platform: item.platform,
      marketId: item.marketId,
      question: item.marketQuestion,
      marketPrice: item.yesPrice,
      signalPrice,
      volume: item.volume,
      daysToClose,
      hasSignal,
    });
  }

  // SVG dimensions
  const W = 800;
  const H = 500;
  const pad = { top: 24, right: 24, bottom: 40, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const toX = (p: number) => pad.left + p * plotW;
  const toY = (p: number) => pad.top + (1 - p) * plotH;

  const hoveredBubble = hovered ? bubbles.find((b) => b.id === hovered) : null;

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[#F8FAFC]">Consensus Gap Map</h2>
          <p className="text-[11px] text-[#64748B]">
            X = market price, Y = external signal. Dots far from the diagonal = crowd may be wrong.
            {bubbles.filter((b) => b.hasSignal).length > 0
              ? ` ${bubbles.filter((b) => b.hasSignal).length} markets with signals.`
              : ' Click markets in the queue to enrich with signal data.'}
          </p>
        </div>
        <div className="flex gap-3 text-[10px] text-[#64748B]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22C55E]" /> &gt;30d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> 7-30d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#EF4444]" /> &lt;7d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#64748B]" /> unknown</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="flex-1 w-full max-h-[500px]">
        {/* Background */}
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="#0E1223" rx="4" />

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={toX(v)} y1={pad.top} x2={toX(v)} y2={pad.top + plotH} stroke="#1E293B" strokeWidth="1" />
            <line x1={pad.left} y1={toY(v)} x2={pad.left + plotW} y2={toY(v)} stroke="#1E293B" strokeWidth="1" />
            <text x={toX(v)} y={pad.top + plotH + 16} fill="#64748B" fontSize="10" textAnchor="middle" fontFamily="IBM Plex Mono">{Math.round(v * 100)}%</text>
            <text x={pad.left - 8} y={toY(v) + 3} fill="#64748B" fontSize="10" textAnchor="end" fontFamily="IBM Plex Mono">{Math.round(v * 100)}%</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={pad.left + plotW / 2} y={H - 4} fill="#64748B" fontSize="10" textAnchor="middle">Market Price →</text>
        <text x={12} y={pad.top + plotH / 2} fill="#64748B" fontSize="10" textAnchor="middle" transform={`rotate(-90, 12, ${pad.top + plotH / 2})`}>External Signal →</text>

        {/* Diagonal line (agreement) */}
        <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />

        {/* Bubbles */}
        {bubbles.map((b) => {
          const r = Math.max(3, Math.min(16, 2 + Math.log10(Math.max(b.volume, 1)) * 2));
          const color = b.daysToClose == null ? '#64748B'
            : b.daysToClose < 7 ? '#EF4444'
            : b.daysToClose < 30 ? '#F59E0B'
            : '#22C55E';
          const opacity = b.hasSignal ? 0.8 : 0.25;
          const isHovered = hovered === b.id;

          return (
            <circle
              key={b.id}
              cx={toX(b.marketPrice)}
              cy={toY(b.signalPrice)}
              r={isHovered ? r + 2 : r}
              fill={color}
              opacity={isHovered ? 1 : opacity}
              stroke={isHovered ? '#F8FAFC' : 'none'}
              strokeWidth={isHovered ? 1.5 : 0}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHovered(b.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(b.platform, b.marketId)}
            />
          );
        })}

        {/* Tooltip */}
        {hoveredBubble && (
          <g>
            <rect
              x={Math.min(toX(hoveredBubble.marketPrice) + 10, W - 220)}
              y={Math.max(toY(hoveredBubble.signalPrice) - 50, pad.top)}
              width={210}
              height={46}
              fill="#020617"
              stroke="#334155"
              strokeWidth="1"
              rx="4"
              opacity="0.95"
            />
            <text
              x={Math.min(toX(hoveredBubble.marketPrice) + 18, W - 212)}
              y={Math.max(toY(hoveredBubble.signalPrice) - 34, pad.top + 16)}
              fill="#F8FAFC"
              fontSize="10"
              fontFamily="IBM Plex Sans"
            >
              {hoveredBubble.question.slice(0, 40)}{hoveredBubble.question.length > 40 ? '...' : ''}
            </text>
            <text
              x={Math.min(toX(hoveredBubble.marketPrice) + 18, W - 212)}
              y={Math.max(toY(hoveredBubble.signalPrice) - 18, pad.top + 32)}
              fill="#94A3B8"
              fontSize="9"
              fontFamily="IBM Plex Mono"
            >
              Market: {Math.round(hoveredBubble.marketPrice * 100)}% | Signal: {Math.round(hoveredBubble.signalPrice * 100)}% | Gap: {Math.round(Math.abs(hoveredBubble.marketPrice - hoveredBubble.signalPrice) * 100)}pp
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
