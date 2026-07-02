import type {
  EfficiencyStudy,
  EfficiencyPair,
  StrictSurvivors,
  StrictSurvivorPair,
  StrictSurvivorChecklist,
} from '../api/client.js';

/**
 * The verifier index — joins LIVE markets (by `marketId`) to the FROZEN efficiency study so each
 * scanner row can show an honest verifier state + its cross-platform counterpart. ~19% of the live
 * feed matches the frozen study; everything else is truthfully `live_only` (not in the study, not
 * verified). We NEVER imply a live row went through the full pipeline when it didn't.
 *
 * State precedence (most-informative terminal wins): deep_survivor > strict_match > spec_mismatch
 * > semantic_survivor > candidate > live_only.
 */
export type VerifierState =
  | 'live_only'
  | 'candidate'
  | 'semantic_survivor'
  | 'spec_mismatch'
  | 'strict_match'
  | 'deep_survivor';

export interface VerifierRecord {
  state: VerifierState;
  counterpartPlatform: 'polymarket' | 'kalshi';
  counterpartId?: string;
  counterpartQuestion?: string;
  gap: number; // absolute YES gap, 0..1
  polyYes?: number;
  kalshiYes?: number;
  similarity?: number;
  feeClearing: boolean; // gap clears the round-trip fee floor
  checklist?: StrictSurvivorChecklist; // present only for liquid (>$500) survivors
  specMismatchReason?: string;
}

export const STATE_META: Record<
  VerifierState,
  { label: string; short: string; tone: 'slate' | 'cyan' | 'amber' | 'red' | 'green'; blurb: string }
> = {
  live_only: { label: 'Live only', short: 'LIVE', tone: 'slate', blurb: 'Not in the frozen study — unverified.' },
  candidate: { label: 'Candidate match', short: 'MATCH', tone: 'cyan', blurb: 'Same event found; prices agree within fees.' },
  semantic_survivor: { label: 'Semantic survivor', short: 'SEMA', tone: 'amber', blurb: 'Apparent gap clears fees — but thin (<$500/side).' },
  spec_mismatch: { label: 'Spec mismatch', short: 'MISMATCH', tone: 'red', blurb: 'Looks like a gap; a different contract on inspection.' },
  strict_match: { label: 'Strict spec-match', short: 'STRICT', tone: 'green', blurb: 'Same contract on all 7 checks — still not proven executable.' },
  deep_survivor: { label: 'Deep survivor', short: 'DEEP', tone: 'green', blurb: '>$10k & passes every check; residual traces to wording / timing.' },
};

/** Tailwind class fragments per tone, so callers stay declarative. */
export const TONE_CLASS: Record<string, string> = {
  slate: 'bg-[#1E293B] text-[#94A3B8]',
  cyan: 'bg-[#06B6D4]/15 text-[#22D3EE]',
  amber: 'bg-[#78350F]/40 text-[#FBBF24]',
  red: 'bg-[#7F1D1D]/50 text-[#FCA5A5]',
  green: 'bg-[#064E3B]/50 text-[#6EE7B7]',
};

function deriveState(pair: EfficiencyPair, strict?: StrictSurvivorPair): VerifierState {
  if (strict) {
    if (strict.strict_survivor && strict.liquidity_tier === '>10k') return 'deep_survivor';
    if (strict.strict_survivor) return 'strict_match';
    return 'spec_mismatch'; // liquid, but failed the 7-point check
  }
  const t = pair.triage_label;
  if (t === 'semantic_survivor') return 'semantic_survivor';
  if (t === 'scope_mismatch' || t === 'entity_mismatch_rejected') return 'spec_mismatch';
  return 'candidate';
}

export function buildVerifierIndex(study: EfficiencyStudy, strict?: StrictSurvivors): Map<string, VerifierRecord> {
  const feeFloor = study.fees?.roundTrip ?? 0.09;
  const strictByPoly = new Map<string, StrictSurvivorPair>();
  const strictByKal = new Map<string, StrictSurvivorPair>();
  for (const sp of strict?.pairs ?? []) {
    if (sp.polymarketId) strictByPoly.set(sp.polymarketId, sp);
    if (sp.kalshiId) strictByKal.set(sp.kalshiId, sp);
  }

  const idx = new Map<string, VerifierRecord>();
  for (const p of study.pairs ?? []) {
    const sp =
      (p.polymarketId && strictByPoly.get(p.polymarketId)) ||
      (p.kalshiId && strictByKal.get(p.kalshiId)) ||
      undefined;
    const state = deriveState(p, sp || undefined);
    const common = {
      state,
      gap: p.gap,
      polyYes: p.polymarketYes,
      kalshiYes: p.kalshiYes,
      similarity: p.similarity,
      feeClearing: p.gap > feeFloor,
      checklist: sp?.checklist,
      specMismatchReason: sp?.spec_mismatch_reason || undefined,
    };
    if (p.polymarketId) {
      idx.set(p.polymarketId, { ...common, counterpartPlatform: 'kalshi', counterpartId: p.kalshiId, counterpartQuestion: p.kalshiQuestion });
    }
    if (p.kalshiId) {
      idx.set(p.kalshiId, { ...common, counterpartPlatform: 'polymarket', counterpartId: p.polymarketId, counterpartQuestion: p.question });
    }
  }
  return idx;
}
