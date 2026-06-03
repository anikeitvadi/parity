/** Shared utilities for the research terminal. */

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
