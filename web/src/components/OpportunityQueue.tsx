import React from 'react';
import type { FeedItem } from '../api/client.js';
import { formatClosing, formatVolume, TYPE_LABELS } from '../lib/utils.js';

interface Props {
  items: FeedItem[];
  selectedId: { platform: string; id: string } | null;
  onSelect: (platform: string, id: string) => void;
  loading: boolean;
}

export function OpportunityQueue({ items, selectedId, onSelect, loading }: Props) {
  if (loading && items.length === 0) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-7 bg-[#0E1223] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-[#64748B]">
        No markets found
      </div>
    );
  }

  return (
    <div className="text-[12px]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-[#64748B] bg-[#020617] border-b border-[#1E293B]">
        <span className="w-10 text-right">Price</span>
        <span className="flex-1 px-1">Market</span>
        <span className="w-10 text-center">Plat</span>
        <span className="w-11 text-right">Signal</span>
        <span className="w-10 text-right">Gap</span>
        <span className="w-12 text-right">Vol</span>
        <span className="w-9 text-right">Time</span>
        <span className="w-11 text-center">Type</span>
      </div>

      {/* Rows */}
      {items.map((item) => {
        const isSelected = selectedId?.id === item.marketId && selectedId?.platform === item.platform;
        const closing = item.closeDate ? formatClosing(item.closeDate) : null;
        const typeLabel = item.type ? TYPE_LABELS[item.type] : null;
        const gap = item.divergence != null ? Math.round(item.divergence * 100) : null;

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item.platform, item.marketId)}
            className={`flex items-center gap-1 px-2 py-[5px] cursor-pointer transition-colors border-l-2 ${
              isSelected
                ? 'bg-[#0E1223] border-[#06B6D4]'
                : 'border-transparent hover:bg-[#0E1223]/60'
            }`}
          >
            {/* Price */}
            <span className={`w-10 text-right font-mono font-medium ${
              item.yesPrice >= 0.5 ? 'text-[#22C55E]' : 'text-[#EF4444]'
            }`}>
              {Math.round(item.yesPrice * 100)}%
            </span>

            {/* Question */}
            <span className="flex-1 px-1 truncate text-[#F8FAFC]">
              {item.marketQuestion}
            </span>

            {/* Platform */}
            <span className={`w-10 text-center text-[9px] font-semibold rounded px-1 py-0.5 ${
              item.platform === 'polymarket' ? 'bg-blue-500/10 text-blue-400' : 'bg-violet-500/10 text-violet-400'
            }`}>
              {item.platform === 'polymarket' ? 'POLY' : 'KAL'}
            </span>

            {/* Signal */}
            <span className="w-11 text-right font-mono text-[#06B6D4]">
              {item.signal != null ? `${Math.round(item.signal * 100)}%` : <span className="text-[#334155]">--</span>}
            </span>

            {/* Gap */}
            <span className={`w-10 text-right font-mono ${
              gap != null && Math.abs(gap) >= 5 ? 'text-[#F59E0B]' : 'text-[#64748B]'
            }`}>
              {gap != null ? `${gap > 0 ? '+' : ''}${gap}pp` : <span className="text-[#334155]">--</span>}
            </span>

            {/* Volume */}
            <span className="w-12 text-right font-mono text-[#64748B]">
              {item.volume > 0 ? formatVolume(item.volume) : '--'}
            </span>

            {/* Time */}
            <span className={`w-9 text-right ${closing?.urgent ? 'text-[#F59E0B]' : 'text-[#64748B]'}`}>
              {closing?.text || '--'}
            </span>

            {/* Type */}
            <span className={`w-11 text-center text-[10px] font-medium rounded px-1 py-0.5 ${typeLabel?.color || 'text-[#334155]'}`}>
              {typeLabel?.short || '·'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
