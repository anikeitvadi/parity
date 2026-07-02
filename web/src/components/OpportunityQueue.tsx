import React, { useEffect, useMemo, useState } from 'react';
import type { FeedItem } from '../api/client.js';
import { formatClosing, formatVolume, groupFeed, marketEntity, type QueueRow, type FeedGroupRow } from '../lib/utils.js';
import { useVerifierIndex } from '../lib/useVerifierIndex.js';
import { STATE_META, TONE_CLASS, type VerifierRecord } from '../lib/verifier.js';

interface Props {
  items: FeedItem[];
  selectedId: { platform: string; id: string } | null;
  onSelect: (platform: string, id: string) => void;
  loading: boolean;
}

/** Platform chip. 'mixed' is used for groups spanning both platforms. */
function PlatBadge({ platform }: { platform: string }) {
  if (platform === 'mixed') {
    return <span className="w-10 shrink-0 text-center text-[9px] font-semibold rounded px-1 py-0.5 bg-slate-500/10 text-slate-400">MIX</span>;
  }
  const poly = platform === 'polymarket';
  return (
    <span className={`w-10 shrink-0 text-center text-[9px] font-semibold rounded px-1 py-0.5 ${poly ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
      {poly ? 'POLY' : 'KAL'}
    </span>
  );
}

/** The verifier state from the frozen study — only when this live market joined the study (~19%);
 *  otherwise a faint dot, never a green "verified" claim on an unstudied market. */
function VerifChip({ rec }: { rec?: VerifierRecord }) {
  if (!rec) return <span className="w-[68px] shrink-0 text-center text-[10px] text-[#334155]">·</span>;
  const m = STATE_META[rec.state];
  return (
    <span
      className={`w-[68px] shrink-0 text-center text-[8px] font-semibold rounded px-1 py-0.5 ${TONE_CLASS[m.tone]}`}
      title={`${m.label} — ${m.blurb}`}
    >
      {m.short}
    </span>
  );
}

/** A real signal (not the old always-empty columns): cross-platform match or Metaculus divergence. */
function signalInfo(item: FeedItem): string | null {
  const parts: string[] = [];
  if (item.matchedPlatform) parts.push(`Cross-platform match (${item.matchedPlatform})`);
  if (item.divergence != null) parts.push(`Metaculus divergence ${item.divergence > 0 ? '+' : ''}${Math.round(item.divergence * 100)}pp`);
  if (parts.length === 0 && item.signal != null) parts.push('Signal present');
  return parts.length ? parts.join(' · ') : null;
}

/** A single market row — used for standalone markets and for expanded group members. */
function MarketRow({
  item,
  selected,
  onSelect,
  verifier,
  indent = false,
}: {
  item: FeedItem;
  selected: boolean;
  onSelect: (platform: string, id: string) => void;
  verifier?: VerifierRecord;
  indent?: boolean;
}) {
  const closing = item.closeDate ? formatClosing(item.closeDate) : null;
  const sig = signalInfo(item);
  return (
    <div
      onClick={() => onSelect(item.platform, item.marketId)}
      className={`flex items-center gap-1 px-2 py-[5px] cursor-pointer transition-colors border-l-2 ${
        selected ? 'bg-[#0E1223] border-[#06B6D4]' : 'border-transparent hover:bg-[#0E1223]/60'
      }`}
    >
      <span className="w-10 shrink-0 text-right font-mono font-medium text-[#E2E8F0] tabular-nums">
        {Math.round(item.yesPrice * 100)}%
      </span>
      <span className={`flex-1 min-w-0 px-1 truncate text-[#F8FAFC] ${indent ? 'pl-4 text-[#CBD5E1]' : ''}`}>
        {indent ? marketEntity(item.marketQuestion) : item.marketQuestion}
      </span>
      <VerifChip rec={verifier} />
      <PlatBadge platform={item.platform} />
      <span className="w-12 shrink-0 text-right font-mono text-[#64748B] tabular-nums">
        {item.volume > 0 ? formatVolume(item.volume) : '·'}
      </span>
      <span className={`w-9 shrink-0 text-right tabular-nums ${closing?.urgent ? 'text-[#F59E0B]' : 'text-[#64748B]'}`}>
        {closing?.text || '·'}
      </span>
      <span className="w-3 shrink-0 flex justify-center" title={sig || undefined}>
        {sig ? <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]" /> : null}
      </span>
    </div>
  );
}

/** Collapsed group header: one line for an event, with a top-outcomes summary. */
function GroupRow({ group, expanded, onToggle }: { group: FeedGroupRow; expanded: boolean; onToggle: () => void }) {
  const closing = group.closeDate ? formatClosing(group.closeDate) : null;
  const top = [...group.members]
    .sort((a, b) => b.yesPrice - a.yesPrice)
    .slice(0, 3)
    .map((m) => `${marketEntity(m.marketQuestion)} ${Math.round(m.yesPrice * 100)}%`)
    .join(', ');
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-1 px-2 py-[6px] cursor-pointer transition-colors border-l-2 border-transparent hover:bg-[#0E1223]/60"
    >
      <span className="w-10 shrink-0 text-right font-mono text-[#64748B]">{expanded ? '▾' : '▸'}</span>
      <div className="flex-1 min-w-0 px-1">
        <div className="truncate text-[#F8FAFC] font-medium">{group.title}</div>
        <div className="truncate text-[10px] text-[#64748B]">
          {group.members.length} outcomes · {top}
        </div>
      </div>
      <span className="w-[68px] shrink-0" />
      <PlatBadge platform={group.platform} />
      <span className="w-12 shrink-0 text-right font-mono text-[#64748B] tabular-nums">{formatVolume(group.totalVolume)}</span>
      <span className={`w-9 shrink-0 text-right tabular-nums ${closing?.urgent ? 'text-[#F59E0B]' : 'text-[#64748B]'}`}>
        {closing?.text || '·'}
      </span>
      <span className="w-3 shrink-0" />
    </div>
  );
}

export function OpportunityQueue({ items, selectedId, onSelect, loading }: Props) {
  const { index: verifierIndex } = useVerifierIndex();
  const rows = useMemo<QueueRow[]>(() => groupFeed(items), [items]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Keep keyboard/cross-pane selection coherent: if the selected market lives
  // inside a collapsed group, open that group so the highlight is visible.
  useEffect(() => {
    if (!selectedId) return;
    for (const row of rows) {
      if (row.kind === 'group' && row.members.some((m) => m.marketId === selectedId.id && m.platform === selectedId.platform)) {
        setExpanded((prev) => (prev.has(row.key) ? prev : new Set(prev).add(row.key)));
        break;
      }
    }
  }, [selectedId, rows]);

  const isSelected = (item: FeedItem) => selectedId?.id === item.marketId && selectedId?.platform === item.platform;

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
      <div className="flex items-center justify-center h-full text-[12px] text-[#64748B]">No markets found</div>
    );
  }

  return (
    <div className="text-[12px]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-[#64748B] bg-[#020617] border-b border-[#1E293B]">
        <span className="w-10 shrink-0 text-right">Price</span>
        <span className="flex-1 px-1">Market</span>
        <span className="w-[68px] shrink-0 text-center">Verif</span>
        <span className="w-10 shrink-0 text-center">Plat</span>
        <span className="w-12 shrink-0 text-right">Vol</span>
        <span className="w-9 shrink-0 text-right">Close</span>
        <span className="w-3 shrink-0" />
      </div>

      {/* Rows */}
      {rows.map((row) => {
        if (row.kind === 'group') {
          const isExp = expanded.has(row.key);
          return (
            <React.Fragment key={`g:${row.key}`}>
              <GroupRow group={row} expanded={isExp} onToggle={() => toggle(row.key)} />
              {isExp &&
                row.members.map((m) => (
                  <MarketRow key={m.id} item={m} selected={isSelected(m)} onSelect={onSelect} verifier={verifierIndex.get(m.marketId)} indent />
                ))}
            </React.Fragment>
          );
        }
        return <MarketRow key={row.item.id} item={row.item} selected={isSelected(row.item)} onSelect={onSelect} verifier={verifierIndex.get(row.item.marketId)} />;
      })}
    </div>
  );
}
