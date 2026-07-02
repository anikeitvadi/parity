import { useEffect, useState } from 'react';
import { IS_STATIC, getSnapshotMeta, type SnapshotMeta } from '../api/client.js';

/**
 * "Frozen snapshot · captured <date> · not live" — shown ONLY in static portfolio mode so the
 * public demo never reads as live market data. Amber on purpose: the blue/green palette is
 * reserved for Polymarket/Kalshi, so a demo notice must not borrow those.
 */
export function SnapshotBadge() {
  const [meta, setMeta] = useState<SnapshotMeta | null>(null);
  useEffect(() => {
    if (IS_STATIC) getSnapshotMeta().then(setMeta).catch(() => {});
  }, []);

  if (!IS_STATIC) return null;
  const when = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return (
    <span
      title="Frozen data snapshot for the public demo — not live market data."
      className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300/90"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Frozen snapshot · {when} · not live
    </span>
  );
}
