import { useMemo } from 'react';
import type { EfficiencyStudy } from '../../../api/client.js';

/**
 * The honest data model for the 3D consensus field. On the GPU we afford 1 point = 1 market, so the
 * universe is literally to scale: Polymarket ≈ 26,930 points, Kalshi ≈ 65,360 — Kalshi's galaxy is
 * genuinely 2.43× larger. Polymarket is a RING galaxy (bright core + orbiting ring), Kalshi a 4-arm
 * SPIRAL — distinguishable by shape, not just color. Shape is arrangement, not a data claim —
 * counts, sizes and the 215 gaps / 3,791 links / 0 confirmed stay exact.
 */

const rnd = (s: number) => {
  const v = Math.sin(s * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

// Galaxy centers in world space (positions inside each cloud are relative to its center).
export const POLY_CENTER: [number, number, number] = [-3.9, 0, 0];
export const KALSHI_CENTER: [number, number, number] = [4.5, 0, 0];
const POLY_R = 1.85;

// Distinct morphology per venue: Polymarket a ring galaxy, Kalshi a 4-arm spiral.
const KALSHI_BRANCHES = 4;
const KALSHI_SPIN = 1.0;
const RANDOMNESS = 0.32; // arm scatter as a fraction of radius
const RAND_POWER = 2.6; // concentration of scatter toward the arm line
const BULGE_FRAC = 0.2; // share of points forming the dense central bulge
const RING_RADIUS = 0.78; // where Polymarket's ring sits, as a fraction of R
const RING_WIDTH = 0.16; // radial thickness of the ring

// Bridge is drawn as a legible SAMPLE of the real same-contract pairs (the full count is in the readout).
const BRIDGE_DRAW = 150;

export interface FieldModel {
  polyPos: Float32Array;
  kalshiPos: Float32Array;
  gapPos: Float32Array;
  bridgeA: Float32Array; // Polymarket-side thread endpoints (world space)
  bridgeB: Float32Array; // Kalshi-side thread endpoints (world space)
  bridgePhase: Float32Array; // per-thread phase so flows aren't synchronized
  bridgeN: number; // number of sampled threads
  polyR: number;
  kalshiR: number;
  counts: { poly: number; kalshi: number; gap: number; bridge: number; total: number; sameContract: number; confirmed: number };
}

type GalaxyKind = 'spiral' | 'ring';

/** A galaxy point — a dense spherical bulge core, plus either spiral arms or an orbiting ring. */
function galaxyPoint(seed: number, R: number, kind: GalaxyKind, arms: number, spin: number, out: Float32Array, j: number) {
  // Bright central bulge, shared by both morphologies.
  if (rnd(seed * 5.1) < BULGE_FRAC) {
    const a = rnd(seed * 1.7) * Math.PI * 2;
    const el = (rnd(seed * 3.3) - 0.5) * Math.PI;
    const rr = Math.pow(rnd(seed * 7.9), 2.6) * R * (kind === 'ring' ? 0.26 : 0.4);
    const ce = Math.cos(el);
    out[j] = Math.cos(a) * ce * rr;
    out[j + 1] = Math.sin(el) * rr * 0.8;
    out[j + 2] = Math.sin(a) * ce * rr;
    return;
  }
  if (kind === 'ring') {
    // A thin luminous ring orbiting the core (Hoag's-object style).
    const a = rnd(seed * 1.3) * Math.PI * 2;
    const spread = rnd(seed * 5.1 + 0.7) + rnd(seed * 2.7) - 1.0; // ~triangular, -1..1
    const rr = R * (RING_RADIUS + spread * RING_WIDTH);
    out[j] = Math.cos(a) * rr;
    out[j + 1] = (rnd(seed * 4.9) - 0.5) * R * 0.1; // thin vertically
    out[j + 2] = Math.sin(a) * rr;
    return;
  }
  // Spiral arms.
  const radius = Math.pow(rnd(seed * 5.1 + 0.7), 0.75) * R;
  const branch = (Math.floor(rnd(seed * 1.3) * arms) / arms) * Math.PI * 2;
  const ang = branch + radius * spin;
  const sx = rnd(seed * 2.1) < 0.5 ? 1 : -1;
  const sy = rnd(seed * 4.3) < 0.5 ? 1 : -1;
  const sz = rnd(seed * 6.7) < 0.5 ? 1 : -1;
  const rX = Math.pow(rnd(seed * 2.7), RAND_POWER) * sx * RANDOMNESS * radius;
  const rY = Math.pow(rnd(seed * 4.9), RAND_POWER) * sy * RANDOMNESS * radius * 0.35; // flattened disk
  const rZ = Math.pow(rnd(seed * 6.1), RAND_POWER) * sz * RANDOMNESS * radius;
  out[j] = Math.cos(ang) * radius + rX;
  out[j + 1] = rY;
  out[j + 2] = Math.sin(ang) * radius + rZ;
}

export function useFieldModel(study: EfficiencyStudy, apparentCount?: number): FieldModel {
  return useMemo(() => {
    const poly = Math.max(1, Math.round(study.universe.polymarket));
    const kalshi = Math.max(1, Math.round(study.universe.kalshi));
    const gap = Math.max(1, Math.round(apparentCount ?? study.funnel?.semanticSurvivors ?? 0));
    const sameContract = study.funnel?.sameContract ?? 0;
    const confirmed = study.funnel?.clearExecutableArb ?? 0;

    // Uniform density → volume ∝ count → radius ratio is the cube root of the count ratio.
    const kalshiR = POLY_R * Math.cbrt(kalshi / poly);

    const polyPos = new Float32Array(poly * 3);
    for (let i = 0; i < poly; i++) galaxyPoint(i + 1, POLY_R, 'ring', 0, 0, polyPos, i * 3);
    const kalshiPos = new Float32Array(kalshi * 3);
    for (let i = 0; i < kalshi; i++) galaxyPoint(i + 500000, kalshiR, 'spiral', KALSHI_BRANCHES, KALSHI_SPIN, kalshiPos, i * 3);

    // Gaps scattered across both galaxies, weighted by universe share, sitting in the visible body.
    const polyShare = poly / (poly + kalshi);
    const polyGaps = Math.round(gap * polyShare);
    const gapPos = new Float32Array(gap * 3);
    const tmp = new Float32Array(3);
    for (let i = 0; i < gap; i++) {
      const inPoly = i < polyGaps;
      const c = inPoly ? POLY_CENTER : KALSHI_CENTER;
      galaxyPoint(i * 13 + 3, (inPoly ? POLY_R : kalshiR) * (inPoly ? 1 : 0.72), inPoly ? 'ring' : 'spiral', KALSHI_BRANCHES, KALSHI_SPIN, tmp, 0);
      gapPos[i * 3] = tmp[0] + c[0];
      gapPos[i * 3 + 1] = tmp[1] + c[1];
      gapPos[i * 3 + 2] = tmp[2] + c[2];
    }

    // Bridge: a SAMPLE of verified-pair endpoints (Poly ring ↔ Kalshi spiral). The renderer turns
    // these into whichever connection style is selected; the full 3,791 count lives in the readout.
    const draw = Math.min(sameContract, BRIDGE_DRAW);
    const bridgeA = new Float32Array(draw * 3);
    const bridgeB = new Float32Array(draw * 3);
    const bridgePhase = new Float32Array(draw);
    // Snap every arc endpoint to a real rendered point so no thread ends in blank space.
    for (let i = 0; i < draw; i++) {
      const ai = ((i * 104729 + 11) % poly) * 3;
      bridgeA[i * 3] = polyPos[ai] + POLY_CENTER[0]; bridgeA[i * 3 + 1] = polyPos[ai + 1] + POLY_CENTER[1]; bridgeA[i * 3 + 2] = polyPos[ai + 2] + POLY_CENTER[2];
      const bi = ((i * 130363 + 13) % kalshi) * 3;
      bridgeB[i * 3] = kalshiPos[bi] + KALSHI_CENTER[0]; bridgeB[i * 3 + 1] = kalshiPos[bi + 1] + KALSHI_CENTER[1]; bridgeB[i * 3 + 2] = kalshiPos[bi + 2] + KALSHI_CENTER[2];
      bridgePhase[i] = rnd(i * 17.1);
    }

    return {
      polyPos,
      kalshiPos,
      gapPos,
      bridgeA,
      bridgeB,
      bridgePhase,
      bridgeN: draw,
      polyR: POLY_R,
      kalshiR,
      counts: { poly, kalshi, gap, bridge: draw, total: study.universe.total, sameContract, confirmed },
    };
  }, [study, apparentCount]);
}
