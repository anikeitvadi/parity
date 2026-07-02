const BASE = '/api';

/**
 * Static portfolio mode. Built with VITE_STATIC=true, the SPA reads frozen snapshot assets
 * bundled under <base>/snapshot/ and NEVER calls the live /api server — so the public deploy
 * needs no backend, no DB, and no API keys. Live/dev (flag unset) is unchanged. The snapshot
 * files are produced by scripts/snapshot.ts after the verification corpus is locked.
 */
export const IS_STATIC = import.meta.env.VITE_STATIC === 'true';
const SNAP = `${import.meta.env.BASE_URL}snapshot`;

/** Read a frozen snapshot asset. In static mode we must never fall through to /api, so a
 *  missing or unreadable file degrades to `fallback` (warned) rather than hitting the network. */
async function snap<T>(file: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${SNAP}/${file}`);
    if (res.ok) return (await res.json()) as T;
    console.warn(`[static] snapshot ${file}: HTTP ${res.status} — using fallback`);
  } catch (e) {
    console.warn(`[static] snapshot ${file} unreadable — using fallback`, e);
  }
  return fallback;
}

export interface Market {
  id: string;
  platform: string;
  question: string;
  outcomes: string[];
  prices: Record<string, number>;
  closeDate: string;
  volume?: number;
  liquidity?: number;
  metadata?: Record<string, unknown>;
}

export interface Source {
  platform: string;
  query: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt?: string;
  fetchedAt: string;
  retrievalMethod: string;
  confidence: number;
}

export interface MarketDetailResponse {
  market: Market;
  sources?: Source[];
  crossPlatform?: {
    matchedId: string;
    matchedPlatform: string;
    confidence: number;
    method: string;
    matchedMarket: { question: string; prices: Record<string, number> } | null;
  };
  settlement?: {
    similarity: { question: number; criteria: number; timing: number; dataSource: number; overall: number };
    safeForArbitrage: boolean;
    riskFactors: string[];
  };
  priceHistory?: { timestamp: number; data: { prices: Record<string, number> } }[];
  metaculus?: {
    title: string;
    prediction: number;
    marketPrice: number;
    divergence: number;
    confidence: number;
  };
}

export interface Opportunity {
  id: number;
  opportunity_id: string;
  type: string;
  platform: string;
  market_id: string;
  market_question: string;
  gross_edge: number;
  net_edge: number;
  score: number;
  position_size: number;
  position_percent: number;
  liquidity: number;
  detected_at: number;
  close_date: string | null;
  score_breakdown: string;
}

export async function fetchMarkets(params: {
  platform?: string;
  search?: string;
  category?: string;
  limit?: number;
}): Promise<{ markets: Market[]; total: number; categories: string[] }> {
  if (IS_STATIC) return snap('markets.json', { markets: [], total: 0, categories: [] });
  const qs = new URLSearchParams();
  if (params.platform) qs.set('platform', params.platform);
  if (params.search) qs.set('search', params.search);
  if (params.category) qs.set('category', params.category);
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await fetch(`${BASE}/markets?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch markets: ${res.status}`);
  return res.json();
}

let _detailCache: Record<string, MarketDetailResponse> | null = null;
export async function fetchMarketDetail(
  platform: string,
  id: string
): Promise<MarketDetailResponse> {
  if (IS_STATIC) {
    _detailCache ??= await snap('market-details.json', {} as Record<string, MarketDetailResponse>);
    const detail = _detailCache[`${platform}:${id}`];
    if (detail) return detail;
    throw new Error(`No snapshot detail for ${platform}:${id}`); // local error — never falls back to /api
  }
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(id)}?platform=${platform}`);
  if (!res.ok) throw new Error(`Failed to fetch market: ${res.status}`);
  return res.json();
}

export interface WatchlistItem {
  id: string;
  type: string;
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  insight: string;
  category?: string;
}

export interface WatchlistResult {
  opportunities: WatchlistItem[];
  cached: boolean;
  stats?: Record<string, number>;
}

export async function scanForEdges(type?: string): Promise<WatchlistResult> {
  if (IS_STATIC) return snap('scan.json', { opportunities: [], cached: true });
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);

  const res = await fetch(`${BASE}/opportunities/scan?${qs}`);
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
  return res.json();
}

export interface FeedItem {
  id: string;
  platform: string;
  marketId: string;
  marketQuestion: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closeDate?: string;
  category?: string;
  type: WatchlistItem['type'] | null;
  signal: number | null;
  divergence: number | null;
  matchedPlatform?: string;
  matchConfidence?: number;
}

export async function fetchFeed(): Promise<{ items: FeedItem[]; cached: boolean }> {
  if (IS_STATIC) return snap('feed.json', { items: [], cached: true });
  const res = await fetch(`${BASE}/opportunities/feed`);
  if (!res.ok) throw new Error(`Feed failed: ${res.status}`);
  return res.json();
}

// ── Cross-platform PAIR terminal ──────────────────────────────────────────────────────────────
export type PairStatus = 'survivor' | 'same_contract' | 'spec_mismatch' | 'topical' | 'stale';
export interface PairSide {
  id: string;
  title: string;
  yes: number; // 0..1, oriented so both sides mean the same YES
  volume: number;
  live: boolean; // refreshed against the live universe (vs the study snapshot)
}
export interface PairRow {
  id: string;
  event: string;
  polymarket: PairSide;
  kalshi: PairSide;
  yesAligned: boolean;
  gap: number; // |polyYes − kalshiYes|, oriented
  feeFloor: number; // round-trip fee floor (e.g. 0.09)
  beatsFees: boolean;
  cosine: number; // match confidence
  liquidity: number; // thinner-side volume
  status: PairStatus;
  strictSurvivor: boolean; // passed all 7 contract checks
  liquidityTier?: string;
  checklist?: Record<string, boolean | string>;
  corrected: boolean; // a false-positive verdict reclassified by the correction overlay
  correctionReason?: string;
  correctionSource?: string;
  reason: string; // verifier rationale
  category?: string;
  verifiedAt: string; // when the verdict was produced
  pricesLive: boolean; // both sides currently live
}
export interface PairsVerification {
  model: string;
  promptVersion: string;
  verdictCount: number;
}
export interface PairsMeta {
  verifiedAt: string | null;
  feeFloor: number;
  total: number;
  shown: number;
  live: number;
  counts: Record<PairStatus, number>;
  verification?: PairsVerification | null;
}
export interface PairsResponse {
  pairs: PairRow[];
  meta: PairsMeta;
}

const EMPTY_PAIRS_META: PairsMeta = {
  verifiedAt: null,
  feeFloor: 0.09,
  total: 0,
  shown: 0,
  live: 0,
  counts: { survivor: 0, same_contract: 0, spec_mismatch: 0, topical: 0, stale: 0 },
  verification: null,
};

/** Fetch the FULL verified-pair set once; the terminal filters/sorts client-side so chips are
 *  instant and static mode behaves identically. */
export async function fetchPairs(): Promise<PairsResponse> {
  if (IS_STATIC) return snap('pairs.json', { pairs: [], meta: EMPTY_PAIRS_META });
  const res = await fetch(`${BASE}/opportunities/pairs?includeStale=true&includeTopical=true&limit=6000`);
  if (!res.ok) throw new Error(`Pairs failed: ${res.status}`);
  return res.json();
}

export interface LiveSide {
  found: boolean; // the market still exists on the venue
  active: boolean; // still trading (not closed/settled)
  yes: number | null; // current YES (raw, as the venue quotes it — orient client-side)
  volume: number | null;
  hasBook: boolean; // a live order book (real ask); false ⇒ the quote is a stale last-trade
}
export interface PairLive {
  polymarket: LiveSide | null;
  kalshi: LiveSide | null;
  fetchedAt: string;
}

/** On-demand live price/liquidity for one pair — the dossier calls this on open so study-backed
 *  rows show CURRENT prices where the markets still trade. Static mode has no live backend. */
export async function fetchPairLive(polyId: string, kalshiId: string): Promise<PairLive | null> {
  if (IS_STATIC) return null;
  const res = await fetch(
    `${BASE}/opportunities/pair-live?poly=${encodeURIComponent(polyId)}&kalshi=${encodeURIComponent(kalshiId)}`
  );
  if (!res.ok) throw new Error(`pair-live failed: ${res.status}`);
  return res.json();
}

export interface HistoryPoint { timestamp: number; yes: number }
export interface PairHistory { polymarket: HistoryPoint[]; kalshi: HistoryPoint[] }

/** Daily YES-price history for both venues (raw, unoriented — orient the Kalshi side client-side).
 *  Either series may be empty (honest "history unavailable"). */
export async function fetchPairHistory(polyId: string, kalshiId: string, days = 30): Promise<PairHistory | null> {
  if (IS_STATIC) return null;
  const res = await fetch(
    `${BASE}/opportunities/pair-history?poly=${encodeURIComponent(polyId)}&kalshi=${encodeURIComponent(kalshiId)}&days=${days}`
  );
  if (!res.ok) throw new Error(`pair-history failed: ${res.status}`);
  return res.json();
}

export interface EfficiencyPair {
  question: string;
  polymarketId?: string;
  kalshiId?: string;
  kalshiQuestion?: string;
  polymarketYes: number;
  kalshiYes: number;
  yesAligned?: boolean; // does poly-YES correspond to kalshi-YES, or kalshi-NO?
  gap: number;
  netAfterFees: number;
  priceable?: boolean; // both sides have a live, non-degenerate price
  similarity: number; // cosine on the rules-aware embedding
  sameCriteria?: boolean; // LLM verdict: same resolution criteria
  reason?: string; // LLM one-line rationale
  volume: number;
  polyVolume?: number;
  kalshiVolume?: number;
  category?: string; // Kalshi event category — for post-hoc slices
  triage?: string; // legacy triage label (superseded by triage_label)
  funnel_stage?: string; // which funnel stage this pair settled at
  triage_label?: string; // 'validated_same_contract' | 'semantic_survivor' | 'dropped_degenerate' | 'scope_mismatch' | 'entity_mismatch_rejected'
}

export interface EfficiencyCategorySlice {
  category: string;
  pairs: number;
  medianGapPp: number;
  maxGapPp: number;
  beatsFees: number;
}

export interface EfficiencySensitivityRow {
  floor: number;
  label: string;
  polymarket: number;
  kalshi: number;
  topicalOverlaps: number;
  sameContractPriceable: number;
  medianGapPp: number;
  p90GapPp: number;
  gapsAbove9pp: number;
  confirmedArb: number;
}

export interface EfficiencyStudy {
  generatedAt: string;
  // Full enumerated standalone universe (the denominator). Polymarket is a lower bound.
  universe: { polymarket: number; polymarketIsLowerBound?: boolean; kalshi: number; total: number };
  // The tradeable subset the gap analysis runs on (markets with a live price).
  tradeable?: { liquidityFloor: string; polymarket: number; kalshi: number; total: number };
  // The billion-scale comparison space the pipeline compresses (enumerated = lower bound).
  pairSpace?: { enumerated: number; enumeratedIsLowerBound?: boolean; tradeable: number };
  matching: {
    method?: string;
    embeddingModel?: string;
    verificationModel?: string;
    candidateThreshold?: number;
    candidates?: number;
    polyWithCandidates?: number; // poly markets with ≥1 candidate (= verdict count)
    topicalOverlaps: number; // same underlying event (LLM-verified)
    sameContract: number; // same resolution criteria
    sameContractPriceable: number; // + live price both sides (gap-distribution basis)
    droppedDegenerate?: number; // same-contract pairs dropped for a degenerate price
  };
  fees: { polymarket: number; kalshi: number; roundTrip: number };
  gapDistribution: { medianGap: number; meanGap: number; p90Gap: number; maxGap: number };
  actionable: {
    surfaced_3pp: number;
    beatsFees_9pp: number;
    meetsDetectorThreshold_19pp: number;
    confirmedArbAfterTriage?: number; // fee-clearing gaps that survive triage as real
  };
  // The locked 11-stage compression funnel: tradeable universe → 0 clear executable arb.
  funnel?: {
    tradeable: number;
    candidates: number;
    sameEvent: number;
    sameContract: number;
    priceable: number;
    feeClearing: number;
    semanticSurvivors: number;
    liquidSurvivors: number;
    strictSpecSurvivors: number;
    deepStrictSurvivors: number;
    clearExecutableArb: number;
  };
  // One-line honest finding — never asserts risk-free / executable arbitrage.
  claim?: string;
  triage?: { counts: Record<string, number>; confirmedArb: number };
  // Verification provenance + completeness — the Lab publishes headlines only when verifierComplete.
  verification?: {
    transport: string;
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: number;
    status: string;
    verifierComplete: boolean;
    polyWithCandidates: number;
    cachedVerdicts: number;
    verifiedThisRun: number;
    missingVerdicts: number;
    provenance: { provider: string; model: string; n: number }[];
    mixedModel: boolean;
  };
  // Recall audit: the cosine rank of each confirmed match. recall@1/@5 from the histogram.
  recall?: { matchRankHistogram: number[]; recallAt1: number; recallAt5: number };
  sensitivity?: EfficiencySensitivityRow[];
  categorySlices?: EfficiencyCategorySlice[];
  pairs: EfficiencyPair[];
}

export async function fetchEfficiencyStudy(): Promise<{ available: boolean; study?: EfficiencyStudy }> {
  if (IS_STATIC) return snap('efficiency-study.json', { available: false });
  const res = await fetch(`${BASE}/lab/efficiency`);
  if (!res.ok) throw new Error(`Lab fetch failed: ${res.status}`);
  return res.json();
}

/** The strict spec-match audit of the liquid (>$500) semantic survivors — the 7-point
 *  checklist that culls 83 → 44, plus the deepest residuals. spec_match means same
 *  contract, NOT executable arbitrage (no order-book depth / slippage / timing proven). */
export interface StrictSurvivorChecklist {
  same_event: boolean;
  same_entity: boolean;
  same_window: boolean;
  same_line: boolean;
  same_settlement: boolean;
  same_direction: boolean;
  same_structure: boolean;
  spec_match: boolean;
  spec_mismatch_reason: string;
}
export interface StrictSurvivorPair {
  polymarketId: string;
  kalshiId: string;
  polymarketQuestion: string;
  kalshiQuestion: string;
  category?: string;
  gap: number;
  thinnerSideVolume: number;
  liquidity_tier: string; // '>500' | '>1k' | '>5k' | '>10k'
  semantic_survivor: boolean;
  liquid_semantic_survivor: boolean;
  spec_match: boolean;
  spec_mismatch_reason: string;
  strict_survivor: boolean;
  checklist: StrictSurvivorChecklist;
}
export interface StrictSurvivors {
  generatedAt: string;
  model: string;
  floor: number;
  semanticSurvivors: number;
  liquidSemanticSurvivors: number;
  strictSurvivors: number;
  strictSurvivorsByTier: Record<string, number>; // gt500 / gt1k / gt5k / gt10k
  specMismatchReasons: Record<string, number>;
  caveat: string;
  pairs: StrictSurvivorPair[];
}

export async function fetchStrictSurvivors(): Promise<{ available: boolean; data?: StrictSurvivors }> {
  if (IS_STATIC) return snap('strict-survivors.json', { available: false });
  const res = await fetch(`${BASE}/lab/strict-survivors`);
  if (!res.ok) throw new Error(`Strict-survivors fetch failed: ${res.status}`);
  return res.json();
}

export interface CorrectionEntry {
  polymarketId: string;
  kalshiId: string;
  original_verdict: string;
  corrected_verdict: string;
  correction_reason: string;
  correction_source: string;
}
export interface Corrections {
  generatedAt: string;
  corrections: CorrectionEntry[];
  summary: {
    total: number;
    bySource: { strict_reverify: number; deterministic_rule: number };
    survivorsReclassified: number;
    correctedSemanticSurvivors: number;
    clearExecutableArbChanged: boolean;
  };
}

/** The correction overlay — false-positive verdicts reclassified after the scan (Lab + Scanner). */
export async function fetchCorrections(): Promise<{ available: boolean; data?: Corrections }> {
  if (IS_STATIC) return snap('corrections.json', { available: false });
  const res = await fetch(`${BASE}/lab/corrections`);
  if (!res.ok) return { available: false };
  return res.json();
}

export function streamResearch(
  platform: string,
  id: string,
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): () => void {
  if (IS_STATIC) return streamResearchStatic(platform, id, onToken, onDone);
  const url = `${BASE}/markets/${encodeURIComponent(id)}/research?platform=${platform}`;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        try {
          const json = JSON.parse(body);
          onError(json.error || `HTTP ${res.status}`);
        } catch {
          onError(`HTTP ${res.status}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onError('No response body'); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') { onDone(); return; }
          if (data.startsWith('[ERROR]')) { onError(data.slice(8)); return; }
          onToken(data);
        }
      }

      onDone();
    } catch (err) {
      if (!controller.signal.aborted) {
        onError(err instanceof Error ? err.message : 'Connection failed');
      }
    }
  })();

  return () => controller.abort();
}

// ── Static portfolio mode: cached-brief replay + calibration + snapshot meta ──────────────

let _briefCache: Record<string, string> | null = null;
/** Replay a cached research brief, faux-streamed word-by-word to preserve the terminal "typing" feel. */
function streamResearchStatic(
  platform: string,
  id: string,
  onToken: (text: string) => void,
  onDone: () => void
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  void (async () => {
    _briefCache ??= await snap('briefs.json', {} as Record<string, string>);
    const text = _briefCache[`${platform}:${id}`] ?? '';
    const tokens = text ? text.match(/\S+\s*/g) ?? [text] : [];
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      if (i >= tokens.length) {
        onDone();
        return;
      }
      onToken(tokens[i++]);
      timer = setTimeout(tick, 12);
    };
    tick();
  })();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export interface CalibrationBucket {
  range: string;
  midpoint: number;
  forecasts: number;
  outcomes: number;
  observedFrequency: number;
}
export interface CalibrationStats {
  totalForecasts: number;
  resolvedForecasts: number;
  meanBrierScore: number | null;
  assessment: string;
  calibrationCurve: CalibrationBucket[];
}
export interface ForecastInput {
  marketId: string;
  platform: string;
  marketQuestion: string;
  forecastProbability: number;
  marketPrice: number;
  category?: unknown;
}

const EMPTY_STATS: CalibrationStats = {
  totalForecasts: 0,
  resolvedForecasts: 0,
  meanBrierScore: null,
  assessment: '',
  calibrationCurve: [],
};

export async function fetchCalibrationStats(): Promise<CalibrationStats> {
  if (IS_STATIC) return snap('calibration-stats.json', EMPTY_STATS);
  const res = await fetch(`${BASE}/calibration/stats`);
  if (!res.ok) return EMPTY_STATS;
  return res.json();
}

const LOCAL_FORECASTS_KEY = 'pms-local-forecasts';
/** In static mode there is no server to write to, so a logged forecast persists to localStorage. */
export async function submitForecast(input: ForecastInput): Promise<{ ok: boolean }> {
  if (IS_STATIC) {
    try {
      const prev = JSON.parse(localStorage.getItem(LOCAL_FORECASTS_KEY) ?? '[]') as unknown[];
      prev.push({ ...input, at: new Date().toISOString() });
      localStorage.setItem(LOCAL_FORECASTS_KEY, JSON.stringify(prev));
    } catch {
      /* localStorage unavailable — silently no-op */
    }
    return { ok: true };
  }
  const res = await fetch(`${BASE}/calibration/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: res.ok };
}

export interface SnapshotMeta {
  generatedAt: string;
  feedCount?: number;
  markets?: number;
  note?: string;
}
/** Metadata behind the "frozen snapshot · captured <date>" badge. Static mode only; null when live. */
export async function getSnapshotMeta(): Promise<SnapshotMeta | null> {
  if (!IS_STATIC) return null;
  return snap<SnapshotMeta | null>('snapshot-meta.json', null);
}
