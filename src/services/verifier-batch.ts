/**
 * Batch transport for market-level verification (OpenAI Batch API).
 *
 * Why this exists: ~6,500 non-interactive verdicts kept hitting the synchronous
 * per-day request cap (RPD 10k). The Batch API draws from a SEPARATE limit pool —
 * it does not consume sync RPM/TPM/RPD at all — costs ~50% less, and returns one
 * model's results in a single mapped corpus. That turns the quota wall into a
 * non-issue and keeps the dataset consistent (one provider+model, custom_id-mapped).
 *
 * This module is pure plumbing: JSONL chunking, file upload, batch create/poll,
 * output download, and on-disk manifests. It deliberately does NOT import the
 * matcher — the prompt/parse logic lives there, and the poll script injects parse +
 * cache-write — so there is no import cycle. OpenAI-scoped (VERIFY_PROVIDER=openai).
 */

import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'verifier-batch' });

const nowIso = () => new Date().toISOString();

export const BATCH_DIR = '.cache/verifier-batches';
/** Liveness file written by the poll loop; lives in BATCH_DIR but is NOT a chunk manifest. */
export const HEARTBEAT_FILE = 'poller-heartbeat.json';
/** OpenAI Batch ceilings: ≤50k requests and (Tier-1 mini class) ≤2M enqueued tokens per concurrent batch. */
const DEFAULT_MAX_PER_BATCH = 50_000;
const DEFAULT_TOKEN_BUDGET = 1_800_000; // keep one chunk safely under the 2M concurrent-enqueued cap

/** One verification request, prepared by the matcher (which owns prompt + cache-key logic). */
export interface BatchRequest {
  customId: string; // = verdict cache key (stable, idempotent)
  polyId: string;
  candidateIds: string[]; // ordered — match_index resolves against this on import
  system: string;
  user: string;
}

/** On-disk record of one batch chunk; the unit of submit / poll / import. */
export interface BatchManifest {
  chunkId: string; // stable local id (also the JSONL/​manifest filename stem)
  inputFile: string; // local JSONL path
  batchId: string | null; // null until submitted (a prepared/deferred chunk)
  inputFileId: string | null;
  outputFileId: string | null;
  errorFileId: string | null;
  provider: string;
  model: string;
  endpoint: string;
  promptVersion: string;
  schemaVersion: number;
  maxTokens: number;
  requestCount: number;
  estTokens: number;
  status: string; // 'prepared' | OpenAI batch status | 'imported'
  imported: boolean;
  createdAt: string;
  // --- progress telemetry (added by the reliability layer; all optional so older
  //     manifests still parse). Lets the doctor tell provider latency from a dead poller. ---
  submittedAt?: string; // when this chunk's batch was created at OpenAI
  lastPolledAt?: string; // last time we asked OpenAI for this batch's status
  lastProgressAt?: string; // last poll at which completed/failed counts actually changed
  lastRequestCounts?: { total: number; completed: number; failed: number };
  completedAt?: string; // when OpenAI status first became a terminal one
  importedAt?: string; // when verdicts were written into the cache
  terminalReason?: string; // 'failed' | 'expired' | 'cancelled' — set instead of faking an import
  // custom_id → the info import needs to map a verdict back without the full Market objects.
  requests: Record<string, { polyId: string; candidateIds: string[] }>;
}

export interface BatchResultLine {
  customId: string;
  content: string | null; // assistant message content (null if the line errored)
  error: string | null;
}

const TERMINAL = new Set(['completed', 'failed', 'expired', 'cancelled']);

/** Construct the OpenAI client used for Files + Batches. Batch is OpenAI-only for now. */
export function openaiBatchClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for VERIFY_TRANSPORT=batch');
  return new OpenAI({ apiKey });
}

const estRequestTokens = (r: BatchRequest, maxTokens: number) =>
  Math.ceil((r.system.length + r.user.length) / 4) + maxTokens;

function ensureDir() {
  fs.mkdirSync(BATCH_DIR, { recursive: true });
}

/** A /v1/chat/completions body identical to the sync call (temperature 0, JSON mode). */
function bodyFor(r: BatchRequest, model: string, maxTokens: number) {
  return {
    model,
    messages: [
      { role: 'system', content: r.system },
      { role: 'user', content: r.user },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  };
}

/**
 * Split requests into token-budgeted chunks, write each chunk's JSONL + manifest to
 * disk, and return the prepared (not-yet-submitted) manifests. Idempotent inputs →
 * stable chunk ids, so re-preparing the same missing set is a no-op overwrite.
 */
export function prepareBatchChunks(
  requests: BatchRequest[],
  opts: {
    provider: string;
    model: string;
    endpoint: string;
    maxTokens: number;
    promptVersion: string;
    schemaVersion: number;
    createdAt: string;
    tokenBudget?: number;
    maxPerBatch?: number;
  }
): BatchManifest[] {
  ensureDir();
  const tokenBudget = opts.tokenBudget ?? Number(process.env.VERIFY_BATCH_TOKEN_BUDGET ?? DEFAULT_TOKEN_BUDGET);
  const maxPerBatch = opts.maxPerBatch ?? Number(process.env.VERIFY_BATCH_SIZE ?? DEFAULT_MAX_PER_BATCH);

  // Greedy fill: accumulate until the next request would exceed the token or count budget.
  const chunks: BatchRequest[][] = [];
  let cur: BatchRequest[] = [];
  let curTokens = 0;
  for (const r of requests) {
    const t = estRequestTokens(r, opts.maxTokens);
    if (cur.length > 0 && (curTokens + t > tokenBudget || cur.length >= maxPerBatch)) {
      chunks.push(cur);
      cur = [];
      curTokens = 0;
    }
    cur.push(r);
    curTokens += t;
  }
  if (cur.length) chunks.push(cur);

  const manifests: BatchManifest[] = chunks.map((chunk, i) => {
    const chunkId = `${opts.createdAt.replace(/[:.]/g, '-')}-${opts.model}-${String(i + 1).padStart(3, '0')}`;
    const inputFile = path.join(BATCH_DIR, `${chunkId}.jsonl`);
    const jsonl = chunk
      .map((r) =>
        JSON.stringify({
          custom_id: r.customId,
          method: 'POST',
          url: opts.endpoint,
          body: bodyFor(r, opts.model, opts.maxTokens),
        })
      )
      .join('\n');
    fs.writeFileSync(inputFile, jsonl);
    const requestsMap: BatchManifest['requests'] = {};
    for (const r of chunk) requestsMap[r.customId] = { polyId: r.polyId, candidateIds: r.candidateIds };
    const m: BatchManifest = {
      chunkId,
      inputFile,
      batchId: null,
      inputFileId: null,
      outputFileId: null,
      errorFileId: null,
      provider: opts.provider,
      model: opts.model,
      endpoint: opts.endpoint,
      promptVersion: opts.promptVersion,
      schemaVersion: opts.schemaVersion,
      maxTokens: opts.maxTokens,
      requestCount: chunk.length,
      estTokens: chunk.reduce((n, r) => n + estRequestTokens(r, opts.maxTokens), 0),
      status: 'prepared',
      imported: false,
      createdAt: opts.createdAt,
      requests: requestsMap,
    };
    saveManifest(m);
    return m;
  });

  log.info({ chunks: manifests.length, requests: requests.length, tokenBudget }, 'prepared batch chunks');
  return manifests;
}

export function manifestPath(chunkId: string): string {
  return path.join(BATCH_DIR, `${chunkId}.json`);
}

/** Write JSON atomically: a partial file can never be observed by a concurrent reader (the doctor). */
function atomicWriteJson(p: string, obj: unknown): void {
  ensureDir();
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p); // rename is atomic on the same filesystem
}

export function saveManifest(m: BatchManifest): void {
  atomicWriteJson(manifestPath(m.chunkId), m);
}

export interface ManifestScan {
  manifests: BatchManifest[];
  /** Files that looked like manifests but couldn't be used (torn/empty/foreign). Reported, never hidden. */
  skipped: { file: string; reason: string }[];
}

/**
 * Read every chunk manifest, separating usable ones from corrupt/torn files. A bad file is
 * crash-safe (the loop never dies on it) AND visible (callers surface `skipped` so it can't pass
 * as "this chunk doesn't exist"). `dir` is injectable for tests; production uses BATCH_DIR.
 */
export function scanManifests(dir: string = BATCH_DIR): ManifestScan {
  const manifests: BatchManifest[] = [];
  const skipped: { file: string; reason: string }[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === HEARTBEAT_FILE) continue; // heartbeat lives here but isn't a chunk
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as BatchManifest;
        if (m && typeof m.chunkId === 'string') manifests.push(m);
        else skipped.push({ file: f, reason: 'parsed but has no chunkId' });
      } catch (e) {
        skipped.push({ file: f, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  manifests.sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  return { manifests, skipped };
}

/** Usable manifests only. Callers that must SEE corrupt files (doctor, poller) use scanManifests(). */
export function loadManifests(): BatchManifest[] {
  return scanManifests().manifests;
}

export const isTerminal = (status: string) => TERMINAL.has(status);
const inFlight = (m: BatchManifest) => m.batchId !== null && !m.imported && !isTerminal(m.status);
/** A chunk is "settled" when no further local work can advance it: imported, or terminally failed. */
export const isSettled = (m: BatchManifest) => m.imported || !!m.terminalReason;

// ── Poller heartbeat ──────────────────────────────────────────────────────────
// The poll loop is the only thing that imports results and submits the next chunk.
// If it dies (e.g. the session is /clear'd) the OpenAI batch keeps running but
// nothing lands locally. The heartbeat lets the doctor tell "poller dead" apart
// from "provider still working".

export interface PollerHeartbeat {
  pid: number;
  runId: string;
  startedAt: string;
  lastTickAt: string;
  currentChunk: string | null;
}

export function heartbeatPath(): string {
  return path.join(BATCH_DIR, HEARTBEAT_FILE);
}

export function writeHeartbeat(hb: PollerHeartbeat): void {
  atomicWriteJson(heartbeatPath(), hb);
}

export function readHeartbeat(): PollerHeartbeat | null {
  try {
    return JSON.parse(fs.readFileSync(heartbeatPath(), 'utf8')) as PollerHeartbeat;
  } catch {
    return null; // missing or unreadable → treated as "no poller"
  }
}

export function clearHeartbeat(): void {
  try {
    fs.unlinkSync(heartbeatPath());
  } catch {
    /* already gone */
  }
}

/** Heartbeat is stale (poller presumed dead) if it's missing or older than max(90s, 3× poll interval). */
export function heartbeatStale(hb: PollerHeartbeat | null, pollMs: number, nowMs: number): boolean {
  if (!hb) return true;
  const ageMs = nowMs - Date.parse(hb.lastTickAt);
  return !Number.isFinite(ageMs) || ageMs > Math.max(90_000, 3 * pollMs);
}

// ── Stall classification ────────────────────────────────────────────────────────
// One label per chunk that names WHERE a stall lives, so "it stalled" always has an
// answer. `done_not_published` is an aggregate state (all imported) computed by callers.

export type StallClass =
  | 'imported' // verdicts written — nothing to do
  | 'terminal_failed' // OpenAI failed/expired/cancelled — needs recovery, not a fake import
  | 'ready_to_import' // OpenAI completed but verdicts not yet written locally
  | 'local_poller_dead' // work is waiting but the heartbeat is stale (no live poller)
  | 'provider_tail_latency' // in flight, poller alive, but counts haven't moved — OpenAI's tail
  | 'in_progress' // in flight and actively progressing — healthy
  | 'blocked_on_inflight' // prepared, waiting because another chunk holds the enqueued-token pool
  | 'prepared_idle'; // prepared, nothing in flight — poller will submit it next tick

/**
 * Classify a single chunk. `liveStatus` (from a fresh OpenAI probe) wins over the
 * manifest's last-recorded status when supplied. `progressStalled` means counts have
 * not moved for longer than the caller's tail-latency threshold.
 */
export function classifyChunk(
  m: BatchManifest,
  ctx: { liveStatus?: string; anyInFlight: boolean; pollerStale: boolean; progressStalled: boolean }
): StallClass {
  const status = ctx.liveStatus ?? m.status;
  if (m.imported) return 'imported';
  if (m.terminalReason || (isTerminal(status) && status !== 'completed')) return 'terminal_failed';
  if (status === 'completed') return 'ready_to_import';
  if (m.batchId) {
    // submitted, not terminal, not imported → in flight
    if (ctx.pollerStale) return 'local_poller_dead';
    if (ctx.progressStalled) return 'provider_tail_latency';
    return 'in_progress';
  }
  // prepared (never submitted)
  if (ctx.anyInFlight) return 'blocked_on_inflight';
  if (ctx.pollerStale) return 'local_poller_dead';
  return 'prepared_idle';
}

/** The single next step implied by a classification — same wording in the poll loop and the doctor. */
export function nextAction(cls: StallClass): string {
  switch (cls) {
    case 'imported':
      return 'none — verdicts cached';
    case 'terminal_failed':
      return 'recover: npm run verify:batch:doctor -- --recover';
    case 'ready_to_import':
      return 'import (poller does this automatically)';
    case 'local_poller_dead':
      return 'start poller: npm run verify:batch:poll';
    case 'provider_tail_latency':
      return 'wait — OpenAI finishing the tail (no local action)';
    case 'in_progress':
      return 'wait — OpenAI processing';
    case 'blocked_on_inflight':
      return 'wait — submits after the in-flight chunk drains';
    case 'prepared_idle':
      return 'submit (poller does this automatically)';
  }
}

/** Compact "3m 12s ago" for an ISO timestamp; "never" when absent. */
export function humanizeAgo(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return 'never';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ''} ago`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''} ago`;
}

/**
 * Recovery: for a terminally-failed chunk, write a fresh PREPARED chunk containing only
 * the custom_ids still missing from the verdict cache, reusing the original JSONL request
 * bodies. The poll loop then submits it like any other prepared chunk. The missing subset
 * of a budget-fit chunk still fits the budget, so no re-chunking is needed. Returns the new
 * manifest, or null if the input JSONL is gone or nothing is missing.
 */
export function regenerateMissingChunk(
  failed: BatchManifest,
  isMissing: (customId: string) => boolean,
  createdAt = nowIso()
): BatchManifest | null {
  if (!fs.existsSync(failed.inputFile)) {
    log.warn({ chunkId: failed.chunkId, inputFile: failed.inputFile }, 'cannot recover — input JSONL missing');
    return null;
  }
  const lines = fs.readFileSync(failed.inputFile, 'utf8').split('\n').filter(Boolean);
  const keep: string[] = [];
  const requests: BatchManifest['requests'] = {};
  let estTokens = 0;
  for (const line of lines) {
    let cid: string | undefined;
    try {
      cid = JSON.parse(line).custom_id;
    } catch {
      continue; // unparseable input line — drop it
    }
    if (!cid || !isMissing(cid)) continue;
    keep.push(line);
    if (failed.requests[cid]) requests[cid] = failed.requests[cid];
    estTokens += Math.ceil(line.length / 4) + failed.maxTokens;
  }
  if (keep.length === 0) return null;

  const chunkId = `${failed.chunkId}-recovery`; // stable id → re-running recovery overwrites, never piles up
  const inputFile = path.join(BATCH_DIR, `${chunkId}.jsonl`);
  fs.writeFileSync(inputFile, keep.join('\n'));
  const m: BatchManifest = {
    chunkId,
    inputFile,
    batchId: null,
    inputFileId: null,
    outputFileId: null,
    errorFileId: null,
    provider: failed.provider,
    model: failed.model,
    endpoint: failed.endpoint,
    promptVersion: failed.promptVersion,
    schemaVersion: failed.schemaVersion,
    maxTokens: failed.maxTokens,
    requestCount: keep.length,
    estTokens,
    status: 'prepared',
    imported: false,
    createdAt,
    requests,
  };
  saveManifest(m);
  log.info({ chunkId, recovered: keep.length, from: failed.chunkId }, 'prepared recovery chunk for missing custom_ids');
  return m;
}

/**
 * Submit the next prepared chunk IF nothing is in flight (Tier-1 enqueued cap allows
 * ~one concurrent batch). Returns the submitted manifest, or null if none submittable.
 */
export async function submitNextChunk(client: OpenAI, manifests: BatchManifest[]): Promise<BatchManifest | null> {
  if (manifests.some(inFlight)) return null; // wait for the in-flight batch to drain the enqueued pool
  const next = manifests.find((m) => m.batchId === null && !m.imported);
  if (!next) return null;
  const file = await client.files.create({ file: fs.createReadStream(next.inputFile), purpose: 'batch' });
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: next.endpoint as '/v1/chat/completions',
    completion_window: '24h',
  });
  next.inputFileId = file.id;
  next.batchId = batch.id;
  next.status = batch.status;
  next.submittedAt = nowIso();
  next.lastPolledAt = next.submittedAt;
  next.lastProgressAt = next.submittedAt;
  next.lastRequestCounts = {
    total: batch.request_counts?.total ?? next.requestCount,
    completed: batch.request_counts?.completed ?? 0,
    failed: batch.request_counts?.failed ?? 0,
  };
  saveManifest(next);
  log.info({ chunkId: next.chunkId, batchId: batch.id, requests: next.requestCount }, 'submitted batch chunk');
  return next;
}

/** Everything one poll learned: live status, counts, the delta since the previous poll, and
 *  (only when completed) the downloaded result lines. Returned even mid-flight so the loop
 *  prints real movement instead of just "still going". */
export interface PollOutcome {
  status: string;
  counts: { total: number; completed: number; failed: number };
  prevCounts: { total: number; completed: number; failed: number } | null;
  deltaCompleted: number;
  deltaFailed: number;
  madeProgress: boolean;
  lastProgressAt: string | null;
  results: { outputs: BatchResultLine[]; errors: BatchResultLine[] } | null;
}

/** Poll one submitted batch; record progress telemetry into the manifest, and on completion
 *  download output + error files into result lines. Returns null only if the chunk has no batchId. */
export async function pollAndFetch(client: OpenAI, m: BatchManifest): Promise<PollOutcome | null> {
  if (!m.batchId) return null;
  const batch = await client.batches.retrieve(m.batchId);
  const now = nowIso();
  const counts = {
    total: batch.request_counts?.total ?? m.lastRequestCounts?.total ?? m.requestCount,
    completed: batch.request_counts?.completed ?? 0,
    failed: batch.request_counts?.failed ?? 0,
  };
  const prev = m.lastRequestCounts ?? null;
  const madeProgress = !prev || counts.completed !== prev.completed || counts.failed !== prev.failed;

  m.status = batch.status;
  m.outputFileId = batch.output_file_id ?? null;
  m.errorFileId = batch.error_file_id ?? null;
  m.lastPolledAt = now;
  m.lastRequestCounts = counts;
  if (madeProgress) m.lastProgressAt = now;
  if (isTerminal(batch.status) && !m.completedAt) m.completedAt = now;
  if (isTerminal(batch.status) && batch.status !== 'completed' && !m.terminalReason) m.terminalReason = batch.status;
  saveManifest(m);

  const outcome: PollOutcome = {
    status: batch.status,
    counts,
    prevCounts: prev,
    deltaCompleted: counts.completed - (prev?.completed ?? 0),
    deltaFailed: counts.failed - (prev?.failed ?? 0),
    madeProgress,
    lastProgressAt: m.lastProgressAt ?? null,
    results: null,
  };

  if (batch.status !== 'completed') {
    log.info({ chunkId: m.chunkId, batchId: m.batchId, status: batch.status, counts }, 'batch polled');
    return outcome;
  }

  const outputs: BatchResultLine[] = [];
  const errors: BatchResultLine[] = [];
  if (m.outputFileId) {
    const text = await (await client.files.content(m.outputFileId)).text();
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        const content = row?.response?.body?.choices?.[0]?.message?.content ?? null;
        if (content != null) outputs.push({ customId: row.custom_id, content, error: null });
        else errors.push({ customId: row.custom_id, content: null, error: 'no content in response' });
      } catch {
        errors.push({ customId: 'unknown', content: null, error: 'unparseable output line' });
      }
    }
  }
  if (m.errorFileId) {
    const text = await (await client.files.content(m.errorFileId)).text();
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        errors.push({ customId: row.custom_id ?? 'unknown', content: null, error: JSON.stringify(row?.response?.body ?? row?.error ?? row) });
      } catch {
        errors.push({ customId: 'unknown', content: null, error: 'unparseable error line' });
      }
    }
  }
  log.info({ chunkId: m.chunkId, outputs: outputs.length, errors: errors.length }, 'batch completed — fetched results');
  outcome.results = { outputs, errors };
  return outcome;
}

/** Aggregate progress across all chunks (for the study status block + CLI output). */
export function batchProgress(manifests: BatchManifest[]): {
  chunks: number;
  prepared: number;
  inFlight: number;
  imported: number;
  totalRequests: number;
  allImported: boolean;
} {
  return {
    chunks: manifests.length,
    prepared: manifests.filter((m) => m.batchId === null && !m.imported).length,
    inFlight: manifests.filter(inFlight).length,
    imported: manifests.filter((m) => m.imported).length,
    totalRequests: manifests.reduce((n, m) => n + m.requestCount, 0),
    allImported: manifests.length > 0 && manifests.every((m) => m.imported),
  };
}
