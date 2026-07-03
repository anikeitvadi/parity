/**
 * Drive the Batch-API verification pipeline to completion.
 *
 *   VERIFY_TRANSPORT=batch npm run study   # retrieval → submit batch(es) → exit (pending)
 *   npm run verify:batch:poll              # THIS: poll → import verdicts → submit next chunk → repeat
 *   npm run study                          # all verdicts now cached → completes + publishes
 *
 * Imports go into the SAME provider/model/schema-keyed verdict cache the sync path
 * uses, so the resulting corpus is identical and consistent regardless of transport.
 * Re-runnable and idempotent: already-imported chunks are skipped; unparseable
 * verdicts are recorded and left missing (never coerced into a fake match).
 */

import '../src/config/env.js';
import fs from 'node:fs';
import { getDatabase, initDatabase } from '../src/database/schema.js';
import { ensureVerdictTable, putVerdict } from '../src/services/verdict-cache.js';
import { parseMarketVerdict } from '../src/services/cross-platform-matcher.js';
import {
  BATCH_DIR,
  openaiBatchClient,
  loadManifests,
  scanManifests,
  submitNextChunk,
  pollAndFetch,
  batchProgress,
  saveManifest,
  isTerminal,
  isSettled,
  classifyChunk,
  nextAction,
  humanizeAgo,
  writeHeartbeat,
  clearHeartbeat,
  type BatchManifest,
  type BatchResultLine,
  type PollOutcome,
} from '../src/services/verifier-batch.js';
import type { Market } from '../src/types/market.js';

type Db = ReturnType<typeof getDatabase>;
const POLL_MS = Number(process.env.VERIFY_BATCH_POLL_MS ?? 30_000);
/** In-flight but counts unmoved for longer than this → "provider tail latency" (not a local fault). */
const TAIL_STALL_MS = Number(process.env.VERIFY_BATCH_TAIL_STALL_MS ?? 300_000);

/** Write completed verdicts into the cache; record (don't fake) anything unparseable. */
function importChunk(db: Db, m: BatchManifest, outputs: BatchResultLine[], errors: BatchResultLine[]): { imported: number; failed: number } {
  let imported = 0;
  const failures: BatchResultLine[] = [...errors];
  for (const o of outputs) {
    const req = m.requests[o.customId];
    if (!req || o.content == null) {
      failures.push({ customId: o.customId, content: null, error: 'no request mapping for custom_id' });
      continue;
    }
    // parseMarketVerdict only reads candidate ids → stub Markets are sufficient and exact.
    const verdict = parseMarketVerdict(o.content, req.candidateIds.map((id) => ({ id }) as Market));
    if (!verdict) {
      // Unparseable response: record it and leave the verdict MISSING (a later study
      // re-create re-submits it). Never silently write a null/fake match.
      failures.push({ customId: o.customId, content: o.content.slice(0, 200), error: 'unparseable verdict — needs manual review, left missing' });
      continue;
    }
    putVerdict(db, o.customId, req.polyId, verdict, m.provider, m.model, m.promptVersion, m.schemaVersion);
    imported++;
  }
  if (failures.length) {
    fs.writeFileSync(`${BATCH_DIR}/${m.chunkId}.errors.jsonl`, failures.map((f) => JSON.stringify(f)).join('\n'));
  }
  m.imported = true;
  m.status = 'imported';
  m.importedAt = new Date().toISOString();
  saveManifest(m);
  return { imported, failed: failures.length };
}

/** One human-readable line per polled chunk: status, counts, delta, how long since real movement, next action. */
function printPoll(m: BatchManifest, res: PollOutcome, anyInFlight: boolean, nowMs: number): void {
  const c = res.counts;
  const progressStalled = !res.madeProgress && !!res.lastProgressAt && nowMs - Date.parse(res.lastProgressAt) > TAIL_STALL_MS;
  const cls = classifyChunk(m, { liveStatus: res.status, anyInFlight, pollerStale: false, progressStalled }); // we ARE the poller
  const delta = `Δ+${res.deltaCompleted}${res.deltaFailed ? `/${res.deltaFailed}f` : ''}`;
  console.log(
    `  ${m.chunkId} · ${res.status} · ${c.completed}/${c.total}${c.failed ? ` (${c.failed} failed)` : ''} · ${delta} · last progress ${humanizeAgo(res.lastProgressAt, nowMs)} · next: ${nextAction(cls)}`
  );
}

/** Final line when the loop exits: clean publish prompt, or a missing-count + recovery prompt. */
function summarize(manifests: BatchManifest[]): void {
  const imported = manifests.filter((m) => m.imported);
  const failed = manifests.filter((m) => m.terminalReason && !m.imported);
  const verdicts = imported.reduce((n, m) => n + m.requestCount, 0);
  if (failed.length === 0) {
    console.log(`✓ all ${manifests.length} chunks imported (~${verdicts} verdicts). Re-run \`npm run study\` to publish.`);
    return;
  }
  const missing = failed.reduce((n, m) => n + m.requestCount, 0);
  console.log(`◐ ${imported.length}/${manifests.length} chunks imported (~${verdicts} verdicts); ${failed.length} terminal-failed.`);
  console.error(`  ⚠ ${missing} requests MISSING (${failed.map((m) => `${m.chunkId}:${m.terminalReason}`).join(', ')}).`);
  console.error('  Recover with: npm run verify:batch:doctor -- --recover   (regenerates a batch for missing custom_ids only)');
}

async function main() {
  initDatabase();
  const db = getDatabase();
  ensureVerdictTable(db);
  const client = openaiBatchClient();

  const runId = `${process.pid}-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const beat = (currentChunk: string | null) =>
    writeHeartbeat({ pid: process.pid, runId, startedAt, lastTickAt: new Date().toISOString(), currentChunk });
  beat(null);

  const warnedSkips = new Set<string>(); // warn once per corrupt file, not every 30s tick

  for (;;) {
    const { manifests, skipped } = scanManifests();
    for (const s of skipped) {
      if (warnedSkips.has(s.file)) continue;
      warnedSkips.add(s.file);
      console.error(`  ⚠ CORRUPT manifest ${s.file}: ${s.reason} — skipped. A chunk may be missing; run npm run verify:batch:doctor.`);
    }
    if (manifests.length === 0) {
      console.log('No batch manifests in', BATCH_DIR, '— run `VERIFY_TRANSPORT=batch npm run study` first.');
      break;
    }
    // Settled = imported OR terminally failed. Terminal chunks no longer fake an import, so the
    // loop terminates on "all settled" instead of spinning forever on a failure.
    if (manifests.every(isSettled)) {
      summarize(manifests);
      break;
    }

    let didWork = false;
    const anyInFlight = manifests.some((m) => m.batchId && !m.imported && !isTerminal(m.status) && !m.terminalReason);

    // 1) Poll each unsettled in-flight batch; print real movement; import the ones that completed.
    for (const m of manifests) {
      if (!m.batchId || isSettled(m)) continue;
      beat(m.chunkId);
      const res = await pollAndFetch(client, m);
      if (!res) continue;
      printPoll(m, res, anyInFlight, Date.now());
      if (res.results) {
        const { imported, failed } = importChunk(db, m, res.results.outputs, res.results.errors);
        console.log(`  → ${m.chunkId}: imported ${imported}${failed ? `, ${failed} errors (see ${m.chunkId}.errors.jsonl)` : ''}`);
        didWork = true;
      } else if (isTerminal(res.status)) {
        // failed / expired / cancelled — pollAndFetch set terminalReason; we do NOT fake an import.
        console.error(`  ⚠ ${m.chunkId} ended '${res.status}' — ${m.requestCount} requests stay MISSING. Recover: npm run verify:batch:doctor -- --recover`);
        didWork = true;
      } else if (res.madeProgress) {
        didWork = true;
      }
    }

    // 2) Submit the next queued chunk if nothing is in flight (Tier-1 enqueued cap).
    const submitted = await submitNextChunk(client, loadManifests());
    if (submitted) {
      console.log(`  submitted next chunk ${submitted.chunkId} (${submitted.requestCount} reqs)`);
      didWork = true;
    }

    const p = batchProgress(loadManifests());
    console.log(`progress: ${p.imported}/${p.chunks} imported · ${p.inFlight} in-flight · ${p.prepared} queued`);
    beat(null);
    if (!didWork) await new Promise((r) => setTimeout(r, POLL_MS));
  }

  clearHeartbeat();
}

main().catch((e) => {
  console.error('verify:batch:poll failed:', e);
  process.exit(1);
});
