import { useEffect, useMemo, useRef, useState } from 'react';
import type { EfficiencyStudy, EfficiencyPair } from '../../api/client.js';
import { drawWaveText } from '../../lib/pretextText.js';

/**
 * The signature Lab visual — a rotating 3D "consensus field" where every point, thread, and flare is
 * real. Two lobes (Polymarket left, Kalshi right) hold the tradeable universe; cross-platform
 * same-contract pairs are drawn as threads stitching the lobes together; the apparent fee-clearing
 * gaps rise as flares, colored by why they fail (settlement nuance = amber, entity/scope = red). As
 * verification runs, the flares collapse and the reds fall — ending at zero confirmed executable
 * arbitrage. A featured real market question rides above the field in @chenglou/pretext
 * variable-weight typography. Comprehension never needs motion: the readout + legend below stay put,
 * and prefers-reduced-motion freezes the field to its resolved state.
 */

// Locked platform colors (match the Scanner): Polymarket BLUE, Kalshi GREEN.
const POLY: [number, number, number] = [96, 165, 250]; // #60A5FA
const KALSHI: [number, number, number] = [34, 197, 94]; // #22C55E
const THREAD: [number, number, number] = [34, 211, 238]; // #22D3EE
const AMBER: [number, number, number] = [245, 158, 11];
const RED: [number, number, number] = [239, 68, 68];
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Deterministic hash-noise so the field is stable across frames/reloads.
const rnd = (s: number) => {
  const v = Math.sin(s * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

interface Pt { x: number; y: number; z: number; side: 0 | 1; bright: number }
interface Thread { a: Pt; b: Pt }
interface Flare { base: Pt; height: number; cat: 0 | 1 | 2 } // 0 thin, 1 settlement, 2 entity/scope

/** Which kind of settlement trap a survivor is, inferred from its verdict rationale. */
function catOf(reason: string): 0 | 1 | 2 {
  const r = (reason || '').toLowerCase();
  if (/entit|candidate|team|player|scope|different (person|team|candidate|event)|top scorer|who /.test(r)) return 2;
  if (/settl|resolv|date|deadline|timing|by |before |expire|window/.test(r)) return 1;
  return 0;
}

function lobe(i: number, side: 0 | 1, bright: number): Pt {
  const cx = side === 0 ? -1.05 : 1.05;
  const a = rnd(i * 1.7) * Math.PI * 2;
  const el = (rnd(i * 3.3) - 0.5) * Math.PI;
  const r = 0.32 + rnd(i * 5.1) * 0.5;
  const ce = Math.cos(el);
  return { x: cx + Math.cos(a) * ce * r * 0.85, y: Math.sin(el) * r * 0.72, z: Math.sin(a) * ce * r * 0.85, side, bright };
}

export function ConsensusField({ study, apparentCount }: { study: EfficiencyStudy; apparentCount?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tpRef = useRef(0);
  const playingRef = useRef(true);
  const startRef = useRef(0);
  const [phase, setPhase] = useState<'scanning' | 'resolved'>('scanning');

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const scene = useMemo(() => {
    const pairs: EfficiencyPair[] = study.pairs ?? [];
    const byVol = (a: EfficiencyPair, b: EfficiencyPair) => (b.volume || 0) - (a.volume || 0);
    const same = pairs.filter((p) => p.triage_label === 'validated_same_contract').sort(byVol).slice(0, 95);
    const surv = pairs.filter((p) => p.triage_label === 'semantic_survivor').sort(byVol).slice(0, 55);
    const bg: Pt[] = [];
    for (let i = 0; i < 440; i++) bg.push(lobe(i + 1000, (i % 2) as 0 | 1, 0.16 + rnd(i * 2.2) * 0.14));
    const threads: Thread[] = same.map((_, i) => ({ a: lobe(i + 1, 0, 0.7), b: lobe(i + 1, 1, 0.7) }));
    const flares: Flare[] = surv.map((p, i) => ({
      base: lobe(i + 500, i % 2 === 0 ? 0 : 1, 0.9),
      height: Math.min(0.95, 0.28 + (p.gap || 0) * 1.5),
      cat: catOf(p.reason || ''),
    }));
    return { bg, threads, flares };
  }, [study]);

  const featured = useMemo(
    () =>
      (study.pairs ?? [])
        .filter((p) => p.triage_label === 'semantic_survivor')
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 6)
        .map((p) => p.question)
        .filter(Boolean),
    [study]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    const project = (x: number, y: number, z: number, rot: number) => {
      const cosr = Math.cos(rot);
      const sinr = Math.sin(rot);
      const rx = x * cosr - z * sinr;
      const rz = x * sinr + z * cosr;
      const S = Math.min(w * 0.5, h * 1.7) * 0.46;
      const persp = 2.6 / (2.6 + rz);
      return { sx: w / 2 + rx * S * persp, sy: h * 0.54 - y * S * persp - rz * S * 0.12, s: persp };
    };

    const draw = (t: number) => {
      const rot = reduced ? 0.5 : t * 0.00019;
      const tp = tpRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      // Threads — real same-contract pairs stitching the two venues.
      for (const th of scene.threads) {
        const a = project(th.a.x, th.a.y, th.a.z, rot);
        const b = project(th.b.x, th.b.y, th.b.z, rot);
        ctx.globalAlpha = 0.16 * Math.min(a.s, b.s);
        ctx.strokeStyle = rgba(THREAD, 1);
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // Background universe points.
      const drawPt = (p: Pt) => {
        const q = project(p.x, p.y, p.z, rot);
        ctx.globalAlpha = Math.min(1, p.bright * q.s * 1.45);
        ctx.fillStyle = rgba(p.side === 0 ? POLY : KALSHI, 1);
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, 2.3 * q.s, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const p of scene.bg) drawPt(p);
      for (const th of scene.threads) { drawPt(th.a); drawPt(th.b); }

      // Flares — apparent fee-clearing gaps, collapsing as triage runs; reds fall away.
      for (const fl of scene.flares) {
        const shrink = fl.cat === 2 ? 1 - tp : 1 - tp * 0.82; // entity/scope reds vanish; others shrink
        const fall = fl.cat === 2 ? tp * 0.5 : 0;
        const h0 = fl.height * Math.max(0, shrink);
        const base = project(fl.base.x, fl.base.y - fall, fl.base.z, rot);
        const tip = project(fl.base.x, fl.base.y - fall + h0, fl.base.z, rot);
        const col = fl.cat === 2 ? RED : fl.cat === 1 ? AMBER : THREAD;
        const a = (fl.cat === 2 ? 1 - tp : 1) * base.s;
        ctx.globalAlpha = 0.5 * a;
        ctx.strokeStyle = rgba(col, 1);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(base.sx, base.sy);
        ctx.lineTo(tip.sx, tip.sy);
        ctx.stroke();
        ctx.globalAlpha = 0.9 * a;
        ctx.fillStyle = rgba(col, 1);
        ctx.beginPath();
        ctx.arc(tip.sx, tip.sy, 2.6 * tip.s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Featured real market question, in variable-weight pretext typography.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (featured.length) {
        const idx = Math.floor(t / 4200) % featured.length;
        const local = (t % 4200) / 4200;
        const fade = Math.min(1, Math.min(local, 1 - local) * 6); // fade in/out between questions
        const raw = featured[idx].toUpperCase();
        const q = raw.length > 50 ? `${raw.slice(0, 48).trimEnd()}…` : raw; // keep it one sculptural line
        ctx.textAlign = 'left';
        drawWaveText(ctx, q, w / 2, h - 22, {
          size: Math.max(13, Math.min(19, w / 48)),
          t,
          color: '#CBD5E1',
          align: 'center',
          maxWidth: w - 60,
          alpha: 0.9 * fade,
          sizeAmp: 0.2,
        });
      }
    };

    const loop = (t: number) => {
      if (playingRef.current && !reduced) {
        const p = Math.min(1, (t - startRef.current) / 7000);
        tpRef.current = p * p * (3 - 2 * p); // smoothstep
        if (p >= 1) { playingRef.current = false; setPhase('resolved'); }
      }
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    let raf = 0;
    startRef.current = performance.now();
    if (reduced) { tpRef.current = 1; playingRef.current = false; setPhase('resolved'); }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [scene, featured, reduced]);

  const replay = () => {
    startRef.current = performance.now();
    tpRef.current = 0;
    playingRef.current = true;
    setPhase('scanning');
  };

  const f = study.funnel;
  const num = (n?: number) => (n ?? 0).toLocaleString();

  return (
    <div className="relative border-y border-[#1E293B] bg-[#060912] overflow-hidden" style={{ height: '85vh' }}>
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Readout — always legible, independent of the motion. */}
      <div className="absolute top-4 left-5 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#475569]">Consensus Field</div>
        <div className="text-[13px] text-[#F8FAFC] font-medium mt-1 max-w-[280px] leading-snug">
          Every point, thread and flare is a real market.
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <Row color={rgba(POLY, 1)} label="Polymarket universe" value={num(study.universe.polymarket)} />
          <Row color={rgba(KALSHI, 1)} label="Kalshi universe" value={num(study.universe.kalshi)} />
          <Row color={rgba(THREAD, 1)} label="Candidate pairs (cached)" value={num(f?.sameContract)} />
          <Row color={rgba(AMBER, 1)} label="Apparent gaps (flares)" value={num(apparentCount ?? f?.semanticSurvivors)} />
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
