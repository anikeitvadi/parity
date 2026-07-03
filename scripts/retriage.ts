/**
 * Re-runnable triage post-process.
 *
 * The billion-scale matching (embed + candidates + LLM verify + orientation) is
 * the expensive, stable step — it's persisted in docs/data/efficiency-study.json.
 * This reads those matched pairs and (re)applies the canonical funnel taxonomy
 * WITHOUT re-matching, so the taxonomy/wording can be iterated in ~2 minutes.
 *
 * Funnel (each priceable same-contract pair lands in exactly one terminal stage):
 *   same_contract
 *     ├─ dropped_degenerate        (resolved 0.00/1.00 price — not priceable)
 *     └─ priceable
 *         ├─ validated_same_contract     (gap ≤ fees: the market agrees)
 *         └─ apparent_fee_clearing_gap   (gap > fees: triaged below)
 *             ├─ settlement_ambiguity
 *             ├─ scope_mismatch
 *             ├─ entity_mismatch_rejected
 *             ├─ thin_or_dead_liquidity
 *             └─ confirmed_arbitrage
 *   orientation_normalized = priceable pairs whose YES/NO the matcher flipped
 *   (a cross-cutting flag, reported alongside the stages).
 *
 * Run: `npm run retriage` (after `npm run study` has produced the artifact).
 */

import '../src/config/env.js';
import { readFileSync, writeFileSync } from 'fs';
import { verifierConfig, type Verifier } from '../src/services/cross-platform-matcher.js';

const STUDY = 'docs/data/efficiency-study.json';
const AUDIT_CSV = 'docs/data/pair-audit.csv';
const ROUND_TRIP_FEES = 0.09;

/** The six terminal labels for an apparent (fee-clearing) gap. */
const APPARENT_LABELS = [
  'settlement_ambiguity',
  'scope_mismatch',
  'entity_mismatch_rejected',
  'thin_or_dead_liquidity',
  'confirmed_arbitrage',
  'needs_manual_review',
] as const;
type ApparentLabel = (typeof APPARENT_LABELS)[number];

interface Pair {
  question: string;
  polymarketId: string;
  kalshiId: string;
  kalshiQuestion: string;
  polymarketYes: number;
  kalshiYes: number;
  yesAligned?: boolean;
  gap: number;
  priceable?: boolean;
  similarity: number;
  sameCriteria?: boolean;
  reason: string;
  volume: number;
  polyVolume?: number;
  kalshiVolume?: number;
  category?: string;
  triage_label?: string;
  funnel_stage?: string;
}

async function classifyApparent(verifier: Verifier, p: Pair): Promise<{ label: ApparentLabel; reason: string }> {
  const system = `You triage an apparent cross-platform "arbitrage" between a Polymarket and a Kalshi market that priced far apart. Pick exactly ONE label explaining the gap:
- entity_mismatch_rejected: they're about DIFFERENT entities (different team, person, office, jurisdiction — e.g. a US Senate race vs a state-senate race; two different teams). Not the same contract.
- scope_mismatch: same entity, DIFFERENT resolution scope/criteria — e.g. "reach the round of 16" vs "eliminated in the round of 16"; a price threshold vs a date bucket; "win" vs "advance".
- settlement_ambiguity: the SAME event, but resolution definitions differ in a genuinely ambiguous way (e.g. "leader" vs "de facto leader"). Real contract-risk.
- thin_or_dead_liquidity: both YES prices are low (roughly <0.15) or one side looks dead/illiquid, so the gap is plausibly bid/ask noise, not a true edge.
- confirmed_arbitrage: genuinely the SAME contract, directly comparable, with a real exploitable mispricing.
- needs_manual_review: you genuinely cannot tell from the text which label applies — honestly ambiguous, a human should look.
Be skeptical: prefer an artifact label unless it is clearly the same contract with a real edge. Use needs_manual_review only when truly undecidable, not as a lazy default. Reply strict JSON only: {"label": one of [${APPARENT_LABELS.join(', ')}], "reason": "<=15 words"}.`;
  const user = `MARKET A (Polymarket), YES=${p.polymarketYes.toFixed(2)}, volume=$${Math.round(p.polyVolume ?? 0).toLocaleString()}:\n${p.question}\n\nMARKET B (Kalshi), YES=${p.kalshiYes.toFixed(2)}, volume=$${Math.round(p.kalshiVolume ?? 0).toLocaleString()}:\n${p.kalshiQuestion}\n\nAbsolute gap: ${(p.gap * 100).toFixed(0)}pp. Prior matcher note: ${p.reason}`;
  try {
    const raw = await verifier.complete(system, user, 120);
    const parsed = JSON.parse(raw || '{}');
    const label: ApparentLabel = APPARENT_LABELS.includes(parsed.label) ? parsed.label : 'needs_manual_review';
    return { label, reason: String(parsed.reason || '').slice(0, 120) };
  } catch {
    return { label: 'needs_manual_review', reason: 'triage error (unparseable verdict)' };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  const verifier = verifierConfig(); // throws if the selected provider's key is missing
  const study = JSON.parse(readFileSync(STUDY, 'utf8'));
  const pairs: Pair[] = study.pairs;

  // Mechanical funnel staging.
  const sameContract = pairs.filter((p) => p.sameCriteria);
  const priceable = sameContract.filter((p) => p.priceable);
  const droppedDegenerate = sameContract.length - priceable.length;
  const orientationNormalized = priceable.filter((p) => p.yesAligned === false).length;
  const validated = priceable.filter((p) => p.gap <= ROUND_TRIP_FEES);
  const apparent = priceable.filter((p) => p.gap > ROUND_TRIP_FEES);

  console.log(`same_contract=${sameContract.length}  dropped_degenerate=${droppedDegenerate}  priceable=${priceable.length}`);
  console.log(`  orientation_normalized=${orientationNormalized}  validated_same_contract=${validated.length}  apparent_fee_clearing_gap=${apparent.length}`);
  console.log(`Triaging ${apparent.length} apparent gaps with the canonical taxonomy…`);

  console.log(`  triage provider: ${verifier.provider} (${verifier.model})`);
  const verdicts = await mapLimit(apparent, 16, (p) => classifyApparent(verifier, p));

  // Label every pair with its terminal funnel stage.
  for (const p of pairs) {
    if (!p.sameCriteria) { p.funnel_stage = 'topical_overlap'; p.triage_label = undefined; continue; }
    if (!p.priceable) { p.funnel_stage = 'dropped_degenerate'; p.triage_label = 'dropped_degenerate'; continue; }
    if (p.gap <= ROUND_TRIP_FEES) { p.funnel_stage = 'validated_same_contract'; p.triage_label = 'validated_same_contract'; continue; }
    p.funnel_stage = 'apparent_fee_clearing_gap';
  }
  apparent.forEach((p, i) => {
    p.triage_label = verdicts[i].label === 'confirmed_arbitrage' ? 'semantic_survivor' : verdicts[i].label;
    p.reason = verdicts[i].reason || p.reason;
    // confirmed_arbitrage is its own terminal funnel stage, not just an apparent gap.
    if (verdicts[i].label === 'confirmed_arbitrage') p.funnel_stage = 'semantic_survivor';
  });

  const triageCounts: Record<string, number> = {};
  for (const v of verdicts) triageCounts[v.label] = (triageCounts[v.label] || 0) + 1;
  const confirmedArb = triageCounts['semantic_survivor'] || 0;

  // The canonical funnel (counts that sum cleanly down the waterfall).
  const funnel = {
    sameContract: sameContract.length,
    droppedDegenerate,
    priceable: priceable.length,
    orientationNormalized,
    validatedSameContract: validated.length,
    apparentFeeClearingGap: apparent.length,
    triage: triageCounts,
    confirmedArbitrage: confirmedArb,
  };

  // Recompute sensitivity's confirmedArb with the canonical triage.
  if (Array.isArray(study.sensitivity)) {
    for (const row of study.sensitivity) {
      const floor = row.floor as number;
      row.confirmedArb = apparent.filter(
        (p) => p.triage_label === 'semantic_survivor' && (p.polyVolume ?? 0) >= floor && (p.kalshiVolume ?? 0) >= floor
      ).length;
    }
  }

  // Pair-space: the billion-scale comparison space this pipeline compresses.
  const u = study.universe ?? {};
  const t = study.tradeable ?? {};
  study.pairSpace = {
    enumerated: (u.polymarket ?? 0) * (u.kalshi ?? 0),
    enumeratedIsLowerBound: u.polymarketIsLowerBound ?? false,
    tradeable: (t.polymarket ?? 0) * (t.kalshi ?? 0),
  };

  study.triageFunnel = funnel; // never clobber study.funnel — the web app reads its shape
  study.triage = { counts: triageCounts, confirmedArb };
  study.actionable = { ...study.actionable, confirmedArbAfterTriage: confirmedArb };
  study.retriagedAt = study.generatedAt; // stamped from the source artifact (no Date in scripts)
  writeFileSync(STUDY, JSON.stringify(study, null, 2));

  // Per-pair audit CSV — the dashboard's row-level source of truth.
  const esc = (s: unknown) => JSON.stringify(String(s ?? ''));
  const PRIMARY_FLOOR = 0; // primary tradeability floor: volume > 0 on both sides
  // Every topical overlap (not just priceable same-contract), so same_event /
  // same_contract / stage actually vary across rows.
  const auditRows = [...pairs].sort((a, b) => b.gap - a.gap);
  const csv = [
    'polymarket_id,kalshi_id,polymarket_question,kalshi_question,polymarket_yes,kalshi_yes,yes_aligned,normalized_gap,priceable,same_event,same_contract,stage,triage_label,triage_reason,category,polymarket_volume,kalshi_volume,liquidity_floor_passed',
    ...auditRows.map((p) =>
      [
        esc(p.polymarketId), esc(p.kalshiId), esc(p.question), esc(p.kalshiQuestion),
        p.polymarketYes.toFixed(4), p.kalshiYes.toFixed(4), p.yesAligned !== false, p.gap.toFixed(4),
        !!p.priceable, true, !!p.sameCriteria,
        p.funnel_stage ?? '', p.triage_label ?? '', esc(p.reason), esc(p.category),
        Math.round(p.polyVolume ?? 0), Math.round(p.kalshiVolume ?? 0),
        (p.polyVolume ?? 0) > PRIMARY_FLOOR && (p.kalshiVolume ?? 0) > PRIMARY_FLOOR,
      ].join(',')
    ),
  ].join('\n');
  writeFileSync(AUDIT_CSV, csv);

  const gaps = apparent.map((p) => p.gap);
  console.log('\n── Funnel ──');
  console.log(`same_contract ${funnel.sameContract} → priceable ${funnel.priceable} (dropped ${droppedDegenerate}) → validated ${validated.length} + apparent ${apparent.length}`);
  console.log(`orientation_normalized: ${orientationNormalized}`);
  console.log(`apparent gap triage: ${JSON.stringify(triageCounts)}`);
  console.log(`CONFIRMED ARBITRAGE: ${confirmedArb}   (apparent median ${(median(gaps) * 100).toFixed(1)}pp, p90 ${(percentile(gaps, 90) * 100).toFixed(1)}pp)`);
  console.log(`\nWrote ${STUDY} (funnel + triage) and ${AUDIT_CSV} (${auditRows.length} rows).`);
}

main().catch((e) => { console.error('retriage failed:', e); process.exit(1); });
