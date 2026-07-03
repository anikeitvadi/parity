/**
 * Strict spec-match pass — the rigor step that turns "221 semantic survivors" into a defensible
 * public claim. Semantic triage answered "same event?"; this answers the harder question:
 * "same EXECUTABLE CONTRACT?" via an explicit checklist (line, threshold, window, structure,
 * settlement, direction). ANY mismatch → spec_mismatch. We never assert risk-free arbitrage —
 * spec_match only means the two markets are the same contract; depth/slippage/timing remain unproven.
 *
 *   npm run strict-survivors
 *
 * Reads docs/data/efficiency-study.json (the locked corpus), audits the survivors above the
 * liquidity floor, writes docs/data/strict-survivors.json. Resumable via a JSON cache.
 */

import '../src/config/env.js';
import fs from 'node:fs';
import { openaiBatchClient } from '../src/services/verifier-batch.js';

const STUDY = 'docs/data/efficiency-study.json';
const OUT = 'docs/data/strict-survivors.json';
const CACHE = '.cache/strict-survivors-cache.json';
const MODEL = process.env.VERIFY_MODEL ?? 'gpt-4o-mini';
const FLOOR = Number(process.env.STRICT_FLOOR ?? 500); // thinner-side volume floor for the audit set
const CONCURRENCY = 5;

type Pair = {
  polymarketId: string;
  kalshiId: string;
  question: string;
  kalshiQuestion: string;
  polymarketYes: number;
  kalshiYes: number;
  gap: number;
  polyVolume: number;
  kalshiVolume: number;
  category: string;
  triage_label: string;
};

type Audit = {
  same_event: boolean;
  same_entity: boolean;
  same_window: boolean;
  same_line: boolean;
  same_settlement: boolean;
  same_direction: boolean;
  same_structure: boolean;
  spec_match: boolean;
  spec_mismatch_reason: string;
};

const minSide = (p: Pair) => Math.min(p.polyVolume || 0, p.kalshiVolume || 0);
const liquidityTier = (v: number) => (v > 10000 ? '>10k' : v > 5000 ? '>5k' : v > 1000 ? '>1k' : v > 500 ? '>500' : '<=500');

const SYSTEM =
  'You are a prediction-market arbitrage spec auditor. Two markets (Polymarket vs Kalshi) were already judged to cover the same broad event. Decide whether they are the SAME EXECUTABLE CONTRACT. Be strict: ANY mismatch on the checklist means spec_match=false. Common false matches: different numeric line/threshold (O/U 8.5 vs 9.5), team-only vs total, first-half vs full-game, exact value vs range, different resolution date or source, multi-outcome vs binary. Never assert risk-free arbitrage — spec_match only means "same contract". Output JSON only.';

const userPrompt = (p: Pair) =>
  `Polymarket: ${p.question}
Kalshi: ${p.kalshiQuestion}
(Polymarket YES ${p.polymarketYes}, Kalshi YES ${p.kalshiYes})

For each check, true only if clearly satisfied:
- same_event: same underlying real-world event
- same_entity: same team / person / entity
- same_window: same time window / resolution date
- same_line: same numeric line, threshold, or strike
- same_settlement: same settlement source / rule
- same_direction: a YES resolves on the same outcome on both
- same_structure: same structure (binary vs multi-outcome; exact value vs range; first-half vs full-game; team-only vs total)

Return ONLY JSON:
{"same_event":bool,"same_entity":bool,"same_window":bool,"same_line":bool,"same_settlement":bool,"same_direction":bool,"same_structure":bool,"spec_match":bool,"spec_mismatch_reason":string}
spec_match is true ONLY if every check is true. spec_mismatch_reason = the single most important mismatch (one short phrase), or "" if spec_match.`;

function loadCache(): Record<string, Audit> {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Record<string, Audit>;
  } catch {
    return {};
  }
}

async function audit(client: ReturnType<typeof openaiBatchClient>, p: Pair): Promise<Audit> {
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: 300,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt(p) },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  try {
    const a = JSON.parse(raw) as Audit;
    a.spec_match = !!(a.same_event && a.same_entity && a.same_window && a.same_line && a.same_settlement && a.same_direction && a.same_structure);
    return a;
  } catch {
    return {
      same_event: false, same_entity: false, same_window: false, same_line: false,
      same_settlement: false, same_direction: false, same_structure: false,
      spec_match: false, spec_mismatch_reason: 'audit_parse_error',
    };
  }
}

/** Bounded-concurrency map. */
async function mapPool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function main() {
  const study = JSON.parse(fs.readFileSync(STUDY, 'utf8')) as { pairs: Pair[] };
  // Label was renamed confirmed_arbitrage → semantic_survivor (honesty); accept both so re-runs work pre/post migration.
  const survivors = (study.pairs || []).filter((p) => p.triage_label === 'semantic_survivor' || p.triage_label === 'confirmed_arbitrage');
  const audited = survivors.filter((p) => minSide(p) > FLOOR); // liquid_semantic_survivor set
  console.log(`semantic survivors: ${survivors.length} | auditing ${audited.length} above $${FLOOR} thinner-side liquidity (model ${MODEL})`);

  const cache = loadCache();
  const client = openaiBatchClient();
  let done = 0;
  const results = await mapPool(audited, CONCURRENCY, async (p) => {
    const key = `${p.polymarketId}:${p.kalshiId}`;
    const a = cache[key] ?? (cache[key] = await audit(client, p));
    if (++done % 10 === 0) console.log(`  audited ${done}/${audited.length}`);
    return {
      polymarketId: p.polymarketId,
      kalshiId: p.kalshiId,
      polymarketQuestion: p.question,
      kalshiQuestion: p.kalshiQuestion,
      category: p.category,
      gap: p.gap,
      thinnerSideVolume: minSide(p),
      liquidity_tier: liquidityTier(minSide(p)),
      semantic_survivor: true,
      liquid_semantic_survivor: true,
      spec_match: a.spec_match,
      spec_mismatch_reason: a.spec_mismatch_reason,
      strict_survivor: a.spec_match,
      checklist: a,
    };
  });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

  const strict = results.filter((r) => r.strict_survivor);
  const reasons: Record<string, number> = {};
  for (const r of results) if (!r.spec_match) reasons[r.spec_mismatch_reason || 'unspecified'] = (reasons[r.spec_mismatch_reason || 'unspecified'] || 0) + 1;
  const byTier = (tier: string) => results.filter((r) => r.thinnerSideVolume > ({ '>500': 500, '>1k': 1000, '>5k': 5000, '>10k': 10000 } as Record<string, number>)[tier]);

  const summary = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    floor: FLOOR,
    semanticSurvivors: survivors.length,
    liquidSemanticSurvivors: audited.length,
    strictSurvivors: strict.length,
    strictSurvivorsByTier: {
      gt500: byTier('>500').filter((r) => r.strict_survivor).length,
      gt1k: byTier('>1k').filter((r) => r.strict_survivor).length,
      gt5k: byTier('>5k').filter((r) => r.strict_survivor).length,
      gt10k: byTier('>10k').filter((r) => r.strict_survivor).length,
    },
    specMismatchReasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
    caveat: 'spec_match means same contract, NOT executable risk-free arbitrage. No arb claim without order-book depth, slippage, and timing.',
    pairs: results.sort((a, b) => b.gap - a.gap),
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

  console.log(`\nstrict survivors: ${strict.length}/${audited.length}`);
  console.log('by tier:', JSON.stringify(summary.strictSurvivorsByTier));
  console.log('mismatch reasons:', JSON.stringify(summary.specMismatchReasons));
  console.log(`→ ${OUT}`);
}

main().catch((e) => {
  console.error('strict-survivors failed:', e);
  process.exit(1);
});
