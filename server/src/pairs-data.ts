import { existsSync, readFileSync } from 'node:fs';

/**
 * The live terminal's pair read-model, sourced from the FROZEN study artifacts — the same data the
 * Efficiency Lab presents, so Scanner and Lab never disagree. Crucially this is NOT the raw
 * verdict_cache: the study has already oriented every gap (YES/NO alignment), dropped degenerate
 * 0/100 prices, and triaged each pair into a funnel stage. Reading `triage_label` here is what keeps
 * the terminal honest — a raw join reintroduces the orientation/near-settled artifacts the study
 * exists to remove. The route layers LIVE prices on top; the verdict stays "as of {verifiedAt}".
 */

const STUDY_PATH = 'docs/data/efficiency-study.json';
const STRICT_PATH = 'docs/data/strict-survivors.json';
const CORRECTIONS_PATH = 'docs/data/corrections.json';

interface RawCorrection {
  polymarketId?: string;
  kalshiId?: string;
  corrected_verdict?: string;
  correction_reason?: string;
  correction_source?: string;
}

export interface VerifiedPair {
  polymarketId: string;
  kalshiId: string;
  polymarketTitle: string;
  kalshiTitle: string;
  polymarketYes: number;
  kalshiYes: number; // ORIENTED in the artifact (kalshi-YES already flipped when yesAligned=false)
  yesAligned: boolean;
  gap: number; // oriented |poly − kalshi|
  feeFloor: number;
  cosine: number;
  polyVolume: number;
  kalshiVolume: number;
  triageLabel: string; // validated_same_contract | semantic_survivor | scope_mismatch | entity_mismatch_rejected | dropped_degenerate | topical_overlap
  funnelStage: string;
  reason: string;
  category?: string;
  verifiedAt: string;
  // Strict-survivor enrichment (present for the 83 liquid semantic survivors only).
  checklist?: Record<string, boolean | string>;
  liquidityTier?: string;
  strictSurvivor?: boolean;
  // Correction overlay (docs/data/corrections.json) — a false-positive verdict the strict re-check
  // or a deterministic rule reclassified. triageLabel above already reflects the corrected verdict.
  corrected?: boolean;
  correctionReason?: string;
  correctionSource?: string;
}

interface RawPair {
  polymarketId?: string;
  kalshiId?: string;
  question?: string;
  kalshiQuestion?: string;
  polymarketYes?: number;
  kalshiYes?: number;
  yesAligned?: boolean;
  gap?: number;
  similarity?: number;
  volume?: number;
  polyVolume?: number;
  kalshiVolume?: number;
  category?: string;
  reason?: string;
  triage_label?: string;
  funnel_stage?: string;
}
interface StudyArtifact {
  generatedAt?: string;
  fees?: { roundTrip?: number };
  pairs?: RawPair[];
  verification?: {
    model?: string;
    promptVersion?: string;
    cachedVerdicts?: number;
    provenance?: { provider?: string; model?: string; n?: number }[];
  };
}

/** Compact verifier provenance surfaced in the terminal footer — which model/prompt produced the
 *  cached verdicts, and how many verdicts back the corpus. */
export interface PairsVerification {
  model: string;
  promptVersion: string;
  verdictCount: number;
}
interface RawStrict {
  polymarketId?: string;
  kalshiId?: string;
  checklist?: Record<string, boolean | string>;
  liquidity_tier?: string;
  strict_survivor?: boolean;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Load the triaged, oriented pairs from the study artifact, enriched with the strict-survivor
 * checklist. Returns null when no study artifact exists (the terminal then shows its honest
 * "no verified run yet" state).
 */
export function loadVerifiedPairs(): {
  pairs: VerifiedPair[];
  verifiedAt: string;
  feeFloor: number;
  verification: PairsVerification | null;
} | null {
  const study = readJson<StudyArtifact>(STUDY_PATH);
  if (!study?.pairs) return null;

  const feeFloor = study.fees?.roundTrip ?? 0.09;
  const verifiedAt = study.generatedAt ?? '';
  const verification: PairsVerification | null = study.verification
    ? {
        model: study.verification.model ?? 'unknown',
        promptVersion: study.verification.promptVersion ?? '—',
        verdictCount:
          study.verification.provenance?.reduce((s, p) => s + (p.n ?? 0), 0) ||
          study.verification.cachedVerdicts ||
          0,
      }
    : null;

  const strict = new Map<string, RawStrict>();
  const strictDoc = readJson<{ pairs?: RawStrict[] }>(STRICT_PATH);
  for (const s of strictDoc?.pairs ?? []) {
    if (s.polymarketId && s.kalshiId) strict.set(`${s.polymarketId}::${s.kalshiId}`, s);
  }

  // Correction overlay — reclassifies false-positive verdicts (strict re-check + deterministic rules).
  const corrections = new Map<string, RawCorrection>();
  const corrDoc = readJson<{ corrections?: RawCorrection[] }>(CORRECTIONS_PATH);
  for (const c of corrDoc?.corrections ?? []) {
    if (c.polymarketId && c.kalshiId) corrections.set(`${c.polymarketId}::${c.kalshiId}`, c);
  }

  const pairs: VerifiedPair[] = [];
  for (const p of study.pairs) {
    if (!p.polymarketId || !p.kalshiId) continue;
    const k = `${p.polymarketId}::${p.kalshiId}`;
    const s = strict.get(k);
    const c = corrections.get(k);
    pairs.push({
      polymarketId: p.polymarketId,
      kalshiId: p.kalshiId,
      polymarketTitle: p.question ?? '',
      kalshiTitle: p.kalshiQuestion ?? p.question ?? '',
      polymarketYes: p.polymarketYes ?? 0,
      kalshiYes: p.kalshiYes ?? 0,
      yesAligned: p.yesAligned ?? true,
      gap: p.gap ?? 0,
      feeFloor,
      cosine: p.similarity ?? 0,
      polyVolume: p.polyVolume ?? p.volume ?? 0,
      kalshiVolume: p.kalshiVolume ?? p.volume ?? 0,
      // The corrected verdict wins over the study's original triage label.
      triageLabel: c?.corrected_verdict ?? p.triage_label ?? 'topical_overlap',
      funnelStage: p.funnel_stage ?? '',
      reason: p.reason ?? '',
      category: p.category,
      verifiedAt,
      checklist: s?.checklist,
      liquidityTier: s?.liquidity_tier,
      strictSurvivor: c ? false : s?.strict_survivor,
      corrected: !!c,
      correctionReason: c?.correction_reason,
      correctionSource: c?.correction_source,
    });
  }
  return { pairs, verifiedAt, feeFloor, verification };
}
