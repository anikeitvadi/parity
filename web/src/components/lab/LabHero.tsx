import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './LabHero.css';

/**
 * The Efficiency Lab signature hero (DESIGN §10) — the "concept space". The market universe is
 * dim typographic noise (real study question text); the fee-clearing apparent gaps rise out of it
 * as rows showing both platform YES prices and a gap bar that CROSSES the 9pp fee line — the
 * "easy to find" hook — before the funnel resolves to 0 executable. DOM + thin overlay (no WebGL);
 * binds to real data; fully readable; one-shot motion with a reduced-motion end-state + replay.
 */

const GAP_W = 300; // max gap-lane width (px)
const LANE_PP = 24; // pp value that fills the full lane — keeps fee/detector lines proportional at any width
const FEE_PP = 9;
const DET_PP = 19;
const STAGE_H = 452;
const ROW_H = 34;
const START_Y = 60;

export interface HeroRow {
  polyYes: number; // 0..1
  kalshiYes: number; // 0..1
  gapPp: number;
  question: string;
}
export interface HeroStep {
  n: number;
  label: string;
  sub: string;
  kind: 'total' | 'pairs' | 'zero';
}

// Deterministic jitter so the universe field is stable across renders.
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

interface Frag {
  text: string;
  left: number;
  top: number;
  o: number;
  delay: number;
}

// A jittered grid of dim question fragments; the center band is thinned so the foreground rows read.
function buildUniverse(width: number, pool: string[]): Frag[] {
  if (width <= 0 || pool.length === 0) return [];
  const cellW = 118;
  const cellH = 17;
  const padX = 8;
  const padY = 10;
  const cols = Math.max(1, Math.floor((width - padX * 2) / cellW));
  const rows = Math.floor((STAGE_H - padY * 2) / cellH);
  const frags: Frag[] = [];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cxFrac = (c + 0.5) / cols;
      const center = cxFrac > 0.28 && cxFrac < 0.74;
      if (center && r % 2 === 0) continue;
      if (center && rnd(r * 31 + c) < 0.4) continue;
      const text = pool[(r * cols + c * 3 + k) % pool.length];
      const words = text.split(/\s+/).slice(0, 4 + Math.floor(rnd(k) * 3)).join(' ');
      frags.push({
        text: words,
        left: padX + c * cellW + rnd(k * 7) * 16,
        top: padY + r * cellH + rnd(k * 13) * 4,
        o: 0.3 + rnd(k * 3) * 0.5,
        delay: Math.floor(rnd(k * 5) * 700),
      });
      k++;
    }
  }
  return frags;
}

export function LabHero({ steps, rows, universe }: { steps: HeroStep[]; rows: HeroRow[]; universe: string[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [phase, setPhase] = useState(0); // 0 idle · 1 universe · 2 matches · 3 bars · 4 done
  const [counts, setCounts] = useState<number[]>(() => steps.map(() => 0));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafs = useRef<number[]>([]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.floor(e[0]?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frags = useMemo(() => buildUniverse(width, universe), [width, universe]);
  // Responsive gap lane: full 300px on wide layouts, shrinks on narrow ones so the question text
  // and Kalshi chip keep room. ppScale keeps the fee/detector lines proportional within the lane.
  const laneW = Math.max(150, Math.min(GAP_W, width * 0.42));
  const ppScale = laneW / LANE_PP;
  const laneLeft = Math.max(150, width - laneW);

  const countUp = useCallback((i: number, target: number, dur: number) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setCounts((c) => {
        const n = [...c];
        n[i] = Math.round(target * e);
        return n;
      });
      if (t < 1) rafs.current.push(requestAnimationFrame(step));
    };
    rafs.current.push(requestAnimationFrame(step));
  }, []);

  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    rafs.current.forEach(cancelAnimationFrame);
    timers.current = [];
    rafs.current = [];
    setPhase(0);
    setCounts(steps.map(() => 0));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setPhase(4);
      setCounts(steps.map((s) => s.n));
      return;
    }
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    at(120, () => {
      setPhase(1);
      if (steps[0]) countUp(0, steps[0].n, 1100);
    });
    at(1500, () => {
      setPhase(2);
      if (steps[1]) countUp(1, steps[1].n, 800);
    });
    at(2100, () => setPhase(3));
    at(3050, () => {
      setPhase(4);
      if (steps[2]) countUp(2, steps[2].n, 300);
    });
  }, [steps, countUp]);

  useEffect(() => {
    play();
    return () => {
      timers.current.forEach(clearTimeout);
      rafs.current.forEach(cancelAnimationFrame);
    };
  }, [play]);

  const stageCls = `stage ${phase >= 1 ? 'on' : ''} ${phase >= 2 ? 'narrow' : ''} ${phase >= 3 ? 'bars' : ''}`;

  return (
    <div className="lab-hero">
      <div className="funnel">
        {steps.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <div className="arrow">→</div>}
            <div className={`step ${s.kind}`}>
              <div className="n">{counts[i]?.toLocaleString() ?? '0'}</div>
              <div className="lbl">{s.label}</div>
              <div className="sub">{s.sub}</div>
            </div>
          </Fragment>
        ))}
      </div>

      <div ref={stageRef} className={stageCls} style={{ height: STAGE_H }}>
        <div className="spotlight" />

        <div className={`universe ${phase >= 1 ? 'on' : ''}`}>
          {frags.map((f, i) => (
            <div
              key={i}
              className="frag"
              style={{ left: f.left, top: f.top, transitionDelay: `${f.delay}ms`, '--o': f.o } as CSSProperties}
            >
              {f.text}
            </div>
          ))}
        </div>

        {width > 0 && (
          <div className="thresholds">
            <div className="tline fee" style={{ left: laneLeft + FEE_PP * ppScale }}>
              <span className="cap">{FEE_PP}pp fees</span>
            </div>
            <div className="tline det" style={{ left: laneLeft + DET_PP * ppScale }}>
              <span className="cap">{DET_PP}pp detector</span>
            </div>
          </div>
        )}

        <div className={`matches ${phase >= 2 ? 'on' : ''} ${phase >= 3 ? 'bars' : ''}`}>
          {rows.map((r, i) => {
            const w = Math.min(laneW, r.gapPp * ppScale);
            return (
              <div key={i} className="match" style={{ top: START_Y + i * ROW_H, transitionDelay: `${200 + i * 60}ms` }}>
                <div className="chip poly">{Math.round(r.polyYes * 100)}%</div>
                <div className="q">{r.question}</div>
                <div className="chip kal">{Math.round(r.kalshiYes * 100)}%</div>
                <div className="gap" style={{ width: laneW }}>
                  <div className={`bar ${r.gapPp > FEE_PP ? 'over' : ''}`} style={{ width: phase >= 3 ? w : 0 }} />
                  <span className="barval" style={{ left: Math.min(laneW - 34, w + 6) }}>{r.gapPp.toFixed(1)}pp</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hero-foot">
        <div className="punch">
          <b>{(steps[1]?.n ?? 0).toLocaleString()}</b> apparent gaps clear the fee floor — after liquidity,
          contract-spec &amp; manual review, <b>{steps[2]?.n ?? 0}</b> are executable.
        </div>
        <button className="replay" onClick={play}>↻ Replay</button>
      </div>
    </div>
  );
}
