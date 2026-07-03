/**
 * Batch reliability doctor — answer "is this stalled, and WHERE?" without guessing.
 *
 *   npm run verify:batch:doctor              # diagnose: per-chunk local vs OpenAI state + stall class
 *   npm run verify:batch:doctor -- --recover # regenerate a prepared chunk for any terminally-failed one
 *
 * Read-only on manifests (it never writes the poller's files — only a live OpenAI probe for
 * display), so it is always safe to run alongside the poll loop. --recover is the one exception:
 * it writes NEW recovery manifests with fresh chunk ids, which the poller then submits.
 *
 * The point: distinguish provider latency from local failure. OpenAI's live counts sit next to
 * the poller's last-recorded counts and heartbeat, so a stall is labelled local / provider /
 * import-side / sequencing-side — never just "it stalled".
 */

import '../src/config/env.js';
import fs from 'node:fs';
import { getDatabase, initDatabase } from '../src/database/schema.js';
import { ensureVerdictTable, countVerdicts, verdictProvenance, getVerdict } from '../src/services/verdict-cache.js';
import { verifierConfig } from '../src/services/cross-platform-matcher.js';
import {
  BATCH_DIR,
  openaiBatchClient,
  scanManifests,
  readHeartbeat,
  heartbeatStale,
  classifyChunk,
  nextAction,
  humanizeAgo,
  isTerminal,
  isSettled,
  regenerateMissingChunk,
} from '../src/services/verifier-batch.js';

const POLL_MS = Number(process.env.VERIFY_BATCH_POLL_MS ?? 30_000);
const TAIL_STALL_MS = Number(process.env.VERIFY_BATCH_TAIL_STALL_MS ?? 300_000);
const STUDY_JSON = 'docs/data/efficiency-study.json';

type Counts = { total: number; completed: number; failed: number };

/** Is a process with this pid currently alive? (signal 0 = existence check, no signal sent.) */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // alive but not ours
  }
}

async function main() {
  const recover = process.argv.includes('--recover');
  initDatabase();
  const db = getDatabase();
  ensureVerdictTable(db);

  const nowMs = Date.now();
  const { manifests, skipped } = scanManifests();
  const v = verifierConfig();

  console.log(`\nBATCH DOCTOR · ${BATCH_DIR}`);
  console.log(`active verifier : ${v.provider}/${v.model} · prompt ${v.promptVersion} · schema ${v.schemaVersion}`);

  // ── verdict cache for the active key (+ a mixed-corpus guard) ──
  const cached = countVerdicts(db, v.provider, v.model, v.promptVersion, v.schemaVersion);
  const prov = verdictProvenance(db, v.promptVersion, v.schemaVersion);
  console.log(`verdict_cache   : ${cached} for active key`);
  if (prov.length > 1) {
    console.log(`  ⚠ MIXED corpus for this prompt/schema: ${prov.map((p) => `${p.provider}/${p.model}=${p.n}`).join(', ')}`);
  }

  // ── poller heartbeat ──
  const hb = readHeartbeat();
  const pollerStale = heartbeatStale(hb, POLL_MS, nowMs);
  if (!hb) {
    console.log('poller          : ABSENT — no heartbeat. Nothing is importing/submitting locally.');
  } else {
    const alive = pidAlive(hb.pid);
    const tag = pollerStale ? 'STALE' : 'ALIVE';
    console.log(
      `poller          : ${tag} — pid ${hb.pid} (${alive ? 'running' : 'not running'}), last tick ${humanizeAgo(hb.lastTickAt, nowMs)}, chunk ${hb.currentChunk ?? '—'}`
    );
  }

  // ── corrupt/unreadable manifests (surfaced loudly — a missing chunk must never pass silently) ──
  if (skipped.length > 0) {
    console.log(`\n⚠ ${skipped.length} CORRUPT/UNREADABLE manifest file(s) in ${BATCH_DIR} — NOT counted below:`);
    for (const s of skipped) console.log(`   ✗ ${s.file} — ${s.reason}`);
    console.log('   A chunk may be missing from this run; do not trust "all imported" until resolved.');
  }

  if (manifests.length === 0) {
    console.log(
      skipped.length > 0
        ? '\nNo USABLE chunk manifests (all corrupt — see above).\n'
        : '\nNo chunk manifests. Run `VERIFY_TRANSPORT=batch npm run study` to create them.\n'
    );
    return;
  }

  const anyInFlight = manifests.some((m) => m.batchId && !m.imported && !isTerminal(m.status) && !m.terminalReason);
  const client = openaiBatchClient();

  console.log(`\nchunks (${manifests.length}):`);
  for (const m of manifests) {
    // Live OpenAI probe (display + classification only — never persisted here).
    let liveStatus: string | undefined;
    let liveCounts: Counts | undefined;
    let probeErr: string | undefined;
    if (m.batchId) {
      try {
        const b = await client.batches.retrieve(m.batchId);
        liveStatus = b.status;
        liveCounts = {
          total: b.request_counts?.total ?? 0,
          completed: b.request_counts?.completed ?? 0,
          failed: b.request_counts?.failed ?? 0,
        };
      } catch (e) {
        probeErr = e instanceof Error ? e.message : String(e);
      }
    }

    const rec = m.lastRequestCounts;
    const movedVsManifest =
      !!liveCounts && !!rec && (liveCounts.completed !== rec.completed || liveCounts.failed !== rec.failed);
    const progressStalled = !movedVsManifest && !!m.lastProgressAt && nowMs - Date.parse(m.lastProgressAt) > TAIL_STALL_MS;
    const cls = classifyChunk(m, { liveStatus, anyInFlight, pollerStale, progressStalled });

    console.log(`─ ${m.chunkId}`);
    console.log(`   batch    ${m.batchId ?? '— (never submitted)'}`);
    console.log(
      `   local    imported=${m.imported} status=${m.status}${m.terminalReason ? ` terminal=${m.terminalReason}` : ''}` +
        (rec ? `  recorded ${rec.completed}/${rec.total} (${rec.failed} failed)` : '  recorded —')
    );
    if (m.batchId) {
      if (liveCounts) {
        // Live ahead of the poller's last record is NORMAL between 30s ticks; only alarming when the poller is stale.
        const aheadNote = movedVsManifest
          ? pollerStale
            ? '  ← LIVE AHEAD of recorded — poller STALE, not importing'
            : '  ← live ahead of last poll (normal between ticks)'
          : '';
        console.log(`   openai   ${liveStatus}  ${liveCounts.completed}/${liveCounts.total} (${liveCounts.failed} failed)${aheadNote}`);
      } else {
        console.log(`   openai   probe failed: ${probeErr}`);
      }
    }
    console.log(
      `   timing   submitted ${humanizeAgo(m.submittedAt, nowMs)} · polled ${humanizeAgo(m.lastPolledAt, nowMs)} · last progress ${humanizeAgo(m.lastProgressAt, nowMs)}` +
        (m.importedAt ? ` · imported ${humanizeAgo(m.importedAt, nowMs)}` : '')
    );
    console.log(`   class    ${cls.toUpperCase()} → ${nextAction(cls)}`);
  }

  // ── overall ──
  const imported = manifests.filter((m) => m.imported);
  const failed = manifests.filter((m) => m.terminalReason && !m.imported);
  const inFlight = manifests.filter((m) => m.batchId && !isSettled(m) && !isTerminal(m.status)).length;
  const queued = manifests.filter((m) => !m.batchId && !m.imported).length;
  console.log(`\noverall: ${imported.length}/${manifests.length} imported · ${inFlight} in-flight · ${queued} queued`);

  const allImported = manifests.every((m) => m.imported);
  const latestImportedAt = imported.map((m) => m.importedAt).filter(Boolean).sort().pop();
  if (allImported) {
    const published = studyPublishedAfter(latestImportedAt ?? null);
    console.log(
      published
        ? 'state:   DONE — all imported and study re-published. ✓'
        : 'state:   DONE_NOT_PUBLISHED — all imported but study not re-run. next: npm run study'
    );
  } else if (failed.length > 0) {
    const missing = failed.reduce((n, m) => n + m.requestCount, 0);
    console.log(`state:   TERMINAL FAILURES — ${failed.length} chunk(s), ${missing} requests missing.`);
    console.log('next:    npm run verify:batch:doctor -- --recover   then   npm run verify:batch:poll');
  } else if (pollerStale && (inFlight > 0 || queued > 0 || manifests.some((m) => isTerminal(m.status) && !m.imported))) {
    console.log('state:   LOCAL_POLLER_DEAD — work is waiting but no live poller. next: npm run verify:batch:poll');
  } else {
    console.log('next:    waiting on OpenAI — poller will import/submit automatically.');
  }

  if (skipped.length > 0) {
    console.log(`note:    ${skipped.length} corrupt manifest(s) excluded above — counts cover USABLE chunks only.`);
  }

  // ── recovery (opt-in) ──
  if (recover) {
    console.log('\n--recover:');
    if (failed.length === 0) {
      console.log('  no terminally-failed chunks — nothing to regenerate.');
    } else {
      for (const m of failed) {
        const fresh = regenerateMissingChunk(m, (cid) => !getVerdict(db, cid));
        if (fresh) console.log(`  ✓ ${m.chunkId} → ${fresh.chunkId}: ${fresh.requestCount} missing requests queued for resubmit.`);
        else console.log(`  • ${m.chunkId}: nothing missing (all custom_ids already cached) — marking nothing.`);
      }
      console.log('  Run `npm run verify:batch:poll` to submit the recovery chunk(s).');
    }
  }
  console.log('');
}

/** True if the published study file is newer than the most recent verdict import. */
function studyPublishedAfter(latestImportedAt: string | null): boolean {
  if (!latestImportedAt) return false;
  try {
    return fs.statSync(STUDY_JSON).mtimeMs >= Date.parse(latestImportedAt);
  } catch {
    return false; // study output not written yet
  }
}

main().catch((e) => {
  console.error('verify:batch:doctor failed:', e);
  process.exit(1);
});
