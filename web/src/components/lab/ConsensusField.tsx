import { useEffect, useMemo, useRef, useState } from 'react';
import type { EfficiencyStudy } from '../../api/client.js';

/**
 * The signature Lab visual — an honest "needle in a haystack." The market universe is drawn strictly
 * to scale as two dim galaxies (Polymarket blue, Kalshi green), sized by real counts at ONE published
 * unit: 1 point ≈ 30 markets. Because Kalshi has 65,360 markets and Polymarket 26,930, Kalshi's galaxy
 * is literally 2.43× larger — in both point count and area. Verified same-contract pairs are a quiet
 * bundled cyan bridge through the empty waist. The apparent fee-clearing gaps are a barely-there warm
 * sprinkle at their true ~0.23% scale — findable by hue and pulse, never by size — that a triage breath
 * tests and extinguishes to a genuinely empty zero. Red is reserved for confirmed executable arbitrage,
 * which is 0, so red never appears: its absence is the argument. The thesis reads with motion off — the
 * readout + legend state 92,290 markets · 215 apparent gaps (0.23%) · 0 confirmed.
 */

// Locked platform colors (match the Scanner): Polymarket BLUE, Kalshi GREEN.
const POLY: [number, number, number] = [96, 165, 250]; // #60A5FA
const KALSHI: [number, number, number] = [34, 197, 94]; // #22C55E
const THREAD: [number, number, number] = [34, 211, 238]; // #22D3EE — consensus bridge
const AMBER: [number, number, number] = [245, 158, 11]; // #F59E0B — apparent gaps
const RED: [number, number, number] = [239, 68, 68]; // #EF4444 — reserved for confirmed arb (= 0)
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// One published unit for the whole field — proportion becomes a measurable invariant, not a vibe.
const UNIT = 30; // markets per point
const POLY_CX = -1.05;
const KALSHI_CX = 1.35;
const POLY_LOBE_R = 0.62;
const THREAD_ARCS = 24; // bundled through the waist — never one line per pair
const CYCLE_MS = 12000; // one triage breath

// Render budget (research-backed hard caps): dim vast context, a handful of hot signal elements.
const DOT_R = 2.1; // px, constant across universe AND gaps — size is never bound to importance
const UNIV_ALPHA_MAX = 0.62; // additive: dense cores bloom to their hue
const UNIV_ALPHA_FLOOR = 0.16;
const GALAXY_GLOW_A = 0.2; // soft colored halo behind each galaxy core
const THREAD_ALPHA = 0.34; // the consensus bridge must clearly link the two venues
const GAP_BASE_A = 0.6;
const GAP_ALPHA_PEAK = 0.95;
const SCAN_ALPHA = 0.06;
const NB = 7; // depth bands for the universe (cheap atmospheric fog + fast batched fills)

// Deterministic hash-noise so the field is stable across frames/reloads.
const rnd = (s: number) => {
  const v = Math.sin(s * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

interface Pt { x: number; y: number; z: number; side: 0 | 1 }
interface Thread { a: Pt; b: Pt }
interface Gap { x: number; y: number; z: number; period: number; phase: number }

/** A galaxy point — dense glowing core, sparse halo, so density itself reads as scale. */
function lobe(i: number, side: 0 | 1, cx: number, lobeR: number): Pt {
  const a = rnd(i * 1.7) * Math.PI * 2;
  const el = (rnd(i * 3.3) - 0.5) * Math.PI;
  const r = 0.1 + Math.pow(rnd(i * 5.1), 1.8) * (lobeR - 0.1);
  const ce = Math.cos(el);
  return { x: cx + Math.cos(a) * ce * r * 0.92, y: Math.sin(el) * r * 0.58, z: Math.sin(a) * ce * r * 0.92, side };
}

export function ConsensusField({ study, apparentCount }: { study: EfficiencyStudy; apparentCount?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(0);
  const phaseRef = useRef<'scanning' | 'resolved'>('scanning');
  const [phase, setPhase] = useState<'scanning' | 'resolved'>('scanning');

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // Everything is DERIVED from real counts at UNIT — the field cannot misrepresent proportion.
  const scene = useMemo(() => {
    const polyDots = Math.max(1, Math.round(study.universe.polymarket / UNIT)); // 26,930/30 = 898
    const kalshiDots = Math.max(1, Math.round(study.universe.kalshi / UNIT)); // 65,360/30 = 2179
    const gapDots = Math.max(1, Math.round((apparentCount ?? study.funnel?.semanticSurvivors ?? 0) / UNIT)); // 215/30 = 7
    // Area proportional to count too: kalshi radius scaled so dot density stays uniform across galaxies.
    const kalshiLobeR = POLY_LOBE_R * Math.sqrt(kalshiDots / polyDots);

    const dots: Pt[] = [];
    for (let i = 0; i < polyDots; i++) dots.push(lobe(i, 0, POLY_CX, POLY_LOBE_R));
    for (let i = 0; i < kalshiDots; i++) dots.push(lobe(i + 100000, 1, KALSHI_CX, kalshiLobeR));

    const threads: Thread[] = [];
    for (let i = 0; i < THREAD_ARCS; i++) {
      threads.push({ a: lobe(i * 3 + 7, 0, POLY_CX, POLY_LOBE_R * 0.8), b: lobe(i * 3 + 9, 1, KALSHI_CX, kalshiLobeR * 0.8) });
    }

    // Gaps roughly follow the universe distribution (~29% Poly / ~71% Kalshi), placed in the visible body.
    const polyGaps = Math.round(gapDots * (polyDots / (polyDots + kalshiDots)));
    const gaps: Gap[] = [];
    for (let i = 0; i < gapDots; i++) {
      const side: 0 | 1 = i < polyGaps ? 0 : 1;
      const p = lobe(i * 13 + 3, side, side === 0 ? POLY_CX : KALSHI_CX, (side === 0 ? POLY_LOBE_R : kalshiLobeR) * 0.75);
      gaps.push({ x: p.x, y: p.y, z: p.z, period: 3700 + rnd(i * 5.7) * 700, phase: rnd(i * 8.1) * 4400 });
    }

    return { dots, threads, gaps, kalshiLobeR };
  }, [study, apparentCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pre-baked depth-fog colors for the universe (alpha + fog tint baked in, so fills batch cheaply).
    // Depth only dims the alpha now — hue stays fully saturated so far dots still read blue/green.
    const bands = (base: [number, number, number]) =>
      Array.from({ length: NB }, (_, k) => {
        const zn = (k + 0.5) / NB;
        const a = UNIV_ALPHA_FLOOR + (UNIV_ALPHA_MAX - UNIV_ALPHA_FLOOR) * zn;
        return `rgba(${base[0]},${base[1]},${base[2]},${a})`;
      });
    const polyBands = bands(POLY);
    const kalshiBands = bands(KALSHI);

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const glow = (x: number, y: number, r: number, c: [number, number, number], a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(1, rgba(c, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (t: number, gapVis: number, c: number) => {
      const rot = reduced ? 0.6 : t * 0.00022;
      const tilt = reduced ? 0.13 : Math.sin(t * 0.00012) * 0.16;
      const cy = h * 0.5 + (reduced ? 0 : Math.sin(t * 0.0004) * h * 0.012);
      const cosr = Math.cos(rot);
      const sinr = Math.sin(rot);
      const cost = Math.cos(tilt);
      const sint = Math.sin(tilt);
      const S = Math.min(w * 0.15, h * 0.43);
      const D = 6.0; // flatter perspective so the 2.43× size ratio reads steadily as it rotates

      const project = (x: number, y: number, z: number) => {
        const rx = x * cosr - z * sinr;
        const rzr = x * sinr + z * cosr;
        const ry = y * cost - rzr * sint;
        const rz = y * sint + rzr * cost;
        const persp = D / (D + Math.max(rz, -1.0));
        const zn = Math.max(0, Math.min(1, (2.6 - rz) / 5.2)); // 1 = nearest, 0 = farthest
        return { sx: w / 2 + rx * S * persp, sy: cy - ry * S * persp - rz * S * 0.06, zn, persp };
      };

      const bez = (ax: number, ay: number, bx: number, by: number, kx: number, ky: number, u: number) => {
        const m = 1 - u;
        return { x: m * m * ax + 2 * m * u * kx + u * u * bx, y: m * m * ay + 2 * m * u * ky + u * u * by };
      };

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter'; // additive throughout — cores and cores-of-glow bloom

      // Galaxy core bloom — a soft colored halo behind each core so the universes read as glowing
      // bodies, not dark dust. Radius scales with the galaxy, so Kalshi's halo is visibly larger.
      const coreGlow = (cx: number, base: [number, number, number], lobeR: number) => {
        const q = project(cx, 0, 0);
        glow(q.sx, q.sy, lobeR * S * q.persp * 0.95, base, GALAXY_GLOW_A);
      };
      coreGlow(POLY_CX, POLY, POLY_LOBE_R);
      coreGlow(KALSHI_CX, KALSHI, scene.kalshiLobeR);

      // Scan sweep — a soft cyan band drifting through the field while triage tests the gaps.
      if (!reduced && c >= 0.55 && c < 0.8) {
        const sp = (c - 0.55) / 0.25;
        const sweepY = (0.18 + 0.64 * sp) * h;
        const g = ctx.createLinearGradient(0, sweepY - 52, 0, sweepY + 52);
        g.addColorStop(0, rgba(THREAD, 0));
        g.addColorStop(0.5, rgba(THREAD, SCAN_ALPHA));
        g.addColorStop(1, rgba(THREAD, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, sweepY - 52, w, 104);
      }

      // Consensus bridge — same-contract pairs as bundled arcs bowing through the empty waist.
      const waist = project(0, 0, 0);
      const projA: { sx: number; sy: number; kx: number; ky: number; bx: number; by: number; persp: number }[] = [];
      for (const th of scene.threads) {
        const a = project(th.a.x, th.a.y, th.a.z);
        const b = project(th.b.x, th.b.y, th.b.z);
        const midx = (a.sx + b.sx) / 2;
        const midy = (a.sy + b.sy) / 2;
        const kx = midx + (waist.sx - midx) * 0.55;
        const ky = midy + (waist.sy - midy) * 0.55;
        projA.push({ sx: a.sx, sy: a.sy, kx, ky, bx: b.sx, by: b.sy, persp: (a.persp + b.persp) / 2 });
        const depth = Math.min(a.zn, b.zn);
        const alpha = THREAD_ALPHA * (0.5 + 0.5 * depth);
        const grad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
        grad.addColorStop(0, rgba(THREAD, alpha * 0.35));
        grad.addColorStop(0.5, rgba(THREAD, alpha));
        grad.addColorStop(1, rgba(THREAD, alpha * 0.35));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(kx, ky, b.sx, b.sy);
        ctx.stroke();
      }

      // Universe — colored galaxies, depth-faded by alpha only. Batched by band; additive so the
      // dense cores bloom to bright blue/green while the sparse halo stays dim.
      const paths: Path2D[] = [];
      for (let i = 0; i < 2 * NB; i++) paths.push(new Path2D());
      for (const p of scene.dots) {
        const q = project(p.x, p.y, p.z);
        const k = Math.min(NB - 1, Math.max(0, Math.floor(q.zn * NB)));
        const r = DOT_R * (0.55 + 0.6 * q.zn); // near dots larger — soft particle depth
        const pth = paths[p.side * NB + k];
        pth.moveTo(q.sx + r, q.sy);
        pth.arc(q.sx, q.sy, r, 0, Math.PI * 2);
      }
      ctx.globalAlpha = 1;
      for (let k = 0; k < NB; k++) {
        ctx.fillStyle = polyBands[k];
        ctx.fill(paths[k]);
        ctx.fillStyle = kalshiBands[k];
        ctx.fill(paths[NB + k]);
      }

      // Signal motion on top: thread pings + gap specks (already compositing additively).

      // Thread pings — at most 3 active on a rolling schedule; each fires with its own randomized
      // direction, period and easing, so there is no uniform Poly→Kalshi current.
      if (!reduced) {
        const baseIdx = Math.floor(t / 1300);
        for (let k = 0; k < 3; k++) {
          const i = ((baseIdx + k) % scene.threads.length + scene.threads.length) % scene.threads.length;
          const period = 3900 + rnd(i * 7.3) * 700;
          const local = (((t - rnd(i * 2.9) * period) % period) + period) / period % 1;
          if (local >= 0.55) continue;
          let u = local / 0.55;
          u = 1 - (1 - u) * (1 - u) * (1 - u); // easeOutCubic — fast attack, slow settle
          const dir = rnd(i * 3.1) > 0.5 ? u : 1 - u;
          const a = projA[i];
          const p = bez(a.sx, a.sy, a.bx, a.by, a.kx, a.ky, dir);
          const amp = Math.sin(Math.min(1, u) * Math.PI); // fade in and out along the run
          glow(p.x, p.y, 7 * a.persp, THREAD, 0.85 * amp);
          ctx.globalAlpha = 0.95 * amp;
          ctx.fillStyle = 'rgba(186,240,255,1)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5 * a.persp, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Gap specks — the honest ~0.23% sprinkle. Same core size as a universe dot; findability is
      // carried entirely by warm hue + a small pulsing glow, never by area.
      for (const gp of scene.gaps) {
        const q = project(gp.x, gp.y, gp.z);
        let env = 0.4;
        if (!reduced) {
          const l = (((t - gp.phase) % gp.period) + gp.period) / gp.period % 1;
          env = l < 0.18 ? l / 0.18 : 1 - (l - 0.18) / 0.82; // asymmetric attack/decay
        }
        const a = (GAP_BASE_A + (GAP_ALPHA_PEAK - GAP_BASE_A) * env) * gapVis;
        if (a <= 0.001) continue;
        glow(q.sx, q.sy, (9 + 8 * env) * (0.7 + 0.3 * q.zn), AMBER, 0.7 * a);
        const r = DOT_R * (0.55 + 0.6 * q.zn);
        ctx.globalAlpha = a;
        ctx.fillStyle = rgba(AMBER, 1);
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      let gapVis: number;
      let c = 0;
      if (reduced) {
        gapVis = 0.85;
      } else {
        c = ((t - startRef.current) % CYCLE_MS) / CYCLE_MS;
        if (c < 0.08) gapVis = 0;
        else if (c < 0.2) gapVis = (c - 0.08) / 0.12;
        else if (c < 0.8) gapVis = 1;
        else if (c < 0.95) gapVis = 1 - (c - 0.8) / 0.15;
        else gapVis = 0;
      }
      const want: 'scanning' | 'resolved' = reduced || c < 0.08 || c >= 0.95 ? 'resolved' : 'scanning';
      if (phaseRef.current !== want) { phaseRef.current = want; setPhase(want); }
      draw(t, gapVis, c);
      raf = requestAnimationFrame(loop);
    };

    let raf = 0;
    startRef.current = performance.now();
    if (reduced) { phaseRef.current = 'resolved'; setPhase('resolved'); }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [scene, reduced]);

  const replay = () => {
    startRef.current = performance.now();
    phaseRef.current = 'scanning';
    setPhase('scanning');
  };

  const f = study.funnel;
  const num = (n?: number) => (n ?? 0).toLocaleString();
  const total = study.universe.total;
  const apparent = apparentCount ?? f?.semanticSurvivors ?? 0;
  const pct = total ? ((apparent / total) * 100).toFixed(2) : '0';
  const polyLabel = (study.universe.polymarketIsLowerBound ? '≥' : '') + num(study.universe.polymarket);

  return (
    <div className="relative border-y border-[#1E293B] bg-[#060912] overflow-hidden" style={{ height: '62vh' }}>
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Readout — the thesis is legible with motion off. */}
      <div className="absolute top-4 left-5 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#475569]">Consensus Field</div>
        <div className="text-[13px] text-[#F8FAFC] font-medium mt-1 max-w-[300px] leading-snug">
          1 point ≈ {UNIT} markets — the {num(total)}-market universe, to scale.
        </div>
        <div className="text-[11px] text-[#94A3B8] mt-1 max-w-[300px] leading-snug">
          {num(apparent)} apparent gaps · {pct}% of {num(total)} · <span className="text-[#FCA5A5]">0 survive verification</span>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <Row color={rgba(POLY, 1)} label="Polymarket universe" value={polyLabel} />
          <Row color={rgba(KALSHI, 1)} label="Kalshi universe" value={num(study.universe.kalshi)} />
          <Row color="#64748B" label="Standalone total" value={num(total)} />
          <Row color={rgba(THREAD, 1)} label="Same-contract pairs (verified)" value={num(f?.sameContract)} />
          <Row color={rgba(AMBER, 1)} label="Apparent gaps (to scale)" value={num(apparent)} />
          <Row color={rgba(RED, 1)} label="Confirmed executable arb" value={String(f?.clearExecutableArb ?? 0)} bright />
        </div>
      </div>

      {/* Triage state + replay */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span className={`text-[10px] font-mono px-2 py-1 rounded border ${phase === 'resolved' ? 'bg-[#7F1D1D]/30 text-[#FCA5A5] border-[#991B1B]/40' : 'bg-[#0B0F1D]/70 text-[#94A3B8] border-[#1E293B]'}`}>
          {phase === 'resolved' ? 'post-triage · 0 confirmed' : 'verifying…'}
        </span>
        <button onClick={replay} className="text-[10px] text-[#64748B] hover:text-[#06B6D4] border border-[#1E293B] rounded px-2 py-1 bg-[#0B0F1D]/70 transition-colors">
          ↻ Replay
        </button>
      </div>
    </div>
  );
}

function Row({ color, label, value, bright }: { color: string; label: string; value: string; bright?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-[#64748B]">{label}</span>
      <span className={`ml-auto font-mono tabular-nums ${bright ? 'text-[#FCA5A5]' : 'text-[#CBD5E1]'}`}>{value}</span>
    </div>
  );
}
