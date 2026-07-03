import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { EfficiencyStudy } from '../../../api/client.js';
import { useFieldModel, POLY_CENTER, KALSHI_CENTER, type FieldModel } from './useFieldModel.js';

/**
 * The signature Lab visual in true 3D (react-three-fiber + bloom). Honest data model: 1 point = 1
 * market (Kalshi 2.43× Polymarket), ~215 gap beacons = 0.23%, ~3,791 same-contract links, 0 confirmed.
 * Polymarket is a ring galaxy, Kalshi a 4-arm spiral; the verified links render as gently-bowed cyan
 * arcs graded blue→green with a flow pulse. Counts/proportions stay exact; layout is aesthetic.
 */

const POLY_COLOR = '#5AA2FF';
const KALSHI_COLOR = '#22C55E';
const THREAD_COLOR = '#22D3EE';
const GAP_COLOR = '#FF8A1E'; // apparent gaps; red stays reserved for confirmed arb (= 0)
const POLY_RGB: [number, number, number] = [90 / 255, 162 / 255, 1.0];
const KALSHI_RGB: [number, number, number] = [34 / 255, 197 / 255, 94 / 255];

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rnd = (s: number) => {
  const v = Math.sin(s * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

// ---- Soft round point sprite (galaxies + gap beacons) --------------------------------------------
const POINT_VERT = /* glsl */ `
  uniform float uSize; uniform float uTime; uniform float uTwinkle;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ph = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
    float tw = (1.0 - uTwinkle) + uTwinkle * 0.5 * (1.0 + sin(uTime * 1.6 + ph));
    vTw = tw;
    gl_PointSize = clamp(uSize * tw * (300.0 / -mv.z), 0.5, 26.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINT_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * uOpacity * vTw);
  }
`;

// ---- Flowing lines (the same-contract bridge) ----------------------------------------------------
const LINE_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aT; attribute float aPhase; attribute vec3 aColor;
  varying vec3 vColor; varying float vGlow;
  void main() {
    vColor = aColor;
    float p = fract(aT * 1.5 - uTime * 0.11 + aPhase);
    vGlow = smoothstep(0.86, 1.0, p);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const LINE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor; varying float vGlow;
  void main() {
    vec3 c = vColor + vec3(0.55, 0.85, 1.0) * vGlow * 1.5;
    gl_FragColor = vec4(c, uOpacity + vGlow * 0.5);
  }
`;

function PointCloud({ positions, center, color, size, opacity, twinkle = 0.35 }: {
  positions: Float32Array; center?: [number, number, number]; color: string; size: number; opacity: number; twinkle?: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uOpacity: { value: opacity }, uTwinkle: { value: twinkle }, uTime: { value: 0 },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((state) => { if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime; });
  return (
    <points position={center}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={POINT_VERT} fragmentShader={POINT_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Gap beacons: the real ~215 apparent gaps, throbbing amber. Two 12s triage breaths, then the field settles at the end state — 0 confirmed. */
function Gaps({ positions, onPhase }: { positions: Float32Array; onPhase: (p: 'scanning' | 'resolved') => void }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const phaseRef = useRef<'scanning' | 'resolved'>('scanning');
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(GAP_COLOR) }, uSize: { value: 0.36 }, uOpacity: { value: 1 }, uTwinkle: { value: 0.75 }, uTime: { value: 0 },
  }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const settled = REDUCED_MOTION || t >= 24;
    const c = (t % 12) / 12;
    let vis: number;
    if (settled) vis = 0;
    else if (c < 0.08) vis = 0;
    else if (c < 0.2) vis = (c - 0.08) / 0.12;
    else if (c < 0.8) vis = 1;
    else if (c < 0.95) vis = 1 - (c - 0.8) / 0.15;
    else vis = 0;
    if (matRef.current) { matRef.current.uniforms.uTime.value = t; matRef.current.uniforms.uOpacity.value = vis; }
    const want = settled || c < 0.08 || c >= 0.95 ? 'resolved' : 'scanning';
    if (phaseRef.current !== want) { phaseRef.current = want; onPhase(want); }
  });
  return (
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={POINT_VERT} fragmentShader={POINT_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

const grad = (t: number, i: 0 | 1 | 2) => POLY_RGB[i] + (KALSHI_RGB[i] - POLY_RGB[i]) * t;

/** Bowed bezier threads → line segments, graded blue→green, with per-vertex flow data. */
function buildArcGeo(model: FieldModel, count: number) {
  const N = Math.min(count, model.bridgeN);
  const SEG = 14;
  const positions = new Float32Array(N * SEG * 2 * 3);
  const colors = new Float32Array(N * SEG * 2 * 3);
  const ts = new Float32Array(N * SEG * 2);
  const phases = new Float32Array(N * SEG * 2);
  let w = 0;
  for (let i = 0; i < N; i++) {
    const ax = model.bridgeA[i * 3], ay = model.bridgeA[i * 3 + 1], az = model.bridgeA[i * 3 + 2];
    const bx = model.bridgeB[i * 3], by = model.bridgeB[i * 3 + 1], bz = model.bridgeB[i * 3 + 2];
    // Splay the bow in a random direction per thread so they read as an airy web, not a parallel cord.
    const mag = 1.0 + rnd(i * 6.3) * 2.4;
    const cx = (ax + bx) / 2 + (rnd(i * 9.1) - 0.5) * mag * 1.3;
    const cy = (ay + by) / 2 + (rnd(i * 11.7) - 0.5) * mag * 1.7;
    const cz = (az + bz) / 2 + (rnd(i * 13.3) - 0.5) * mag * 1.7;
    const phase = model.bridgePhase[i];
    let px = 0, py = 0, pz = 0, pt = 0;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG, m = 1 - t;
      const x = m * m * ax + 2 * m * t * cx + t * t * bx;
      const y = m * m * ay + 2 * m * t * cy + t * t * by;
      const z = m * m * az + 2 * m * t * cz + t * t * bz;
      if (k > 0) {
        const v = w / 3;
        positions[w] = px; positions[w + 1] = py; positions[w + 2] = pz;
        colors[w] = grad(pt, 0); colors[w + 1] = grad(pt, 1); colors[w + 2] = grad(pt, 2);
        ts[v] = pt; phases[v] = phase;
        positions[w + 3] = x; positions[w + 4] = y; positions[w + 5] = z;
        colors[w + 3] = grad(t, 0); colors[w + 4] = grad(t, 1); colors[w + 5] = grad(t, 2);
        ts[v + 1] = t; phases[v + 1] = phase;
        w += 6;
      }
      px = x; py = y; pz = z; pt = t;
    }
  }
  return { positions, colors, ts, phases };
}

function Bridge({ model }: { model: FieldModel }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => buildArcGeo(model, 30), [model]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 0.22 } }), []);
  useFrame((s) => { if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime; });
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geo.positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[geo.colors, 3]} />
        <bufferAttribute attach="attributes-aT" args={[geo.ts, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[geo.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={LINE_VERT} fragmentShader={LINE_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

function Scene({ model, onPhase }: { model: FieldModel; onPhase: (p: 'scanning' | 'resolved') => void }) {
  return (
    <>
      <color attach="background" args={['#04060e']} />
      <Stars radius={60} depth={40} count={1400} factor={3} saturation={0} fade speed={0.4} />
      <PointCloud positions={model.polyPos} center={POLY_CENTER} color={POLY_COLOR} size={0.08} opacity={0.95} twinkle={0.4} />
      <PointCloud positions={model.kalshiPos} center={KALSHI_CENTER} color={KALSHI_COLOR} size={0.08} opacity={0.95} twinkle={0.4} />
      <Bridge model={model} />
      <Gaps positions={model.gapPos} onPhase={onPhase} />
      <OrbitControls autoRotate={!REDUCED_MOTION} autoRotateSpeed={0.35} enablePan={false} enableZoom={false} minDistance={6} maxDistance={13} target={[0.15, 0, 0]} />
      <EffectComposer>
        <Bloom intensity={1.3} luminanceThreshold={0.2} luminanceSmoothing={0.6} mipmapBlur />
      </EffectComposer>
    </>
  );
}

export function ConsensusField3D({ study, apparentCount }: { study: EfficiencyStudy; apparentCount?: number }) {
  const model = useFieldModel(study, apparentCount);
  const [phase, setPhase] = useState<'scanning' | 'resolved'>('scanning');
  const [glLost, setGlLost] = useState(false);
  const [inView, setInView] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const f = study.funnel;
  const num = (n?: number) => (n ?? 0).toLocaleString();
  const total = study.universe.total;
  const apparent = apparentCount ?? f?.semanticSurvivors ?? 0;
  const sameEvent = f?.sameEvent ?? 0;
  const pctPairs = sameEvent ? ((apparent / sameEvent) * 100).toFixed(1) : '0';
  const polyLabel = (study.universe.polymarketIsLowerBound ? '≥' : '') + num(study.universe.polymarket);

  return (
    <div ref={frameRef} className="relative border-y border-[#1E293B] bg-[#04060e] overflow-hidden" style={{ height: '62vh' }}>
      {!glLost && (
        <Canvas
          camera={{ position: [0.5, 3.6, 7.0], fov: 52 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          frameloop={inView ? 'always' : 'never'}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setGlLost(true); }, false);
          }}
        >
          <Scene model={model} onPhase={setPhase} />
        </Canvas>
      )}
      {glLost && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#475569] font-mono">
          3D view unavailable — the numbers on the left are the finding.
        </div>
      )}

      {/* Readout — the thesis is legible without motion. */}
      <div className="absolute top-4 left-5 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#475569]">Consensus Field</div>
        <div className="text-[13px] text-[#F8FAFC] font-medium mt-1 max-w-[300px] leading-snug">
          1 point = 1 market — the {num(total)}-market universe, to scale.
        </div>
        <div className="text-[11px] text-[#94A3B8] mt-1 max-w-[300px] leading-snug">
          {num(apparent)} apparent gaps · {pctPairs}% of {num(sameEvent)} same-event pairs · <span className="text-[#FCA5A5]">{num(f?.clearExecutableArb ?? 0)} executable after audit</span>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <Row color={POLY_COLOR} label="Polymarket universe" value={polyLabel} />
          <Row color={KALSHI_COLOR} label="Kalshi universe" value={num(study.universe.kalshi)} />
          <Row color="#64748B" label="Standalone total" value={num(total)} />
          <Row color={THREAD_COLOR} label="Same-contract candidates (cached)" value={num(f?.sameContract)} />
          <Row color={GAP_COLOR} label="Apparent gaps (to scale)" value={num(apparent)} />
          <Row color="#EF4444" label="Confirmed executable arb" value={String(f?.clearExecutableArb ?? 0)} bright />
        </div>
      </div>

      {/* Triage state */}
      <div className="absolute top-4 right-4">
        <span className={`text-[10px] font-mono px-2 py-1 rounded border ${phase === 'resolved' ? 'bg-[#7F1D1D]/30 text-[#FCA5A5] border-[#991B1B]/40' : 'bg-[#0B0F1D]/70 text-[#94A3B8] border-[#1E293B]'}`}>
          {phase === 'resolved' ? 'post-triage · 0 confirmed' : 'verifying…'}
        </span>
      </div>

      <div className="absolute bottom-3 right-4 text-[10px] text-[#475569] pointer-events-none font-mono">
        drag to orbit
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
