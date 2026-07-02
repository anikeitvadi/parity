import type { EfficiencyStudy, StrictSurvivorPair } from '../api/client.js';

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

/** The bottom-of-funnel counts after applying the correction overlay — the survivor set minus the
 *  pairs the deterministic/strict re-checks reclassified. Computed from the real pair arrays (not
 *  aggregate subtraction), so every stage is exact and stays consistent across the app. */
export interface CorrectedCounts {
  semanticSurvivors: number;
  liquidSurvivors: number;
  strictSpecSurvivors: number;
  deepStrictSurvivors: number;
}

export function correctedFunnelCounts(
  study: EfficiencyStudy,
  strictPairs: StrictSurvivorPair[],
  correctionKeys: Set<string>,
  semanticFalsePositives = 0
): CorrectedCounts {
  const f = study.funnel;
  const corrected = (p: StrictSurvivorPair) => correctionKeys.has(`${p.polymarketId}::${p.kalshiId}`);
  return {
    // Apparent gaps minus the scope/entity false positives (e.g. a county race vs the statewide race).
    // NOT minus the 7-point strict-check failures — those are the funnel's own liquid→strict cull.
    semanticSurvivors: Math.max(0, (f?.semanticSurvivors ?? 0) - semanticFalsePositives),
    // Liquid loses only the corrected pairs the 7-point check WRONGLY passed (strict_survivor still
    // true); the genuine spec-mismatch pairs stay — they ARE the strict cull, not extra removals.
    liquidSurvivors: strictPairs.filter((p) => !(corrected(p) && p.strict_survivor)).length,
    strictSpecSurvivors: strictPairs.filter((p) => p.strict_survivor && !corrected(p)).length,
    deepStrictSurvivors: strictPairs.filter((p) => p.strict_survivor && p.liquidity_tier === '>10k' && !corrected(p)).length,
  };
}

export function funnelStages(study: EfficiencyStudy, corrected?: CorrectedCounts): FunnelStage[] {
  const f = study.funnel;
  if (!f) return [];
  const c = corrected;
  // cutReason is omitted on "Candidate pairs" because tradeable→candidate crosses units
  // (markets → pairs), so the numeric delta there is not a meaningful cull.
  const raw: FunnelStage[] = [
    { key: 'tradeable', label: 'Tradeable markets', sub: 'live price · both platforms', value: f.tradeable },
    { key: 'candidates', label: 'Candidate pairs', sub: 'cosine ≥ 0.68', value: f.candidates },
    { key: 'sameEvent', label: 'Same event', sub: 'LLM-verified same event', value: f.sameEvent, cutReason: 'different event' },
    { key: 'sameContract', label: 'Same contract', sub: 'same resolution criteria', value: f.sameContract, cutReason: 'topical only' },
    { key: 'priceable', label: 'Priceable', sub: 'non-degenerate price · both sides', value: f.priceable, cutReason: 'degenerate / stale price' },
    { key: 'feeClearing', label: 'Fee-clearing gap', sub: 'gap > 9pp round-trip', value: f.feeClearing, cutReason: 'prices agree (< fees)' },
    { key: 'semantic', label: 'Semantic survivors', sub: 'survive entity + scope triage', value: c?.semanticSurvivors ?? f.semanticSurvivors, cutReason: 'entity / scope mismatch' },
    { key: 'liquid', label: 'Liquid (> $500)', sub: 'thinner side > $500', value: c?.liquidSurvivors ?? f.liquidSurvivors, cutReason: 'thin (< $500 / side)' },
    { key: 'strict', label: 'Strict spec-match', sub: '7-point contract checklist', value: c?.strictSpecSurvivors ?? f.strictSpecSurvivors, cutReason: 'contract-spec mismatch' },
    { key: 'deep', label: 'Deep (> $10k)', sub: 'thinner side > $10k', value: c?.deepStrictSurvivors ?? f.deepStrictSurvivors, cutReason: 'below $10k depth' },
    { key: 'arb', label: 'Clear executable arb', sub: 'after manual review', value: f.clearExecutableArb, cutReason: 'resolution nuance / timing', terminal: true },
  ];
  return raw.map((s, i) => ({
    ...s,
    cut: i > 0 && s.cutReason ? Math.max(0, raw[i - 1].value - s.value) : undefined,
  }));
}
