import { useEffect, useRef } from 'react';

/**
 * The Efficiency Lab signature visual — a data-bound "market inefficiency surface"
 * (DESIGN.md §10). A rotating point field: cyan Polymarket / violet Kalshi clusters
 * sized to the real tradeable counts, cyan threads for verified cross-platform
 * overlaps, and amber/red flares for apparent fee-clearing gaps that FLATTEN as the
 * triage cycle runs — ending in a flat field (no confirmed-arbitrage peak).
 *
 * Every thread + flare is a real verified pair; the background cloud encodes scale,
 * not individual markets. Canvas2D (no 3D dependency). Honors prefers-reduced-motion
 * by rendering the final flattened state statically.
 */

export interface SurfaceOverlap {
  /** Absolute price gap (0–1). */
  gap: number;
  /** True once verified same-contract (drawn as a solid thread). */
  sameContract: boolean;
  /** Triage terminal for an apparent gap, e.g. 'settlement_ambiguity' | 'entity_mismatch_rejected'. */
  triageLabel?: string;
}

interface Props {
  polyCount: number;
  kalshiCount: number;
  overlaps: SurfaceOverlap[];
  /** Fee threshold above which a gap is "apparent" (default 0.09 round-trip). */
  feeThreshold?: number;
  className?: string;
  height?: number;
}

const COLORS = {
  poly: '#60A5FA', // Polymarket = blue (platform identity)
  kalshi: '#22C55E', // Kalshi = green (platform identity)
  thread: 'rgba(139,92,246,0.22)', // violet = model-derived / verified overlap
  warn: '#F59E0B', // amber = caution / unresolved mismatch (apparent gap)
  bad: '#EF4444', // red = blocked / invalid (entity / scope reject)
  faded: '#334155', // removed by triage
};

// Deterministic pseudo-random so the field is stable frame-to-frame and across renders.
const rnd = (s: number) => {
  const x = Math.sin(s * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export function InefficiencySurface({
  polyCount,
  kalshiCount,
  overlaps,
  feeThreshold = 0.09,
  className,
  height = 420,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Background cloud: a fixed sample sized by share of the two platforms (scale, not identity).
    const CLOUD = 220;
    const polyShare = polyCount / Math.max(1, polyCount + kalshiCount);
    const cloud = Array.from({ length: CLOUD }, (_, i) => {
      const poly = i / CLOUD < polyShare;
      const a = rnd(i) * Math.PI * 2;
      const r = 0.35 + Math.abs(rnd(i * 3)) * 0.6;
      return { poly, x: (poly ? -1.1 : 1.1) + Math.cos(a) * r * 0.8, z: Math.sin(a) * r };
    });

    // Real overlaps → threads + flares. Cap for legibility; spread across the field.
    const shown = overlaps.slice(0, 80).map((o, i) => {
      const a = rnd(i * 5.3) * Math.PI * 2;
      const r = 0.2 + Math.abs(rnd(i * 2.1)) * 0.7;
      const apparent = o.gap > feeThreshold;
      const reject = o.triageLabel === 'entity_mismatch_rejected' || o.triageLabel === 'scope_mismatch';
      const thin = o.triageLabel === 'thin_or_dead_liquidity';
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        peak: apparent ? 0.5 + Math.min(0.9, o.gap * 1.6) : 0.12,
        apparent,
        color: reject ? COLORS.bad : thin ? COLORS.faded : COLORS.warn,
        decay: thin ? 1 : reject ? 0.7 : 0.6, // how much triage flattens it
      };
    });

    let raf = 0;
    let DPR = 1;
    let W = 0;
    function size() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = canvas!.clientWidth;
      canvas!.width = W * DPR;
      canvas!.height = height * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    const project = (x: number, y: number, z: number, rot: number) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      const rx = x * c - z * s, rz = x * s + z * c;
      const persp = 2.6 / (2.6 + rz);
      return { sx: W / 2 + rx * 150 * persp, sy: height * 0.56 - y * 150 * persp - rz * 18, s: persp };
    };

    const INTRO = 5500; // establish noisy → flattened ONCE, then settle and get out of the way
    let start = 0;
    function frame(now: number) {
      if (!start) start = now;
      const elapsed = now - start;
      ctx!.clearRect(0, 0, W, height);
      const rot = reduce ? 0.5 : 0.45 + Math.min(elapsed, 8000) / 14000; // slow, calming, finite
      const raw = Math.min(1, elapsed / INTRO);
      const tp = reduce ? 1 : raw * raw * (3 - 2 * raw); // smoothstep to the flattened post-triage field

      // floor grid
      ctx!.strokeStyle = 'rgba(30,41,59,0.5)';
      ctx!.lineWidth = 1;
      for (let gx = -2; gx <= 2; gx += 0.5) {
        ctx!.beginPath();
        for (let gz = -1.4; gz <= 1.4; gz += 0.1) {
          const p = project(gx, 0, gz, rot);
          gz === -1.4 ? ctx!.moveTo(p.sx, p.sy) : ctx!.lineTo(p.sx, p.sy);
        }
        ctx!.stroke();
      }

      // threads (verified overlaps)
      ctx!.strokeStyle = COLORS.thread;
      ctx!.lineWidth = 1;
      for (const o of shown) {
        const a = project(o.x - 0.18, o.peak * (o.apparent ? 1 - tp * o.decay : 1), o.z, rot);
        const b = project(o.x + 0.18, 0.12, o.z, rot);
        ctx!.beginPath();
        ctx!.moveTo(a.sx, a.sy);
        ctx!.lineTo(b.sx, b.sy);
        ctx!.stroke();
      }

      // background cloud (scale)
      for (const p of cloud) {
        const proj = project(p.x, 0, p.z, rot);
        ctx!.fillStyle = p.poly ? COLORS.poly : COLORS.kalshi;
        ctx!.globalAlpha = 0.5;
        ctx!.beginPath();
        ctx!.arc(proj.sx, proj.sy, 1.8 * proj.s, 0, 7);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      // gap flares (apparent gaps, flattening with triage)
      for (const o of shown) {
        if (!o.apparent) continue;
        const shrink = 1 - tp * o.decay;
        const base = project(o.x, 0, o.z, rot);
        const top = project(o.x, o.peak * shrink, o.z, rot);
        ctx!.strokeStyle = o.color;
        ctx!.lineWidth = 1.5 * top.s;
        ctx!.beginPath();
        ctx!.moveTo(base.sx, base.sy);
        ctx!.lineTo(top.sx, top.sy);
        ctx!.stroke();
        ctx!.globalAlpha = 0.5 * shrink;
        ctx!.fillStyle = o.color;
        ctx!.beginPath();
        ctx!.arc(top.sx, top.sy, 5 * top.s, 0, 7);
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      // Animate the intro, settle briefly, then FREEZE — the hero must never compete
      // with the proof layer (waterfall/matrix), where credibility lives.
      if (!reduce && elapsed < 8000) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [polyCount, kalshiCount, overlaps, feeThreshold, height]);

  return <canvas ref={canvasRef} className={className} style={{ width: '100%', height, display: 'block' }} />;
}
