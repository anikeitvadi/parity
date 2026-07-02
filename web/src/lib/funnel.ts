import type { EfficiencyStudy } from '../api/client.js';

/**
 * The locked 11-stage compression funnel (efficiency-study.json `funnel`), shared by the
 * Lab's waterfall, matrix, and pretext hero so the editorial labels live in exactly one place.
 * Values are read straight from the frozen artifact; `cut`/`cutReason` name the gate each stage
 * applies — this is the "verifier catching its own false positives" story made legible.
 *
 * Honesty note: every label is descriptive of a gate, never an arbitrage claim. The terminal is
 * "clear executable arb = 0" — executability is unproven (no depth/slippage/timing), so this is
 * the absence of a *demonstrable* edge, not a proof one can't exist.
 */
export interface FunnelStage {
  key: string;
  label: string;
  sub: string; // the unit + gate this stage represents
  value: number;
  cut?: number; // count removed entering this stage (same-unit transitions only)
  cutReason?: string; // why they were removed; absent ⇒ no cut annotation (e.g. unit boundary)
  terminal?: boolean; // the 0 row
}

export function funnelStages(study: EfficiencyStudy): FunnelStage[] {
  const f = study.funnel;
  if (!f) return [];
  // cutReason is omitted on "Candidate pairs" because tradeable→candidate crosses units
  // (markets → pairs), so the numeric delta there is not a meaningful cull.
  const raw: FunnelStage[] = [
    { key: 'tradeable', label: 'Tradeable markets', sub: 'live price · both platforms', value: f.tradeable },
    { key: 'candidates', label: 'Candidate pairs', sub: 'cosine ≥ 0.68', value: f.candidates },
    { key: 'sameEvent', label: 'Same event', sub: 'LLM-verified same event', value: f.sameEvent, cutReason: 'different event' },
    { key: 'sameContract', label: 'Same contract', sub: 'same resolution criteria', value: f.sameContract, cutReason: 'topical only' },
    { key: 'priceable', label: 'Priceable', sub: 'non-degenerate price · both sides', value: f.priceable, cutReason: 'degenerate / stale price' },
    { key: 'feeClearing', label: 'Fee-clearing gap', sub: 'gap > 9pp round-trip', value: f.feeClearing, cutReason: 'prices agree (< fees)' },
    { key: 'semantic', label: 'Semantic survivors', sub: 'survive entity + scope triage', value: f.semanticSurvivors, cutReason: 'entity / scope mismatch' },
    { key: 'liquid', label: 'Liquid (> $500)', sub: 'thinner side > $500', value: f.liquidSurvivors, cutReason: 'thin (< $500 / side)' },
    { key: 'strict', label: 'Strict spec-match', sub: '7-point contract checklist', value: f.strictSpecSurvivors, cutReason: 'contract-spec mismatch' },
    { key: 'deep', label: 'Deep (> $10k)', sub: 'thinner side > $10k', value: f.deepStrictSurvivors, cutReason: 'below $10k depth' },
    { key: 'arb', label: 'Clear executable arb', sub: 'after manual review', value: f.clearExecutableArb, cutReason: 'resolution nuance / timing', terminal: true },
  ];
  return raw.map((s, i) => ({
    ...s,
    cut: i > 0 && s.cutReason ? Math.max(0, raw[i - 1].value - s.value) : undefined,
  }));
}
