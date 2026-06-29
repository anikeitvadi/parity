/**
 * Rules-aware, LLM-verified cross-platform matcher.
 *
 * The title-only cosine matcher (semantic-matcher.ts, threshold 0.85) is
 * high-precision but low-recall: equivalent events named differently are missed.
 * Example — Polymarket "Clarity Act signed into law in 2026?" vs Kalshi "Will
 * crypto market structure legislation become law? · Before 2027" score 0.41 on
 * titles, so they never match, even though they're the same event.
 *
 * This matcher trades the single threshold for a two-stage pipeline:
 *   1. Embed title + outcome + resolution rules, generate CANDIDATES at a low bar.
 *   2. LLM-verify each candidate: same underlying event? same resolution criteria
 *      (so a YES on one implies a YES on the other)?
 *
 * It yields two honest numbers — topical overlaps (same event) vs same-contract
 * (same criteria). The gap between them is the real finding: the same event is
 * often not the same contract.
 *
 * @module services/cross-platform-matcher
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { EMBEDDING_MODEL } from './embedding.js';
import { embedTextsCached, type EmbedCacheStats } from './embedding-cache.js';
import {
  ensureVerdictTable,
  getVerdict,
  putVerdict,
  verdictKey,
  type MarketVerdict,
} from './verdict-cache.js';
import { getDatabase } from '../database/schema.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { logger } from '../utils/logger.js';
import type { Market } from '../types/market.js';
import {
  prepareBatchChunks,
  submitNextChunk,
  loadManifests,
  batchProgress,
  openaiBatchClient,
  type BatchRequest,
} from './verifier-batch.js';

const log = logger.child({ component: 'xplatform-matcher' });

// Bump when the verification prompt changes — invalidates the verdict cache so
// stale verdicts from an older prompt aren't reused.
const PROMPT_VERSION = 'v3-market-level';

/**
 * Verifier provider. Defaults to OpenAI gpt-4o-mini (the model the published
 * numbers should use — keep it consistent). Set VERIFY_PROVIDER=grok for an
 * exploratory/dev run on a separate quota; every verdict records its model so a
 * mixed corpus is never silently published.
 */
/** A provider-agnostic verifier: send a system + user prompt, get back raw text. */
export interface Verifier {
  provider: string;
  model: string;
  complete: (system: string, user: string, maxTokens: number) => Promise<string>;
  /** Rate/cost limits for this provider+model (preflight planning + pacing + failure report). */
  limits: VerifierLimits;
  /** Versioning that scopes the verdict cache + the published corpus. */
  promptVersion: string;
  schemaVersion: number;
}

/** Per-(provider, model) limits used for preflight planning and the failure report. */
export interface VerifierLimits {
  rpm: number;             // requests/min ceiling (provider tier)
  tpm: number;             // tokens/min ceiling (input+output budget)
  rpd: number | null;      // requests/day ceiling, or null if the model has none at this tier
  costPer1kInput: number;  // USD / 1k input tokens  (approximate, ~Jan 2026)
  costPer1kOutput: number; // USD / 1k output tokens
  maxConcurrency: number;  // max in-flight verification requests
}

/** Output-shape version of MarketVerdict; bump to invalidate all cached verdicts. */
export const SCHEMA_VERSION = 1;

/**
 * Per-(provider, model) limits + per-1k-token costs. Numbers are conservative
 * OpenAI Tier-1 / Anthropic Start-tier defaults (the tier that hits a 10k RPD wall);
 * every field is env-overridable for higher tiers. Costs are approximate (~Jan 2026),
 * used only for preflight budgeting — not billing.
 */
const MODEL_LIMITS: Record<string, VerifierLimits> = {
  // OpenAI mini/nano class — 10k RPD at Tier 1 (the wall); a DIFFERENT model = fresh bucket.
  'gpt-4o-mini':      { rpm: 500, tpm: 200_000, rpd: 10_000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxConcurrency: 16 },
  'gpt-4.1-mini':     { rpm: 500, tpm: 200_000, rpd: 10_000, costPer1kInput: 0.0004,  costPer1kOutput: 0.0016, maxConcurrency: 16 },
  'gpt-4.1-nano':     { rpm: 500, tpm: 200_000, rpd: 10_000, costPer1kInput: 0.0001,  costPer1kOutput: 0.0004, maxConcurrency: 16 },
  // OpenAI full models — NO RPD at any tier; gated by a low Tier-1 TPM instead.
  'gpt-4o':           { rpm: 500, tpm: 30_000,  rpd: null,   costPer1kInput: 0.0025,  costPer1kOutput: 0.01,   maxConcurrency: 8 },
  'gpt-4.1':          { rpm: 500, tpm: 30_000,  rpd: null,   costPer1kInput: 0.002,   costPer1kOutput: 0.008,  maxConcurrency: 8 },
  // Anthropic — token-bucket only, no RPD.
  'claude-haiku-4-5': { rpm: 1000, tpm: 2_000_000, rpd: null, costPer1kInput: 0.001,  costPer1kOutput: 0.005, maxConcurrency: 16 },
  // xAI Grok — no documented RPD (verify in console).
  'grok-3-mini-fast': { rpm: 1000, tpm: 2_000_000, rpd: null, costPer1kInput: 0.0006, costPer1kOutput: 0.004, maxConcurrency: 16 },
};

const DEFAULT_LIMITS: VerifierLimits = { rpm: 450, tpm: 100_000, rpd: 10_000, costPer1kInput: 0.0005, costPer1kOutput: 0.0015, maxConcurrency: 8 };
const numEnv = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

/** Resolve limits for a model, with env overrides (VERIFY_RPM/TPM/RPD/COST_IN/COST_OUT/MAX_CONCURRENCY). */
export function verifierLimits(model: string): VerifierLimits {
  const base = MODEL_LIMITS[model] ?? DEFAULT_LIMITS;
  const rpdRaw = process.env.VERIFY_RPD;
  return {
    rpm: numEnv('VERIFY_RPM', base.rpm),
    tpm: numEnv('VERIFY_TPM', base.tpm),
    rpd: rpdRaw === undefined ? base.rpd : rpdRaw === '' || rpdRaw === '0' ? null : Number(rpdRaw),
    costPer1kInput: numEnv('VERIFY_COST_IN', base.costPer1kInput),
    costPer1kOutput: numEnv('VERIFY_COST_OUT', base.costPer1kOutput),
    maxConcurrency: numEnv('VERIFY_MAX_CONCURRENCY', base.maxConcurrency),
  };
}

export function verifierConfig(): Verifier {
  const provider = (process.env.VERIFY_PROVIDER || 'openai').toLowerCase();

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('VERIFY_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set');
    // claude-haiku-4-5 is the minimal Claude tier — ample for picking the same
    // contract among a handful of candidates (see the validation groups).
    const model = process.env.VERIFY_MODEL || 'claude-haiku-4-5';
    const client = new Anthropic({ apiKey });
    return {
      provider,
      model,
      limits: verifierLimits(model),
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      complete: async (system, user, maxTokens) => {
        const res = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        });
        const block = res.content.find((b) => b.type === 'text');
        return block && block.type === 'text' ? block.text : '';
      },
    };
  }

  // OpenAI-shaped providers (OpenAI proper, or Grok via its OpenAI-compatible API).
  let client: OpenAI;
  let model: string;
  if (provider === 'grok') {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('VERIFY_PROVIDER=grok but XAI_API_KEY is not set');
    client = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
    model = process.env.VERIFY_MODEL || 'grok-3-mini-fast';
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY required for verification');
    client = new OpenAI({ apiKey });
    model = process.env.VERIFY_MODEL || 'gpt-4o-mini';
  }
  return {
    provider,
    model,
    limits: verifierLimits(model),
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    complete: async (system, user, maxTokens) => {
      const res = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      return res.choices[0]?.message?.content || '{}';
    },
  };
}

// LLM chat-completions are RPM-capped (tier-1 gpt-4o-mini = 500/min). A single
// shared limiter paces every call to 450/min and retries 429s with backoff, so
// high concurrency can't melt the per-minute budget. (The DAILY cap is handled
// separately — see isDailyQuotaError — because retrying a daily 429 is futile.)
// Retry transient 429s (RPM/TPM), but fail fast on a quota-stop (daily/billing) so
// the run halts cleanly instead of spending the rest of the bucket on dead retries.
const llmLimiter = new RateLimiter(450, 60_000, 0, 'llm-verify', (err) => quotaStopKind(err) === null);

/** Why a 429 cannot be fixed by retrying — must stop the run cleanly. */
type QuotaStopKind = 'daily_quota' | 'billing' | null;

/**
 * Classify a verification error: returns the quota-stop reason for a 429 that
 * retrying cannot fix (daily RPD cap, or billing/credits), else null (transient
 * RPM/TPM or server error — safe to retry). Prefers structured status/code/type,
 * falling back to a message regex.
 */
function quotaStopKind(err: unknown): QuotaStopKind {
  const e = err as { status?: number; message?: string; code?: string; error?: { type?: string; code?: string } };
  const code = e?.code || e?.error?.code || e?.error?.type || '';
  const msg = String(e?.message || err || '');
  // Billing / credits exhausted (OpenAI insufficient_quota, Anthropic billing_error) — terminal.
  if (code === 'insufficient_quota' || code === 'billing_error' || /exceeded your current quota|check your plan and billing/i.test(msg)) {
    return 'billing';
  }
  // Requests-per-day (RPD) cap — futile until the daily reset.
  if (/per day|\bRPD\b|requests per day/i.test(msg)) return 'daily_quota';
  return null;
}

/** A 429 that retrying won't fix (daily-cap or billing). */
function isDailyQuotaError(err: unknown): boolean {
  return quotaStopKind(err) !== null;
}

/** Raised to stop the verification loop cleanly when the daily quota is exhausted. */
class DailyQuotaExhausted extends Error {}

/** The planned verification work, surfaced by preflight before any quota is spent. */
export interface VerifyPlan {
  polyWithCandidates: number;
  candidatePairs: number;
  cachedVerdicts: number;
  missingVerdicts: number;
  estCostUsd: number;
  estRuntimeMin: number;
  rpd: number | null;
}

/** Raised when preflight determines the run can't finish under its caps (and partial isn't allowed). */
export class PreflightAborted extends Error {
  constructor(public plan: VerifyPlan, public reason: string) {
    super(`preflight refused: ${reason}`);
  }
}

/** Raised after a batch is submitted: verification is async — poll + import, then re-run to finish. */
export class BatchSubmitted extends Error {
  constructor(public progress: ReturnType<typeof batchProgress>, public requestCount: number) {
    super('verification submitted to the Batch API');
  }
}

interface MarketMeta {
  subtitle?: string;
  rules?: string;
  description?: string;
}

/** The text the matcher embeds: question + outcome label + resolution rules. */
export function marketEmbedText(m: Market): string {
  const md = (m.metadata ?? {}) as MarketMeta;
  const parts = [m.question, md.subtitle, md.rules || md.description].filter(Boolean) as string[];
  return parts.join('. ').slice(0, 2000);
}

export interface VerifiedPair {
  polymarket: Market;
  kalshi: Market;
  cosine: number;
  sameEvent: boolean;
  sameCriteria: boolean;
  /**
   * Does a YES on the Polymarket side correspond to YES on the Kalshi side
   * (true), or to NO (false)? Opposite-orientation pairs — e.g. "Brazil
   * advances" vs "Japan advances" in the same match — are the same event but
   * inverted, so the gap must compare poly-YES against (1 − kalshi-YES).
   */
  yesAligned: boolean;
  reason: string;
}

export interface VerifiedMatchResult {
  candidates: number; // candidate pairs generated (poly × topK)
  polyWithCandidates: number; // Polymarket markets that had ≥1 candidate (= verification requests needed)
  verifiedThisRun: number; // market-level LLM requests actually made this run
  cachedHits: number; // verdicts served from the persistent cache
  pairs: VerifiedPair[]; // same_event pairs, best per Polymarket market
  /** Histogram of the matched candidate's cosine rank (0 = top-1). Drives the recall audit. */
  matchRankHistogram: number[];
  quotaExhausted: boolean; // true if the daily LLM quota ran out mid-run (result is partial)
  embeddingModel: string;
  verifierModel: string;
  promptVersion: string;
}

/** L2-normalize each vector in place, so cosine similarity reduces to a dot product. */
function normalizeInPlace(vecs: Float32Array[]): void {
  for (const v of vecs) {
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
  }
}

/** Dot product of two equal-length vectors (== cosine when both are normalized). */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Embed many texts via the persistent cache (only genuinely new text hits the API). */
async function embedAll(texts: string[], stats?: EmbedCacheStats): Promise<Float32Array[]> {
  return embedTextsCached(texts, { stats });
}

function describe(m: Market): string {
  const md = (m.metadata ?? {}) as MarketMeta;
  const rules = (md.rules || md.description || '').replace(/\s+/g, ' ').slice(0, 700);
  return [
    `Question: ${m.question}`,
    md.subtitle ? `Outcome: ${md.subtitle}` : '',
    rules ? `Resolution: ${rules}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Market-level verification: ONE request per Polymarket market, with its top
 * Kalshi candidates inline, asking the model to pick the single best same-event
 * match (or none). This is ~topK× cheaper than verifying every pair and lets the
 * model compare candidates against each other, which improves precision.
 * Returns null on a transient failure (caller does NOT cache it → retried next
 * run); throws DailyQuotaExhausted on a daily-quota 429 (run stops cleanly).
 */
/** max_tokens for a market-level verdict — shared by the sync and batch transports. */
export const VERIFY_MAX_TOKENS = 160;

/**
 * Build the system+user messages for ONE market-level verdict. Shared by the sync
 * path and the batch JSONL generator so both transports send byte-identical prompts
 * → identical cache-key semantics → a consistent single-model corpus across transports.
 */
export function buildVerifyMessages(poly: Market, candidates: Market[]): { system: string; user: string } {
  const system = `You match ONE Polymarket market against several Kalshi candidate markets and pick the single best match, if any.
- match_index: 0-based index of the candidate that is the SAME underlying event, or null if none qualify.
- same_event: does the chosen candidate resolve on the SAME real-world event/outcome as Polymarket, ignoring wording?
- same_criteria: do they share the SAME resolution criteria, data source, and deadline, so YES↔YES is directly comparable? (Stricter. Different specific bills, thresholds, dates, sources, teams, offices, or jurisdictions → false. A mere YES/NO labeling difference does NOT break this — report via yes_aligned.)
- yes_aligned: does a YES on Polymarket correspond to YES on the chosen candidate (true) or NO (false)? Example: "Brazil advances" vs "Japan advances" are the same event but NOT aligned.
Be conservative: if no candidate is clearly the same event, return match_index null. Reply strict JSON only: {"match_index": <int or null>, "same_event": boolean, "same_criteria": boolean, "yes_aligned": boolean, "reason": "<=15 words"}.`;
  const cand = candidates.map((k, i) => `[${i}] ${describe(k)}`).join('\n\n');
  const user = `POLYMARKET:\n${describe(poly)}\n\nKALSHI CANDIDATES:\n${cand}`;
  return { system, user };
}

/**
 * Parse a raw market-level verdict response against the candidate list. Returns null
 * ONLY when the response is not valid JSON (the caller decides how to treat that —
 * the sync path retries, the batch importer flags it for manual review). Shared so
 * sync and batch coerce identically.
 */
export function parseMarketVerdict(raw: string, candidates: Market[]): MarketVerdict | null {
  let parsed: { match_index?: unknown; same_event?: unknown; same_criteria?: unknown; yes_aligned?: unknown; reason?: unknown };
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    return null;
  }
  const idx = typeof parsed.match_index === 'number' ? parsed.match_index : null;
  const chosen = idx !== null && idx >= 0 && idx < candidates.length ? candidates[idx] : null;
  return {
    matchedKalshiId: chosen ? chosen.id : null,
    sameEvent: !!chosen && !!parsed.same_event,
    sameCriteria: !!chosen && !!parsed.same_criteria,
    yesAligned: parsed.yes_aligned !== false,
    reason: String(parsed.reason || '').slice(0, 120),
  };
}

async function verifyMarket(
  verifier: Verifier,
  poly: Market,
  candidates: Market[]
): Promise<MarketVerdict | null> {
  const { system, user } = buildVerifyMessages(poly, candidates);
  try {
    // Through the shared limiter: paces to 450 RPM and retries per-minute 429s.
    const raw = await llmLimiter.execute(() => verifier.complete(system, user, VERIFY_MAX_TOKENS));
    return parseMarketVerdict(raw, candidates);
  } catch (err) {
    if (isDailyQuotaError(err)) throw new DailyQuotaExhausted();
    log.warn({ err }, 'market verification failed (transient — will retry next run)');
    return null;
  }
}


/** Run `fn` over `items` with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Find cross-platform matches via rules-aware embedding + LLM verification.
 * Embeds in-memory (does not touch the live market_embedding_meta cache).
 */
export async function findVerifiedMatches(
  polyMarkets: Market[],
  kalshiMarkets: Market[],
  opts: {
    candidateThreshold?: number;
    topKMax?: number;
    marginCos?: number;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<VerifiedMatchResult> {
  const candidateThreshold = opts.candidateThreshold ?? 0.68;
  const topKMax = opts.topKMax ?? 5;
  const marginCos = opts.marginCos ?? 0.08; // include candidates within this cosine of the best
  const concurrency = opts.concurrency ?? 8;

  const verifier = verifierConfig();
  const verifierModel = verifier.model;
  const verifierProvider = verifier.provider;
  const db = getDatabase();
  ensureVerdictTable(db);

  log.info({ poly: polyMarkets.length, kalshi: kalshiMarkets.length }, 'embedding (rules-aware, cached)…');
  const embStats: EmbedCacheStats = { hits: 0, misses: 0 };
  const polyEmb = await embedAll(polyMarkets.map(marketEmbedText), embStats);
  const kalshiEmb = await embedAll(kalshiMarkets.map(marketEmbedText), embStats);
  log.info({ hits: embStats.hits, misses: embStats.misses }, 'embedding cache result');
  // Normalize once so the O(poly × kalshi) candidate loop is a bare dot product.
  normalizeInPlace(polyEmb);
  normalizeInPlace(kalshiEmb);

  // Candidate generation, grouped per Polymarket market: the Kalshi markets above
  // the threshold, adaptively trimmed to those within `marginCos` of the best
  // (capped at topKMax). One verification request then handles a whole group.
  interface PolyGroup {
    poly: Market;
    cands: { kalshi: Market; cosine: number }[];
  }
  const groups: PolyGroup[] = [];
  let candidatePairCount = 0;
  for (let i = 0; i < polyMarkets.length; i++) {
    const scored: { j: number; c: number }[] = [];
    for (let j = 0; j < kalshiMarkets.length; j++) {
      const c = dot(polyEmb[i], kalshiEmb[j]);
      if (c >= candidateThreshold) scored.push({ j, c });
    }
    if (scored.length === 0) continue;
    scored.sort((a, b) => b.c - a.c);
    const top = scored[0].c;
    const kept = scored.filter((s) => top - s.c <= marginCos).slice(0, topKMax);
    candidatePairCount += kept.length;
    groups.push({ poly: polyMarkets[i], cands: kept.map((s) => ({ kalshi: kalshiMarkets[s.j], cosine: s.c })) });
  }
  log.info(
    { polyWithCandidates: groups.length, candidatePairs: candidatePairCount, threshold: candidateThreshold },
    'verifying market-level (cached, quota-aware)…'
  );

  // ── Preflight: plan the verification before spending any quota (Req 2). ──
  const cachedBefore = groups.reduce((n, g) => {
    const key = verdictKey({
      schemaVersion: SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      provider: verifierProvider,
      model: verifierModel,
      polyId: g.poly.id,
      polyText: marketEmbedText(g.poly),
      candidates: g.cands.map((c) => ({ id: c.kalshi.id, text: marketEmbedText(c.kalshi) })),
    });
    return n + (getVerdict(db, key) ? 1 : 0);
  }, 0);
  const missingVerdicts = groups.length - cachedBefore;
  const EST_IN = 420,
    EST_OUT = 160; // approximate per-request tokens (system + market + ≤5 candidates)
  const lim = verifier.limits;
  const estCostUsd = (missingVerdicts * (EST_IN * lim.costPer1kInput + EST_OUT * lim.costPer1kOutput)) / 1000;
  const estRuntimeMin =
    missingVerdicts === 0 ? 0 : Math.max(missingVerdicts / lim.rpm, (missingVerdicts * (EST_IN + EST_OUT)) / lim.tpm);
  const plan: VerifyPlan = {
    polyWithCandidates: groups.length,
    candidatePairs: candidatePairCount,
    cachedVerdicts: cachedBefore,
    missingVerdicts,
    estCostUsd,
    estRuntimeMin,
    rpd: lim.rpd,
  };
  log.info(plan, 'verification preflight');
  const allowPartial = process.env.VERIFY_ALLOW_PARTIAL === '1';
  const maxRequests = process.env.VERIFY_MAX_REQUESTS ? Number(process.env.VERIFY_MAX_REQUESTS) : Infinity;
  const maxCostUsd = process.env.VERIFY_MAX_COST_USD ? Number(process.env.VERIFY_MAX_COST_USD) : Infinity;
  if (!allowPartial) {
    if (lim.rpd !== null && missingVerdicts > lim.rpd) {
      throw new PreflightAborted(
        plan,
        `${missingVerdicts} missing verdicts exceed the ${lim.rpd}/day cap for ${verifierModel} — switch to a model with a fresh daily bucket, raise your tier, or set VERIFY_ALLOW_PARTIAL=1 to run and resume`
      );
    }
    if (missingVerdicts > maxRequests) throw new PreflightAborted(plan, `${missingVerdicts} requests exceed VERIFY_MAX_REQUESTS=${maxRequests}`);
    if (estCostUsd > maxCostUsd) throw new PreflightAborted(plan, `est $${estCostUsd.toFixed(2)} exceeds VERIFY_MAX_COST_USD=${maxCostUsd}`);
  }

  // Batch transport: submit the missing verdicts to the Batch API (separate quota
  // pool, ~50% cost) instead of the synchronous loop, then stop until they're imported.
  const transport = process.env.VERIFY_TRANSPORT === 'batch' ? 'batch' : 'sync';
  if (transport === 'batch' && missingVerdicts > 0) {
    if (verifierProvider !== 'openai') {
      throw new Error(`VERIFY_TRANSPORT=batch is OpenAI-only; VERIFY_PROVIDER=${verifierProvider} is not supported`);
    }
    const requests: BatchRequest[] = [];
    for (const g of groups) {
      const candMarkets = g.cands.map((c) => c.kalshi);
      const key = verdictKey({
        schemaVersion: SCHEMA_VERSION,
        promptVersion: PROMPT_VERSION,
        provider: verifierProvider,
        model: verifierModel,
        polyId: g.poly.id,
        polyText: marketEmbedText(g.poly),
        candidates: candMarkets.map((k) => ({ id: k.id, text: marketEmbedText(k) })),
      });
      if (getVerdict(db, key)) continue; // already cached — skip
      const { system, user } = buildVerifyMessages(g.poly, candMarkets);
      requests.push({ customId: key, polyId: g.poly.id, candidateIds: candMarkets.map((k) => k.id), system, user });
    }
    const createdAt = new Date().toISOString();
    prepareBatchChunks(requests, {
      provider: verifierProvider,
      model: verifierModel,
      endpoint: '/v1/chat/completions',
      maxTokens: VERIFY_MAX_TOKENS,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      createdAt,
    });
    await submitNextChunk(openaiBatchClient(), loadManifests());
    throw new BatchSubmitted(batchProgress(loadManifests()), requests.length);
  }

  // Market-level verification: one request per Polymarket market, served from the
  // verdict cache when possible, and stopping cleanly if the daily quota runs out.
  const byPoly = new Map<string, VerifiedPair>();
  const matchRankHistogram = [0, 0, 0, 0, 0, 0]; // index = cosine rank of the chosen match
  let verifiedThisRun = 0;
  let cachedHits = 0;
  let quotaExhausted = false;
  let processed = 0;

  await mapLimit(groups, concurrency, async (g) => {
    if (quotaExhausted) return; // stop issuing new work once the daily quota is gone
    const candMarkets = g.cands.map((c) => c.kalshi);
    const key = verdictKey({
      schemaVersion: SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      provider: verifierProvider,
      model: verifierModel,
      polyId: g.poly.id,
      polyText: marketEmbedText(g.poly),
      candidates: candMarkets.map((k) => ({ id: k.id, text: marketEmbedText(k) })),
    });
    let verdict: MarketVerdict | null | undefined = getVerdict(db, key);
    if (verdict) {
      cachedHits++;
    } else {
      try {
        verdict = await verifyMarket(verifier, g.poly, candMarkets);
      } catch (err) {
        if (err instanceof DailyQuotaExhausted) {
          quotaExhausted = true;
          return;
        }
        throw err;
      }
      if (verdict) {
        putVerdict(db, key, g.poly.id, verdict, verifierProvider, verifierModel, PROMPT_VERSION, SCHEMA_VERSION);
        verifiedThisRun++;
      }
    }
    processed++;
    if (opts.onProgress && processed % 250 === 0) opts.onProgress(processed, groups.length);

    if (!verdict || !verdict.matchedKalshiId || !verdict.sameEvent) return;
    const matchIdx = g.cands.findIndex((c) => c.kalshi.id === verdict!.matchedKalshiId);
    if (matchIdx < 0) return;
    matchRankHistogram[Math.min(matchIdx, matchRankHistogram.length - 1)]++;
    const chosen = g.cands[matchIdx];
    byPoly.set(g.poly.id, {
      polymarket: g.poly,
      kalshi: chosen.kalshi,
      cosine: chosen.cosine,
      sameEvent: verdict.sameEvent,
      sameCriteria: verdict.sameCriteria,
      yesAligned: verdict.yesAligned,
      reason: verdict.reason,
    });
  });

  if (quotaExhausted) {
    log.warn(
      { verifiedThisRun, cachedHits, remaining: groups.length - cachedHits - verifiedThisRun },
      'daily LLM quota exhausted — result is PARTIAL; re-run after reset to resume from cache'
    );
  }

  const pairs = [...byPoly.values()].sort((a, b) => b.cosine - a.cosine);
  return {
    candidates: candidatePairCount,
    polyWithCandidates: groups.length,
    verifiedThisRun,
    cachedHits,
    pairs,
    matchRankHistogram,
    quotaExhausted,
    embeddingModel: EMBEDDING_MODEL,
    verifierModel,
    promptVersion: PROMPT_VERSION,
  };
}
