import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The signature Lab visual: the market universe COLLAPSING under verification. A Canvas2D particle
 * field where the count at each of the 11 funnel stages is real (92,290 → … → 0). As the scan
 * advances, the glowing core contracts and sheds red rejection fragments, until only the 4 deep
 * survivors remain — then even those wink out to 0 clear executable arbitrage. Every number is the
 * study's; the particles are a proportional sample (a point ≈ many markets early, 1:1 at the tail).
 * Comprehension never depends on motion: the stage ledger below always shows the full funnel, and
 * `prefers-reduced-motion` freezes the animation to a scrub-only static field.
 */

export interface CollapseStage {
  count: number;
  label: string;
  note: string;
}

const BUDGET = 1300; // particle budget = the universe stage's particle count
const GOLDEN = 2.399963; // golden angle, for even phyllotaxis packing
const POLY: [number, number, number] = [96, 165, 250]; // #60A5FA
const KALSHI: [number, number, number] = [52, 211, 153]; // #34D399
const AMBER: [number, number, number] = [245, 158, 11]; // #F59E0B
const GOLD: [number, number, number] = [253, 224, 71]; // #FDE047
const RED: [number, number, number] = [248, 113, 113]; // #F87171

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t),
];
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Particle { i: number; side: 0 | 1; jitterPhase: number; angle: number }

export function FunnelCollapse({ stages }: { stages: CollapseStage[] }) {
  const N = stages.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageFRef = useRef(0);
  const playingRef = useRef(true);
  const startRef = useRef(0);
  const [stageIdx, setStageIdx] = useState(0);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: BUDGET }, (_, i) => ({
        i,
        side: (i % 2) as 0 | 1,
        jitterPhase: (i * 1.37) % (Math.PI * 2),
        angle: i * GOLDEN,
      })),
    []
  );

  // Real per-stage particle count: literal at the tail (≤120), perceptually scaled above so the
  // vast head is legible AND the 4 deep survivors are distinctly four points.
  const pcount = useMemo(() => {
    const universe = stages[0]?.count || 1;
    return stages.map((s) =>
      s.count <= 120 ? s.count : Math.round(BUDGET * Math.pow(s.count / universe, 0.42))
    );
  }, [stages]);

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

    const aliveCountAt = (sf: number) => {
      const k0 = Math.floor(sf);
      const k1 = Math.min(k0 + 1, N - 1);
      return lerp(pcount[k0], pcount[k1], sf - k0);
    };

    const draw = (t: number) => {
      const sf = stageFRef.current;
      const alive = aliveCountAt(sf);
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(h, w * 0.5) * 0.46;
      const clusterR = baseR * Math.sqrt(alive / BUDGET);
      const nearEnd = Math.max(0, (sf - 6) / (N - 1 - 6)); // 0 before fees, →1 at the tail

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      for (const p of particles) {
        const rNorm = Math.sqrt(p.i / Math.max(1, alive));
        let x: number;
        let y: number;
        let color: [number, number, number];
        let a: number;
        let rad: number;

        if (p.i < alive) {
          // Alive: packed into the shrinking core, with a gentle shimmer.
          const jit = reduced ? 0 : Math.sin(t / 900 + p.jitterPhase) * 1.4;
          x = cx + Math.cos(p.angle) * rNorm * clusterR * 1.7 + jit;
          y = cy + Math.sin(p.angle) * rNorm * clusterR + jit * 0.6;
          if (p.i < 4) {
            color = GOLD; // the deep four
            rad = 2.6;
            a = 0.95;
          } else {
            color = mix(p.side ? KALSHI : POLY, AMBER, Math.min(1, nearEnd));
            rad = 1.5;
            a = 0.5 + 0.4 * (1 - rNorm);
          }
        } else {
          // Rejected: pushed outward as a fading red fragment.
          const past = (p.i - alive) / 55;
          if (past > 1) continue;
          const outR = clusterR + past * Math.hypot(w, h) * 0.6;
          x = cx + Math.cos(p.angle) * outR * 1.7;
          y = cy + Math.sin(p.angle) * outR;
          color = RED;
          rad = 1.4;
          a = (1 - past) * 0.7;
        }
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = rgba(color, 1);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // The 0-executable punch: once fully collapsed, a fading ring where the core was.
      if (sf > N - 1.05) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = rgba(RED, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * 0.12 * (1 + (sf - (N - 1)) * 8), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      if (playingRef.current && !reduced) {
        const p = Math.min(1, (t - startRef.current) / 7000);
        stageFRef.current = easeInOut(p) * (N - 1);
        if (p >= 1) playingRef.current = false;
      }
      draw(t);
      const idx = Math.round(stageFRef.current);
      setStageIdx((prev) => (prev === idx ? prev : idx));
      raf = requestAnimationFrame(loop);
    };

    let raf = 0;
    startRef.current = performance.now();
    if (reduced) {
      stageFRef.current = 0;
      playingRef.current = false;
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [particles, pcount, N, reduced]);

  const jump = (idx: number) => {
    playingRef.current = false;
    stageFRef.current = idx;
    setStageIdx(idx);
  };
  const replay = () => {
    startRef.current = performance.now();
    stageFRef.current = 0;
    setStageIdx(0);
    playingRef.current = true;
  };

  const cur = stages[stageIdx] ?? stages[0];
  const survived = cur ? ((cur.count / (stages[0]?.count || 1)) * 100) : 0;

  return (
    <div className="relative rounded-lg border border-[#1E293B] bg-[#060912] overflow-hidden" style={{ height: 440 }}>
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* HUD — big current count + label + note */}
      <div className="absolute top-4 left-5 max-w-[300px] pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#475569]">Stage {stageIdx + 1} / {N}</div>
        <div className="text-[40px] font-semibold text-[#F8FAFC] tabular-nums leading-none mt-1 [text-shadow:0_0_24px_rgba(96,165,250,0.35)]">
          {cur?.count.toLocaleString()}
        </div>
        <div className="text-[12px] text-[#CBD5E1] mt-1 font-medium">{cur?.label}</div>
        <div className="text-[10px] text-[#64748B] mt-1 leading-relaxed">{cur?.note}</div>
        {stageIdx > 0 && (
          <div className="text-[9px] text-[#475569] mt-1.5 font-mono">{survived < 0.05 ? '<0.1' : survived.toFixed(survived < 1 ? 2 : 1)}% of the universe survives here</div>
        )}
      </div>

      <button
        onClick={replay}
        className="absolute top-4 right-4 text-[10px] text-[#64748B] hover:text-[#06B6D4] border border-[#1E293B] rounded px-2 py-1 bg-[#0B0F1D]/70 transition-colors"
      >
        ↻ Replay
      </button>

      {/* Stage ledger — always the full funnel; click to scrub. */}
      <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-[#060912] via-[#060912]/90 to-transparent">
        <div className="flex items-end gap-0.5">
          {stages.map((s, i) => {
            const activeStage = i === stageIdx;
            return (
              <button
                key={i}
                onClick={() => jump(i)}
                title={`${s.label} — ${s.count.toLocaleString()}`}
                className="group flex-1 flex flex-col items-center gap-1"
              >
                <span className={`text-[9px] font-mono tabular-nums transition-colors ${activeStage ? 'text-[#F8FAFC]' : 'text-[#475569] group-hover:text-[#94A3B8]'}`}>
                  {s.count >= 1000 ? `${Math.round(s.count / 1000)}k` : s.count}
                </span>
                <span
                  className={`w-full h-1 rounded-full transition-colors ${
                    activeStage ? 'bg-[#06B6D4]' : i < stageIdx ? 'bg-[#334155]' : 'bg-[#1E293B] group-hover:bg-[#334155]'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
