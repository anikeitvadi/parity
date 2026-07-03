/**
 * Market Efficiency Study — Experiment 1: Cross-platform price gaps
 *
 * The headline question: can a retail trader arbitrage Polymarket vs Kalshi?
 *
 * Method:
 *   1. Pull every active STANDALONE market from both public APIs (no auth). A
 *      standalone market is a single priced proposition; multi-leg / composite
 *      (Kalshi MVE) parlays are excluded structurally, not by category — see the
 *      methodology artifact for the raw→standalone counts and samples.
 *   2. Embed each market's question + outcome + resolution rules (OpenAI
 *      text-embedding-3-small) and generate cross-platform candidates.
 *   3. LLM-verify each candidate: same underlying event? same resolution
 *      criteria (so a YES on one implies a YES on the other)?
 *   4. For verified same-contract pairs, measure the YES-price gap and whether
 *      it survives platform fees (Polymarket 2% + Kalshi 7% = 9% round-trip).
 *
 * The output is the distribution itself — not a verdict. Run: `npm run study`.
 *
 * Artifacts:
 *   docs/data/methodology.json       raw→standalone universe counts + samples
 *   docs/data/efficiency-study.json  full summary + every matched pair
 *   docs/data/gap-map.csv            one row per pair (for the Gap Map chart)
 */

import '../src/config/env.js'; // side-effect: dotenv.config()
import { writeFileSync, mkdirSync } from 'fs';
import { PolymarketClient, type PolymarketIngestStats } from '../src/services/polymarket.js';
import { KalshiClient, type KalshiIngestStats } from '../src/services/kalshi.js';
import { getDatabase, initDatabase } from '../src/database/schema.js';
import { findVerifiedMatches, PreflightAborted, BatchSubmitted, verifierConfig, type VerifiedPair } from '../src/services/cross-platform-matcher.js';
import { EMBEDDING_MODEL } from '../src/services/embedding.js';
import {
  persistStudyRun,
  type StudyMarketRecord,
  type StudyPairRecord,
} from '../src/database/study-store.js';
import type { Market } from '../src/types/market.js';
import { renameSync } from 'fs';
import { verdictProvenance } from '../src/services/verdict-cache.js';

/** Platform fees, round-trip — matches detectors/cross-platform-arb.ts. */
const POLYMARKET_FEE = 0.02;
const KALSHI_FEE = 0.07;
const ROUND_TRIP_FEES = POLYMARKET_FEE + KALSHI_FEE; // 0.09

const OUT_DIR = 'docs/data';

/** Write via a temp file + rename so a published artifact is never half-written. */
function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

interface PairRow {
  question: string;
  polymarketId: string;
  kalshiId: string;
  kalshiQuestion: string;
  polymarketYes: number; // raw Polymarket YES price
  kalshiYes: number; // raw Kalshi YES price (NOT orientation-adjusted)
  yesAligned: boolean; // does poly-YES correspond to kalshi-YES, or to kalshi-NO?
  gap: number; // |polyYes - orientedKalshiYes|, the gross edge before fees
  netAfterFees: number; // gap - round-trip fees, floored at 0
  priceable: boolean; // both sides have a live, non-degenerate price
  similarity: number; // cosine on the rules-aware embedding
  sameCriteria: boolean; // LLM verdict: same resolution criteria
  reason: string; // LLM one-line rationale
  volume: number; // max(poly, kalshi) — for chart sizing
  polyVolume: number; // per-platform volumes, for the sensitivity floors
  kalshiVolume: number;
  category: string; // Kalshi event category — for post-hoc slices, never a filter
  triage?: string; // triage label for fee-clearing gaps (set after triage pass)
}

function getYesPrice(market: Market): number {
  return (
    market.prices['Yes'] ??
    market.prices['yes'] ??
    Object.values(market.prices)[0] ??
    0.5
  );
}

/**
 * A price is "live" only when it's strictly inside (0, 1). Exactly 0.00 / 1.00
 * marks a resolved or untradeable market that leaked past the active/open
 * filter; comparing such a price yields a spurious gap (e.g. 0.00 vs 0.95), so
 * those pairs are excluded from the gap distribution.
 */
function isLivePrice(p: number): boolean {
  return p > 0.005 && p < 0.995;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/** ASCII histogram of gaps in 1pp buckets up to the fee line, then a tail. */
function asciiHistogram(gaps: number[]): string {
  const buckets = [
    { label: '0–1pp', lo: 0.0, hi: 0.01 },
    { label: '1–2pp', lo: 0.01, hi: 0.02 },
    { label: '2–3pp', lo: 0.02, hi: 0.03 },
    { label: '3–5pp', lo: 0.03, hi: 0.05 },
    { label: '5–9pp', lo: 0.05, hi: 0.09 },
    { label: '9pp+ (beats fees)', lo: 0.09, hi: Infinity },
  ];
  const counts = buckets.map(
    (b) => gaps.filter((g) => g >= b.lo && g < b.hi).length
  );
  const max = Math.max(1, ...counts);
  const width = 40;
  return buckets
    .map((b, i) => {
      const n = counts[i];
      const bar = '█'.repeat(Math.round((n / max) * width));
      return `  ${b.label.padEnd(18)} ${String(n).padStart(4)} ${bar}`;
    })
    .join('\n');
}

// Phase telemetry: the background task pipes stdout (block-buffered → invisible mid-run), so we
// also write a state file that's pollable regardless of buffering. Watch with:
//   node -e "console.log(require('fs').readFileSync('.cache/study-progress.json','utf8'))"
const STUDY_T0 = Date.now();
function mark(phase: string, extra?: Record<string, unknown>): void {
  const elapsedMs = Date.now() - STUDY_T0;
  const rec = { phase, elapsedMs, elapsedSec: Math.round(elapsedMs / 1000), at: new Date().toISOString(), ...extra };
  try {
    writeFileSync('.cache/study-progress.json', JSON.stringify(rec, null, 2));
  } catch {
    /* .cache missing — ignore */
  }
  try {
    process.stderr.write(`[study +${(elapsedMs / 1000).toFixed(1)}s] ${phase}\n`);
  } catch {
    /* ignore */
  }
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'OPENAI_API_KEY is required for embedding-based matching. Aborting.'
    );
    process.exit(1);
  }

  console.log('Market Efficiency Study — Experiment 1: cross-platform gaps\n');

  // 1. Enumerate the full standalone-market universe from both public APIs.
  //    Polymarket: multi-sort /events union (Gamma offset-caps each sort, so this
  //    is a documented lower bound). Kalshi: full cursor walk of /events.
  console.log('Enumerating standalone markets (Kalshi expands every event — minutes; checkpointed to .cache/)…');
  const polyClient = new PolymarketClient();
  const kalshiClient = new KalshiClient();

  const polyStats: PolymarketIngestStats = {
    rawMarketCount: 0, standaloneMarketCount: 0, excludedCount: 0,
    includedSamples: [], excludedSamples: [],
  };
  const kalshiStats: KalshiIngestStats = {
    eventCount: 0, rawChildCount: 0, standaloneMarketCount: 0,
    excludedCompositeCount: 0, excludedUnpricedCount: 0, cachedEvents: 0,
    includedSamples: [], excludedSamples: [],
  };

  let lastPct = -1;
  const [polyUniverse, kalshiUniverse] = await Promise.all([
    polyClient.getStandaloneUniverse({ stats: polyStats }),
    kalshiClient.getAllActiveMarkets({
      cacheDir: '.cache/kalshi-events',
      stats: kalshiStats,
      onProgress: (done, total) => {
        const pct = Math.floor((done / Math.max(1, total)) * 100);
        if (pct >= lastPct + 10) {
          lastPct = pct;
          process.stdout.write(`  Kalshi expand: ${pct}% (${done}/${total} events)\n`);
        }
      },
    }),
  ]);
  const totalStandalone = polyUniverse.length + kalshiUniverse.length;

  // The gap analysis runs only on the TRADEABLE subset: markets with a non-zero
  // volume (actually traded), because an untradeable market has no arbitrage to
  // capture. This is a tradeability scope, stated explicitly — NOT a topical
  // filter. The full enumerated universe above remains the honest denominator.
  const LIQUIDITY_FLOOR = 'volume > 0';
  const hasVol = (m: Market) => (m.volume || 0) > 0;
  const polyMarkets = polyUniverse.filter(hasVol);
  const kalshiMarkets = kalshiUniverse.filter(hasVol);

  console.log(`  Polymarket: ${polyUniverse.length} enumerated (lower bound) → ${polyMarkets.length} tradeable`);
  console.log(
    `  Kalshi:     ${kalshiUniverse.length} standalone (${kalshiStats.eventCount} events; ` +
    `excluded ${kalshiStats.excludedCompositeCount} composite) → ${kalshiMarkets.length} tradeable`
  );

  if (polyMarkets.length === 0 || kalshiMarkets.length === 0) {
    console.error('One platform returned zero tradeable markets — cannot match. Aborting.');
    process.exit(1);
  }

  // Quantify the raw /markets pollution we avoid by sourcing Kalshi via /events.
  console.log('Sampling raw Kalshi /markets to quantify parlay pollution…');
  const marketsSample = await kalshiClient.sampleMarketsEndpoint(5);

  // Write the methodology artifact BEFORE matching, so the universe definition
  // and the raw→standalone reduction are inspectable independent of the finding.
  const methodology = {
    generatedAt: new Date().toISOString(),
    unitOfComparison:
      'standalone market: a single forecastable proposition with its own price, its own settlement criteria, a binary/directly-comparable outcome, and no dependency on multiple unrelated legs',
    exclusionRules: [
      'Exclude multi-leg / composite contracts (Kalshi MVE parlays: mve_collection_ticker / mve_selected_legs / KXMVE* tickers) — not directly comparable cross-platform forecast propositions.',
      'Exclude raw container events with no direct price; keep each priced child of a mutually-exclusive event as its own standalone binary.',
      'Do NOT exclude by category — Sports, Elections, Entertainment, etc. are kept when structurally standalone and reported only as post-hoc analysis slices.',
      'Polymarket Gamma already returns individual standalone binaries (multi-candidate events arrive pre-split into negRisk binaries), so raw ≈ standalone.',
    ],
    polymarket: {
      source: 'Gamma /events?closed=false&active=true — multi-sort union (volume, liquidity, startDate desc)',
      enumerationMethod: `multi-sort /events union over [${(polyStats.enumerationSorts ?? []).join(', ')}]`,
      enumeratedCount: polyUniverse.length,
      isLowerBound: true,
      enumerationNote: 'Gamma hard-caps offset pagination at ~2000 per sort (offset 2100+ → HTTP 422). Unioning sort orders raises coverage but cannot guarantee completeness, so this is a LOWER BOUND on the true active universe — never "all active markets".',
      tradeableCount: polyMarkets.length,
      excludedCount: polyStats.excludedCount,
      includedSamples: polyStats.includedSamples,
      excludedSamples: polyStats.excludedSamples,
    },
    kalshi: {
      source: '/events?status=open (cursor-walked, no offset cap) → per-event detail expanded to standalone child markets',
      eventCount: kalshiStats.eventCount,
      rawChildCount: kalshiStats.rawChildCount,
      standaloneMarketCount: kalshiStats.standaloneMarketCount,
      excludedCompositeCount: kalshiStats.excludedCompositeCount,
      excludedUnpricedCount: kalshiStats.excludedUnpricedCount,
      tradeableCount: kalshiMarkets.length,
      rawMarketsEndpoint: {
        note: 'The /markets endpoint is dominated by MVE multi-leg parlays and is NOT used as an ingestion source — standalone markets are sourced via /events.',
        sampledRows: marketsSample.sampled,
        compositeRows: marketsSample.composite,
        compositeShare: marketsSample.sampled ? marketsSample.composite / marketsSample.sampled : 0,
        cursorExhausted: marketsSample.cursorExhausted,
      },
      includedSamples: kalshiStats.includedSamples,
      excludedSamples: kalshiStats.excludedSamples,
    },
    universe: {
      polymarketEnumerated: polyUniverse.length,
      polymarketIsLowerBound: true,
      kalshiStandalone: kalshiUniverse.length,
      totalStandalone,
    },
    tradeable: {
      liquidityFloorUsed: LIQUIDITY_FLOOR,
      polymarketTradeable: polyMarkets.length,
      kalshiTradeable: kalshiMarkets.length,
      matchingUniverseCount: polyMarkets.length + kalshiMarkets.length,
      note: 'The gap analysis runs only on this tradeable subset (markets with non-zero volume). The enumerated universe above is the honest denominator; this is the realistically-arbitrageable set.',
    },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  atomicWrite(`${OUT_DIR}/methodology.json`, JSON.stringify(methodology, null, 2));
  console.log(`  Methodology → ${OUT_DIR}/methodology.json\n`);

  // Candidate bar: empirically 100% of confirmed same-contract pairs have cosine
  // ≥ 0.715, so 0.68 (a 0.035 margin) keeps real matches while sharply cutting
  // the candidate set on the large tradeable universe. The LLM verifier restores
  // precision above it; the recall audit (later) validates nothing is lost.
  const CANDIDATE_THRESHOLD = 0.68;

  // 2 + 3. Rules-aware embedding (cached) → candidates → rate-limited LLM verify.
  console.log('\nMatching across platforms (cached embedding + rate-limited LLM verification)…');
  initDatabase();
  const db = getDatabase();
  mark('match-start', { polymarket: polyMarkets.length, kalshi: kalshiMarkets.length });
  let lastVpct = -1;
  let result!: Awaited<ReturnType<typeof findVerifiedMatches>>;
  try {
    result = await findVerifiedMatches(polyMarkets, kalshiMarkets, {
      candidateThreshold: CANDIDATE_THRESHOLD,
      concurrency: 16,
      onProgress: (done, total) => {
        const pct = Math.floor((done / Math.max(1, total)) * 100);
        if (pct >= lastVpct + 10) {
          lastVpct = pct;
          process.stdout.write(`  verify: ${pct}% (${done}/${total} markets)\n`);
          mark('verify', { pct, done, total });
        }
      },
    });
  } catch (e) {
    if (e instanceof PreflightAborted) {
      console.error(`\n⚠ Preflight refused to start verification.\n  ${e.reason}`);
      console.error(
        `  Plan: ${e.plan.missingVerdicts} missing of ${e.plan.polyWithCandidates} (${e.plan.cachedVerdicts} cached) · ` +
          `est $${e.plan.estCostUsd.toFixed(2)} · ~${e.plan.estRuntimeMin.toFixed(0)} min · daily cap ${e.plan.rpd ?? 'none'}\n`
      );
      process.exit(2);
    }
    if (e instanceof BatchSubmitted) {
      mkdirSync(OUT_DIR, { recursive: true });
      atomicWrite(
        `${OUT_DIR}/verification-status.json`,
        JSON.stringify({ status: 'batch_pending', requestCount: e.requestCount, chunks: e.progress, generatedAt: new Date().toISOString(), poll: 'npm run verify:batch:poll' }, null, 2)
      );
      console.error(
        `\n📦 Submitted ${e.requestCount} verdicts to the Batch API (separate quota pool, ~50% cost).\n` +
          `  Chunks: ${e.progress.imported} imported · ${e.progress.inFlight} in-flight · ${e.progress.prepared} queued.\n` +
          `  Poll + import:  npm run verify:batch:poll   (re-runnable; drives to completion)\n` +
          `  Then re-run \`npm run study\` to finish + publish — artifacts were NOT written this run.`
      );
      process.exit(3);
    }
    throw e;
  }
  mark('matched', { topicalOverlaps: result.pairs.length });
  const sameContractCount = result.pairs.filter((p) => p.sameCriteria).length;
  console.log(
    `  ${result.candidates} candidate pairs over ${result.polyWithCandidates} markets → ${result.verifiedThisRun} verified this run, ${result.cachedHits} cached`
  );
  console.log(
    `  ${result.pairs.length} same-event pairs (${sameContractCount} same-contract) · model ${result.verifierModel}`
  );

  // Quota guard: if the daily LLM budget ran out mid-verification, the result is
  // PARTIAL. Do NOT overwrite the good artifacts with a corrupted run — the
  // verdict cache has banked progress; just report and exit so a re-run resumes.
  if (result.quotaExhausted) {
    const remaining = result.polyWithCandidates - result.cachedHits - result.verifiedThisRun;
    console.error(
      `\n⚠ Daily LLM quota exhausted — verification incomplete (${remaining} markets unverified).\n` +
      `  Banked ${result.cachedHits + result.verifiedThisRun} verdicts to cache. Artifacts NOT overwritten.\n` +
      `  Re-run \`npm run study\` after the quota resets; it resumes from the cache.`
    );
    process.exit(2);
  }

  // 4. Build pair rows. Price gaps are only meaningful for SAME-CONTRACT pairs
  //    (where a YES means the same thing); we keep all same-event pairs but flag it.
  const pairs: PairRow[] = result.pairs.map((m: VerifiedPair) => {
    const polyYes = getYesPrice(m.polymarket);
    const kalshiYesRaw = getYesPrice(m.kalshi);
    // Orientation fix: when the YES sides are inverted (same event, opposite
    // labels), compare poly-YES against the complement of kalshi-YES.
    const kalshiYesOriented = m.yesAligned ? kalshiYesRaw : 1 - kalshiYesRaw;
    const gap = Math.abs(polyYes - kalshiYesOriented);
    return {
      question: m.polymarket.question,
      polymarketId: m.polymarket.id,
      kalshiId: m.kalshi.id,
      kalshiQuestion: m.kalshi.question,
      polymarketYes: polyYes,
      kalshiYes: kalshiYesRaw,
      yesAligned: m.yesAligned,
      gap,
      netAfterFees: Math.max(0, gap - ROUND_TRIP_FEES),
      priceable: isLivePrice(polyYes) && isLivePrice(kalshiYesRaw),
      similarity: m.cosine,
      sameCriteria: m.sameCriteria,
      reason: m.reason,
      volume: Math.max(m.polymarket.volume || 0, m.kalshi.volume || 0),
      polyVolume: m.polymarket.volume || 0,
      kalshiVolume: m.kalshi.volume || 0,
      category: ((m.kalshi.metadata as { category?: string } | undefined)?.category) || 'Uncategorized',
    };
  });

  // Gap distribution is measured over same-contract pairs that BOTH share
  // resolution criteria and have live prices on both sides — comparing across
  // different criteria, or against a resolved 0.00/1.00 price, is apples-to-oranges.
  const sameContract = pairs.filter((p) => p.sameCriteria);
  const sameContractPriceable = sameContract.filter((p) => p.priceable);
  const droppedDegenerate = sameContract.length - sameContractPriceable.length;
  const gaps = sameContractPriceable.map((p) => p.gap).sort((a, b) => a - b);
  const mean = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;

  const beatsFees = sameContractPriceable.filter((p) => p.gap > ROUND_TRIP_FEES).length;
  const surface3pp = sameContractPriceable.filter((p) => p.gap >= 0.03).length;
  const meetsDetector = sameContractPriceable.filter((p) => p.gap >= 0.19).length;

  // Triage is a separate, re-runnable step (`npm run retriage`) so the taxonomy
  // can iterate without re-paying the billion-scale match. The study leaves the
  // terminal labels empty; retriage fills triage counts, confirmed-arbitrage,
  // and the per-pair audit. These placeholders are overwritten there.
  const feeClearing = sameContractPriceable.filter((p) => p.gap > ROUND_TRIP_FEES);
  console.log(`\n${feeClearing.length} fee-clearing gaps to triage — run \`npm run retriage\` next.`);
  const triageCounts: Record<string, number> = {};
  const confirmedArbTotal = 0;

  // Sensitivity: re-cut the finding at rising liquidity floors. Higher floors are
  // subsets of vol>0, so we post-filter the matched pairs (both sides ≥ floor)
  // rather than re-matching. Answers "does any edge appear once you require real
  // liquidity?" — confirmedArb is the triage-survivor count at each floor.
  const SENSITIVITY_FLOORS = [0, 1000, 10000, 100000];
  const sensitivity = SENSITIVITY_FLOORS.map((floor) => {
    const polyN = polyMarkets.filter((m) => (m.volume || 0) > 0 && (m.volume || 0) >= floor).length;
    const kalshiN = kalshiMarkets.filter((m) => (m.volume || 0) > 0 && (m.volume || 0) >= floor).length;
    const meets = (p: PairRow) => p.polyVolume >= floor && p.kalshiVolume >= floor && p.polyVolume > 0 && p.kalshiVolume > 0;
    const topical = pairs.filter(meets);
    const scp = sameContractPriceable.filter(meets);
    const fgaps = scp.map((p) => p.gap).sort((a, b) => a - b);
    const confirmedArb = scp.filter((p) => p.gap > ROUND_TRIP_FEES && p.triage === 'confirmed_arb').length;
    return {
      floor,
      label: floor === 0 ? 'volume > 0' : `volume ≥ $${floor.toLocaleString()}`,
      polymarket: polyN,
      kalshi: kalshiN,
      topicalOverlaps: topical.length,
      sameContractPriceable: scp.length,
      medianGapPp: +(median(fgaps) * 100).toFixed(2),
      p90GapPp: +(percentile(fgaps, 90) * 100).toFixed(2),
      gapsAbove9pp: scp.filter((p) => p.gap > ROUND_TRIP_FEES).length,
      confirmedArb,
    };
  });

  // Category slices: analysis only, never a filter. Lets us ask "is value hiding
  // in sports/elections?" without cherry-picking which categories define the run.
  const sliceMap = new Map<string, { category: string; pairs: number; medianGapPp: number; maxGapPp: number; beatsFees: number; _gaps: number[] }>();
  for (const p of sameContractPriceable) {
    let s = sliceMap.get(p.category);
    if (!s) { s = { category: p.category, pairs: 0, medianGapPp: 0, maxGapPp: 0, beatsFees: 0, _gaps: [] }; sliceMap.set(p.category, s); }
    s.pairs++;
    s._gaps.push(p.gap);
    s.maxGapPp = Math.max(s.maxGapPp, p.gap * 100);
    if (p.gap > ROUND_TRIP_FEES) s.beatsFees++;
  }
  const categorySlices = [...sliceMap.values()]
    .map((s) => {
      const sorted = s._gaps.sort((a, b) => a - b);
      return { category: s.category, pairs: s.pairs, medianGapPp: +(median(sorted) * 100).toFixed(2), maxGapPp: +s.maxGapPp.toFixed(2), beatsFees: s.beatsFees };
    })
    .sort((a, b) => b.pairs - a.pairs);

  // Verification provenance + single-model guard — a published corpus must be ONE model.
  const verifier = verifierConfig();
  const provenance = verdictProvenance(db, verifier.promptVersion, verifier.schemaVersion);
  if (provenance.length > 1 && process.env.VERIFY_ALLOW_MIXED_MODELS !== '1') {
    console.error(
      `\n✖ Refusing to publish a mixed-model corpus — verdicts span ${provenance.length} (provider, model) pairs:\n` +
        provenance.map((p) => `    ${p.provider}/${p.model}: ${p.n}`).join('\n') +
        `\n  Re-run on ONE model, or set VERIFY_ALLOW_MIXED_MODELS=1 to publish a mixed corpus deliberately.\n`
    );
    process.exit(4);
  }
  const totalVerified = result.cachedHits + result.verifiedThisRun;
  const missingVerdicts = Math.max(0, result.polyWithCandidates - totalVerified);
  const verification = {
    transport: process.env.VERIFY_TRANSPORT === 'batch' ? 'batch' : 'sync',
    provider: verifier.provider,
    model: verifier.model,
    promptVersion: verifier.promptVersion,
    schemaVersion: verifier.schemaVersion,
    status: missingVerdicts === 0 ? 'complete' : 'partial',
    verifierComplete: missingVerdicts === 0,
    polyWithCandidates: result.polyWithCandidates,
    cachedVerdicts: totalVerified,
    verifiedThisRun: result.verifiedThisRun,
    missingVerdicts,
    provenance,
    mixedModel: provenance.length > 1,
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    // Denominator = the full enumerated standalone universe (Polymarket count is a
    // documented lower bound — Gamma offset cap). NOT the tradeable subset.
    universe: {
      polymarket: polyUniverse.length,
      polymarketIsLowerBound: true,
      kalshi: kalshiUniverse.length,
      total: totalStandalone,
    },
    // The set the gap analysis actually runs on: markets with a live price.
    tradeable: {
      liquidityFloor: LIQUIDITY_FLOOR,
      polymarket: polyMarkets.length,
      kalshi: kalshiMarkets.length,
      total: polyMarkets.length + kalshiMarkets.length,
    },
    matching: {
      method: 'cached rules-aware embedding → ANN-style candidate retrieval → market-level LLM verification (orientation-corrected)',
      embeddingModel: EMBEDDING_MODEL,
      verificationModel: result.verifierModel,
      promptVersion: result.promptVersion,
      candidateThreshold: CANDIDATE_THRESHOLD,
      candidates: result.candidates, // candidate pairs (poly × adaptive topK)
      polyWithCandidates: result.polyWithCandidates, // markets that needed a verification request
      verifiedThisRun: result.verifiedThisRun,
      cachedVerdicts: result.cachedHits,
      topicalOverlaps: pairs.length, // same underlying event (LLM-verified)
      sameContract: sameContract.length, // same resolution criteria
      sameContractPriceable: sameContractPriceable.length, // + live price both sides (gap-distribution basis)
      droppedDegenerate, // same-contract pairs excluded for a resolved/degenerate price
    },
    verification, // provenance + completeness — Lab/docs publish headlines only when verifierComplete
    // Recall audit: the cosine rank of each confirmed match. recall@1 = share found
    // at rank 0 — i.e. how much a topK=1 retrieval would have kept. The exact
    // brute-force candidate scan is ground truth, so rank>0 matches are precisely
    // what a cheaper retrieval would have dropped.
    recall: {
      matchRankHistogram: result.matchRankHistogram,
      recallAt1:
        result.pairs.length > 0
          ? +(result.matchRankHistogram[0] / result.pairs.length).toFixed(4)
          : 1,
      recallAt5:
        result.pairs.length > 0
          ? +(result.matchRankHistogram.slice(0, 5).reduce((a, b) => a + b, 0) / result.pairs.length).toFixed(4)
          : 1,
    },
    fees: { polymarket: POLYMARKET_FEE, kalshi: KALSHI_FEE, roundTrip: ROUND_TRIP_FEES },
    gapDistribution: {
      medianGap: median(gaps),
      meanGap: mean,
      p90Gap: percentile(gaps, 90),
      maxGap: gaps.length ? gaps[gaps.length - 1] : 0,
    },
    actionable: {
      surfaced_3pp: surface3pp,
      beatsFees_9pp: beatsFees,
      meetsDetectorThreshold_19pp: meetsDetector,
      confirmedArbAfterTriage: confirmedArbTotal, // fee-clearing gaps that survive triage as real
    },
    // Triage of the fee-clearing gaps: why each large gap exists (artifacts vs real).
    triage: { counts: triageCounts, confirmedArb: confirmedArbTotal },
    // Sensitivity: the finding re-cut at rising liquidity floors (analysis, not the primary filter).
    sensitivity,
    // Post-hoc analysis only — categories never define the primary universe.
    categorySlices,
    // Same-contract first, then by similarity — so the "real" comparables sort up.
    pairs: pairs.sort(
      (a, b) => Number(b.sameCriteria) - Number(a.sameCriteria) || b.similarity - a.similarity
    ),
  };

  // Write artifacts.
  mkdirSync(OUT_DIR, { recursive: true });
  atomicWrite(`${OUT_DIR}/efficiency-study.json`, JSON.stringify(summary, null, 2));
  const csv = [
    'polymarket_id,kalshi_id,polymarket_question,kalshi_question,polymarket_yes,kalshi_yes,yes_aligned,gap,net_after_fees,priceable,cosine,same_criteria,triage,poly_volume,kalshi_volume,reason',
    ...pairs.map(
      (p) =>
        `${JSON.stringify(p.polymarketId)},${JSON.stringify(p.kalshiId)},${JSON.stringify(
          p.question
        )},${JSON.stringify(p.kalshiQuestion)},${p.polymarketYes.toFixed(4)},${p.kalshiYes.toFixed(
          4
        )},${p.yesAligned},${p.gap.toFixed(4)},${p.netAfterFees.toFixed(4)},${p.priceable},${p.similarity.toFixed(4)},${p.sameCriteria},${p.triage ?? ''},${Math.round(p.polyVolume)},${Math.round(p.kalshiVolume)},${JSON.stringify(
          p.reason
        )}`
    ),
  ].join('\n');
  atomicWrite(`${OUT_DIR}/gap-map.csv`, csv);

  // Persist to SQLite so the match is inspectable, not a vibe.
  const universeSnapshot: StudyMarketRecord[] = [...polyMarkets, ...kalshiMarkets].map((m) => ({
    marketId: m.id,
    platform: m.platform,
    title: m.question,
    closeDate: m.closeDate,
    price: getYesPrice(m),
    volume: m.volume || 0,
  }));
  const pairRecords: StudyPairRecord[] = pairs.map((p) => ({
    polymarketId: p.polymarketId,
    kalshiId: p.kalshiId,
    polymarketTitle: p.question,
    kalshiTitle: p.kalshiQuestion,
    cosineSimilarity: p.similarity,
    polymarketPrice: p.polymarketYes,
    kalshiPrice: p.kalshiYes,
    priceGap: p.gap,
    feeAdjustedGap: p.netAfterFees,
    surfaced3pp: p.gap >= 0.03,
    beatsFees9pp: p.gap > ROUND_TRIP_FEES,
    meetsDetector19pp: p.gap >= 0.19,
    volume: p.volume,
  }));
  const runId = persistStudyRun(db, {
    generatedAt: summary.generatedAt,
    embeddingModel: EMBEDDING_MODEL,
    similarityThreshold: CANDIDATE_THRESHOLD,
    roundTripFees: ROUND_TRIP_FEES,
    universe: summary.universe,
    markets: universeSnapshot,
    pairs: pairRecords,
  });

  // Print the finding.
  console.log('\n────────────────────────────────────────────────────────');
  console.log('FINDING — cross-platform overlap & price gaps');
  console.log('────────────────────────────────────────────────────────');
  console.log(`Universe (enumerated): ${totalStandalone} standalone markets (Poly ${polyUniverse.length}≥ + Kalshi ${kalshiUniverse.length})`);
  console.log(`Tradeable (vol>0):     ${polyMarkets.length + kalshiMarkets.length} (Poly ${polyMarkets.length} + Kalshi ${kalshiMarkets.length}) — matched`);
  console.log(`Topical overlaps:      ${pairs.length} (same event, LLM-verified)`);
  console.log(`Same contract:         ${sameContract.length} → ${sameContractPriceable.length} priceable (dropped ${droppedDegenerate} degenerate)`);
  if (gaps.length > 0) {
    console.log('');
    console.log(`Median gap (priceable same-contract): ${(median(gaps) * 100).toFixed(1)}pp`);
    console.log(`Largest gap:                          ${(gaps[gaps.length - 1] * 100).toFixed(1)}pp`);
    console.log(`Gaps that beat fees (>9pp):           ${beatsFees}`);
    console.log(`  └─ confirmed arbitrage after triage: ${confirmedArbTotal}`);
    console.log(`Triage of fee-clearing gaps: ${JSON.stringify(triageCounts)}`);
    console.log('\nDistribution (priceable same-contract gaps):');
    console.log(asciiHistogram(gaps));
    console.log('\nSensitivity (by liquidity floor):');
    for (const s of sensitivity) {
      console.log(`  ${s.label.padEnd(16)} poly ${String(s.polymarket).padStart(5)} × kalshi ${String(s.kalshi).padStart(5)} → ${String(s.sameContractPriceable).padStart(3)} pairs, median ${s.medianGapPp.toFixed(1)}pp, >9pp ${s.gapsAbove9pp}, confirmed ${s.confirmedArb}`);
    }
  } else {
    console.log('\nNo priceable same-contract pairs — no clean gap to measure.');
  }
  console.log('\nArtifacts written:');
  console.log(`  ${OUT_DIR}/efficiency-study.json`);
  console.log(`  ${OUT_DIR}/gap-map.csv`);
  console.log(`  markets.db → study run #${runId}`);
}

main().catch((err) => {
  console.error('Study failed:', err);
  process.exit(1);
});
