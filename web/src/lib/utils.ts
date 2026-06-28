/** Shared utilities for the research terminal. */

import type { FeedItem } from '../api/client.js';

export function getYesPrice(prices: Record<string, number>): number {
  return prices['Yes'] ?? prices['yes'] ?? Object.values(prices)[0] ?? 0.5;
}

export function formatClosing(closeDate: string): { text: string; urgent: boolean } | null {
  const close = new Date(closeDate);
  if (isNaN(close.getTime())) return null;
  const daysLeft = (close.getTime() - Date.now()) / 86400000;
  if (daysLeft < 0) return null;
  if (daysLeft < 1) return { text: `${Math.max(1, Math.round(daysLeft * 24))}h`, urgent: true };
  if (daysLeft < 7) return { text: `${Math.round(daysLeft)}d`, urgent: true };
  if (daysLeft < 30) return { text: `${Math.round(daysLeft)}d`, urgent: false };
  return { text: close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false };
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${Math.round(vol / 1_000)}K`;
  return `$${Math.round(vol)}`;
}

export function kellyEstimate(userProb: number, marketPrice: number): { fraction: number; direction: string } {
  const edge = Math.abs(userProb - marketPrice);
  const direction = userProb > marketPrice ? 'BUY YES' : 'BUY NO';
  // Half-Kelly: f = edge * 0.5, capped at 10%
  const fraction = Math.min(0.10, edge * 0.5);
  return { fraction: edge > 0.01 ? fraction : 0, direction };
}

export const TYPE_LABELS: Record<string, { short: string; color: string }> = {
  toss_up: { short: 'TOSS', color: 'text-yellow-400 bg-yellow-500/10' },
  closing_soon: { short: 'CLOSE', color: 'text-red-400 bg-red-500/10' },
  high_conviction: { short: 'CONV', color: 'text-green-400 bg-green-500/10' },
  contrarian: { short: 'CONTR', color: 'text-violet-400 bg-violet-500/10' },
  price_gap: { short: 'GAP', color: 'text-cyan-400 bg-cyan-500/10' },
};

export const CATEGORY_COLORS: Record<string, string> = {
  Politics: 'text-blue-400',
  Economics: 'text-emerald-400',
  Sports: 'text-orange-400',
  Technology: 'text-violet-400',
  Crypto: 'text-yellow-400',
  Climate: 'text-teal-400',
  Entertainment: 'text-pink-400',
  Geopolitics: 'text-red-400',
  Health: 'text-green-400',
  World: 'text-cyan-400',
  Elections: 'text-blue-400',
};

// --- Queue grouping: collapse multi-outcome event variants into one row ---

const GROUP_VERBS = 'win|be|become|reach|make|qualify|advance|finish|score|exceed|hit|lead|control|flip|defeat|beat';
const GROUP_RE = new RegExp(`^Will\\s+(.+?)\\s+(${GROUP_VERBS})\\s+(.+)$`, 'i');

/** Split "Will <entity> <predicate>?" into a grouping key, the entity, and the predicate. */
function groupSignature(question: string): { key: string; entity: string; predicate: string } | null {
  const m = question.trim().replace(/\?+\s*$/, '').match(GROUP_RE);
  if (!m) return null;
  const entity = m[1].trim();
  const predicate = `${m[2]} ${m[3]}`.trim();
  return { key: predicate.toLowerCase(), entity, predicate };
}

/** The varying outcome label for a market, e.g. "South Korea" in a World Cup winner market. */
export function marketEntity(question: string): string {
  return groupSignature(question)?.entity ?? question;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A human title for a collapsed group, derived from the shared predicate. */
function groupTitle(predicate: string): string {
  let m = predicate.match(/^win\s+(?:the\s+|a\s+|an\s+)?(.+)$/i);
  if (m) return `${m[1]} · winner`;
  m = predicate.match(/^(?:be|become)\s+(?:the\s+)?(.+)$/i);
  if (m) return cap(m[1]);
  return cap(predicate);
}

export interface FeedGroupRow {
  kind: 'group';
  key: string;
  title: string;
  members: FeedItem[];
  totalVolume: number;
  platform: string; // 'polymarket' | 'kalshi' | 'mixed'
  closeDate?: string;
}
export type QueueRow = { kind: 'single'; item: FeedItem } | FeedGroupRow;

/**
 * Collapse obvious multi-outcome event variants (e.g. one market per country in
 * "Will <X> win the 2026 FIFA World Cup?") into a single expandable group row, so
 * one event can't flood the queue. A group is placed at its highest-ranked
 * member's position, preserving the incoming sort; buckets smaller than `minGroup`
 * stay as individual rows.
 */
export function groupFeed(items: FeedItem[], minGroup = 4): QueueRow[] {
  const buckets = new Map<string, FeedItem[]>();
  const sigById = new Map<string, NonNullable<ReturnType<typeof groupSignature>>>();
  for (const it of items) {
    const sig = groupSignature(it.marketQuestion);
    if (!sig) continue;
    sigById.set(it.id, sig);
    const arr = buckets.get(sig.key);
    if (arr) arr.push(it);
    else buckets.set(sig.key, [it]);
  }

  const rows: QueueRow[] = [];
  const emitted = new Set<string>();
  for (const it of items) {
    const sig = sigById.get(it.id);
    const members = sig ? buckets.get(sig.key) : undefined;
    if (sig && members && members.length >= minGroup) {
      if (emitted.has(sig.key)) continue;
      emitted.add(sig.key);
      const platforms = new Set(members.map((m) => m.platform));
      rows.push({
        kind: 'group',
        key: sig.key,
        title: groupTitle(sig.predicate),
        members,
        totalVolume: members.reduce((s, m) => s + (m.volume || 0), 0),
        platform: platforms.size === 1 ? [...platforms][0] : 'mixed',
        closeDate: members[0].closeDate,
      });
    } else {
      rows.push({ kind: 'single', item: it });
    }
  }
  return rows;
}
