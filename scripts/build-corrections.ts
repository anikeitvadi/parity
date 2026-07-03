/**
 * Build an ADDITIVE correction overlay (docs/data/corrections.json) — never mutating the frozen
 * study artifact. Two sources of truth, no new model calls:
 *   1. strict_reverify — survivors the study's OWN 7-point spec audit already failed (spec_match =
 *      false in strict-survivors.json) are still labelled "semantic_survivor" in the main artifact;
 *      they are really spec mismatches.
 *   2. deterministic_rule — the known over-match shapes (World-Cup top-scorer vs a country goal
 *      leader, full-match vs half total, tournament-winner vs a single match, etc.). This mirror of
 *      web/src/lib/pairStatus.ts `suspiciousReason` MUST stay in sync with it.
 * The Scanner + Lab consume this overlay to show corrected verdicts. Re-run: npm run corrections.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const STUDY = 'docs/data/efficiency-study.json';
const STRICT = 'docs/data/strict-survivors.json';
const OUT = 'docs/data/corrections.json';

interface StudyPair {
  polymarketId?: string;
  kalshiId?: string;
  question?: string;
  kalshiQuestion?: string;
  triage_label?: string;
  funnel_stage?: string;
}
interface StrictPair {
  polymarketId?: string;
  kalshiId?: string;
  spec_match?: boolean;
  spec_mismatch_reason?: string;
  liquid_semantic_survivor?: boolean;
  strict_survivor?: boolean;
}

// Keep in sync with web/src/lib/pairStatus.ts suspiciousReason.
function suspiciousReason(polyTitle: string, kalshiTitle: string): string | null {
  const P = (polyTitle || '').toLowerCase();
  const K = (kalshiTitle || '').toLowerCase();
  const isTotal = (s: string) => /(o\/u|over\/under|\btotal\b)/.test(s);
  const isHalf = (s: string) => /(first half|second half|1st half|2nd half)/.test(s);
  if (/(top goalscorer|top scorer|golden boot)/.test(P) && /goal leader/.test(K)) return 'World Cup top-scorer vs a single country’s goal leader';
  if (/(score a goal|goal contribution|to score)/.test(P) && /goal leader/.test(K)) return 'Score-a-goal vs a country’s goal leader';
  if (/(a player representing|any player)/.test(P) && /—\s*[a-zà-ÿ']+\s+[a-zà-ÿ']+/i.test(kalshiTitle)) return 'Any-player market vs one specific named player';
  if (isTotal(P) && isTotal(K) && isHalf(P) !== isHalf(K)) return 'Full-match total vs a half-only total';
  if (/(win the (world cup|championship|tournament|title|final)|tournament winner|outright)/.test(P) && /(win on \d|advance|\bvs\.?\b|group stage|to reach|semifinal|quarterfinal)/.test(K)) return 'Tournament winner vs a single match/stage outcome';
  const inCounty = (s: string) => /\bin [a-z.' -]*?county\b/.test(s);
  const countyRef = (s: string) => /\bcount(y|ies)\b/.test(s);
  if ((inCounty(P) && !countyRef(K)) || (inCounty(K) && !countyRef(P))) return 'County-level scope vs a statewide race — different geographic contract';
  return null;
}

interface Correction {
  polymarketId: string;
  kalshiId: string;
  original_verdict: string;
  corrected_verdict: string;
  correction_reason: string;
  correction_source: 'strict_reverify' | 'deterministic_rule';
  affects_funnel_stage: string;
}

const study = JSON.parse(readFileSync(STUDY, 'utf-8')) as { pairs?: StudyPair[]; funnel?: Record<string, number> };
const strict = JSON.parse(readFileSync(STRICT, 'utf-8')) as { pairs?: StrictPair[] };
const pairs = study.pairs ?? [];
const key = (a?: string, b?: string) => `${a}::${b}`;

const byKey = new Map<string, StudyPair>();
for (const p of pairs) if (p.polymarketId && p.kalshiId) byKey.set(key(p.polymarketId, p.kalshiId), p);

const corrections = new Map<string, Correction>();

// 1. strict_reverify — survivors the study's own strict audit already failed.
for (const s of strict.pairs ?? []) {
  if (s.spec_match === false && s.polymarketId && s.kalshiId) {
    const k = key(s.polymarketId, s.kalshiId);
    const sp = byKey.get(k);
    if (!sp || sp.triage_label === 'spec_mismatch' || sp.triage_label === 'scope_mismatch') continue;
    corrections.set(k, {
      polymarketId: s.polymarketId,
      kalshiId: s.kalshiId,
      original_verdict: sp.triage_label ?? 'semantic_survivor',
      corrected_verdict: 'spec_mismatch',
      correction_reason: s.spec_mismatch_reason || 'failed the 7-point strict spec check',
      correction_source: 'strict_reverify',
      affects_funnel_stage: sp.funnel_stage ?? '',
    });
  }
}

// 2. deterministic_rule — known over-match shapes, where not already corrected/mismatched.
for (const p of pairs) {
  if (!p.polymarketId || !p.kalshiId) continue;
  const k = key(p.polymarketId, p.kalshiId);
  if (corrections.has(k)) continue;
  if (p.triage_label === 'spec_mismatch' || p.triage_label === 'scope_mismatch' || p.triage_label === 'entity_mismatch_rejected') continue;
  const reason = suspiciousReason(p.question ?? '', p.kalshiQuestion ?? '');
  if (!reason) continue;
  corrections.set(k, {
    polymarketId: p.polymarketId,
    kalshiId: p.kalshiId,
    original_verdict: p.triage_label ?? 'topical_overlap',
    corrected_verdict: 'spec_mismatch',
    correction_reason: reason,
    correction_source: 'deterministic_rule',
    affects_funnel_stage: p.funnel_stage ?? '',
  });
}

const list = [...corrections.values()];
const bySource = { strict_reverify: 0, deterministic_rule: 0 };
const byOriginal: Record<string, number> = {};
for (const c of list) {
  bySource[c.correction_source]++;
  byOriginal[c.original_verdict] = (byOriginal[c.original_verdict] ?? 0) + 1;
}

const survivorsReclassified = list.filter((c) => c.original_verdict === 'semantic_survivor').length;
const f = study.funnel ?? {};
const overlay = {
  generatedAt: new Date().toISOString(),
  corrections: list,
  summary: {
    total: list.length,
    bySource,
    byOriginalStatus: byOriginal,
    survivorsReclassified,
    correctedSemanticSurvivors: (f.semanticSurvivors ?? 0) - survivorsReclassified,
    clearExecutableArbChanged: false, // 0 → 0 (corrections only remove false positives)
  },
};
writeFileSync(OUT, JSON.stringify(overlay, null, 2));

console.log(`Wrote ${OUT}`);
console.log(`Total corrections: ${list.length} (strict_reverify ${bySource.strict_reverify}, deterministic_rule ${bySource.deterministic_rule})`);
console.log('By original status:', JSON.stringify(byOriginal));
console.log(`Semantic survivors: ${f.semanticSurvivors ?? '?'} → ${overlay.summary.correctedSemanticSurvivors} after removing ${survivorsReclassified} false positives`);
console.log('Clear executable arb: 0 → 0 (unchanged; corrections only remove false positives)');
