/**
 * Market Efficiency Study — Experiment 1: Cross-platform price gaps
 *
 * The headline question: can a retail trader arbitrage Polymarket vs Kalshi?
 *
 * Method (mirrors the live /feed pipeline, so the study and the app agree):
 *   1. Pull live active markets from both public APIs (no auth required).
 *   2. Embed every market question (OpenAI text-embedding-3-small, 1536-dim).
 *   3. Match the same event across platforms by cosine similarity >= 0.85.
 *   4. For each matched pair, measure the YES-price gap and check whether it
 *      survives platform fees (Polymarket 2% + Kalshi 7% = 9% round-trip).
 *
 * The output is the distribution itself — not a verdict. Whatever it says,
 * it says. Run: `npm run study`.
 *
 * Artifacts:
 *   docs/data/efficiency-study.json  full summary + every matched pair
 *   docs/data/gap-map.csv            one row per pair (for the Gap Map chart)
 */

import '../src/config/env.js'; // side-effect: dotenv.config()
import { writeFileSync, mkdirSync } from 'fs';
import { PolymarketClient } from '../src/services/polymarket.js';
import { KalshiClient } from '../src/services/kalshi.js';
import { getDatabase, initDatabase } from '../src/database/schema.js';
import {
  initEmbeddingTable,
  embedMarkets,
  findSemanticMatches,
} from '../src/services/semantic-matcher.js';
import { EMBEDDING_MODEL } from '../src/services/embedding.js';
import {
  persistStudyRun,
  type StudyMarketRecord,
  type StudyPairRecord,
} from '../src/database/study-store.js';
import type { Market } from '../src/types/market.js';

/** Platform fees, round-trip — matches detectors/cross-platform-arb.ts. */
const POLYMARKET_FEE = 0.02;
const KALSHI_FEE = 0.07;
const ROUND_TRIP_FEES = POLYMARKET_FEE + KALSHI_FEE; // 0.09

/** Cosine threshold for "same event" — matches semantic-matcher.ts. */
const SIMILARITY_THRESHOLD = 0.85;

const OUT_DIR = 'docs/data';

interface PairRow {
  question: string;
  polymarketId: string;
  kalshiId: string;
  kalshiQuestion: string;
  polymarketYes: number;
  kalshiYes: number;
  gap: number; // |poly - kalshi|, the gross edge before fees
  netAfterFees: number; // gap - round-trip fees, floored at 0
  similarity: number;
  volume: number;
}

function getYesPrice(market: Market): number {
  return (
    market.prices['Yes'] ??
    market.prices['yes'] ??
    Object.values(market.prices)[0] ??
    0.5
  );
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

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'OPENAI_API_KEY is required for embedding-based matching. Aborting.'
    );
    process.exit(1);
  }

  console.log('Market Efficiency Study — Experiment 1: cross-platform gaps\n');

  // 1. Live fetch from both public APIs.
  console.log('Fetching live markets…');
  const polyClient = new PolymarketClient();
  const kalshiClient = new KalshiClient();
  const [polyMarkets, kalshiMarkets] = await Promise.all([
    polyClient.getAllActiveMarkets(),
    kalshiClient.getAllActiveMarkets(),
  ]);
  console.log(
    `  Polymarket: ${polyMarkets.length} active markets`
  );
  console.log(`  Kalshi:     ${kalshiMarkets.length} active markets`);
  const totalMarkets = polyMarkets.length + kalshiMarkets.length;

  if (polyMarkets.length === 0 || kalshiMarkets.length === 0) {
    console.error('One platform returned zero markets — cannot match. Aborting.');
    process.exit(1);
  }

  // 2 + 3. Embed and match (same calls the /feed endpoint uses).
  console.log('\nEmbedding questions and matching across platforms…');
  initDatabase();
  const db = getDatabase();
  initEmbeddingTable(db);
  await embedMarkets(db, [...polyMarkets, ...kalshiMarkets]);
  const matches = findSemanticMatches(db, polyMarkets, kalshiMarkets);
  console.log(
    `  ${matches.length} matched pairs at cosine >= ${SIMILARITY_THRESHOLD}`
  );

  // 4. Measure the gap distribution.
  const pairs: PairRow[] = matches.map((m) => {
    const polyYes = getYesPrice(m.polymarket);
    const kalshiYes = getYesPrice(m.kalshi);
    const gap = Math.abs(polyYes - kalshiYes);
    return {
      question: m.polymarket.question,
      polymarketId: m.polymarket.id,
      kalshiId: m.kalshi.id,
      kalshiQuestion: m.kalshi.question,
      polymarketYes: polyYes,
      kalshiYes,
      gap,
      netAfterFees: Math.max(0, gap - ROUND_TRIP_FEES),
      similarity: m.similarity,
      volume: Math.max(m.polymarket.volume || 0, m.kalshi.volume || 0),
    };
  });

  const gaps = pairs.map((p) => p.gap).sort((a, b) => a - b);
  const mean = gaps.length
    ? gaps.reduce((s, g) => s + g, 0) / gaps.length
    : 0;

  const beatsFees = pairs.filter((p) => p.gap > ROUND_TRIP_FEES).length;
  const surface3pp = pairs.filter((p) => p.gap >= 0.03).length; // what the app surfaces
  const meetsDetector = pairs.filter((p) => p.gap >= 0.19).length; // detector's 10% net edge

  const summary = {
    generatedAt: new Date().toISOString(),
    universe: {
      polymarket: polyMarkets.length,
      kalshi: kalshiMarkets.length,
      total: totalMarkets,
    },
    matching: {
      similarityThreshold: SIMILARITY_THRESHOLD,
      matchedPairs: matches.length,
      embeddingModel: EMBEDDING_MODEL,
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
    },
    pairs: pairs.sort((a, b) => b.gap - a.gap),
  };

  // Write artifacts.
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    `${OUT_DIR}/efficiency-study.json`,
    JSON.stringify(summary, null, 2)
  );
  const csv = [
    'polymarket_id,kalshi_id,question,polymarket_yes,kalshi_yes,gap,net_after_fees,similarity,volume',
    ...pairs.map(
      (p) =>
        `${JSON.stringify(p.polymarketId)},${JSON.stringify(p.kalshiId)},${JSON.stringify(
          p.question
        )},${p.polymarketYes.toFixed(4)},${p.kalshiYes.toFixed(4)},${p.gap.toFixed(
          4
        )},${p.netAfterFees.toFixed(4)},${p.similarity.toFixed(4)},${Math.round(p.volume)}`
    ),
  ].join('\n');
  writeFileSync(`${OUT_DIR}/gap-map.csv`, csv);

  // Persist the same records to SQLite so the match is inspectable, not a vibe:
  // a self-describing run row + universe snapshot + matched pairs with gap math.
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
    similarityThreshold: SIMILARITY_THRESHOLD,
    roundTripFees: ROUND_TRIP_FEES,
    universe: summary.universe,
    markets: universeSnapshot,
    pairs: pairRecords,
  });

  // Print the finding.
  console.log('\n────────────────────────────────────────────────────────');
  console.log('FINDING — cross-platform price gap distribution');
  console.log('────────────────────────────────────────────────────────');
  console.log(`Universe:          ${totalMarkets} live markets`);
  console.log(`Matched pairs:     ${matches.length} (same event, both platforms)`);
  if (gaps.length > 0) {
    console.log(`Median gap:        ${(median(gaps) * 100).toFixed(1)}pp`);
    console.log(`Mean gap:          ${(mean * 100).toFixed(1)}pp`);
    console.log(`90th percentile:   ${(percentile(gaps, 90) * 100).toFixed(1)}pp`);
    console.log(`Largest gap:       ${(gaps[gaps.length - 1] * 100).toFixed(1)}pp`);
    console.log('');
    console.log(`Gaps the app surfaces (>3pp):     ${surface3pp}`);
    console.log(`Gaps that beat fees (>9pp):       ${beatsFees}  ← actionable`);
    console.log(`Gaps meeting detector (>19pp):    ${meetsDetector}`);
    console.log('\nDistribution:');
    console.log(asciiHistogram(gaps));
  }
  console.log('\nArtifacts written:');
  console.log(`  ${OUT_DIR}/efficiency-study.json`);
  console.log(`  ${OUT_DIR}/gap-map.csv`);
  console.log(`  markets.db → study run #${runId} (study_runs / study_markets / study_pairs)`);
}

main().catch((err) => {
  console.error('Study failed:', err);
  process.exit(1);
});
