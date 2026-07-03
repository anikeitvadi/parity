/**
 * Verifier-batch reliability logic — the pure decision functions that let the doctor and
 * poll loop name WHERE a stall lives (local vs provider vs import vs sequencing).
 *
 * Filesystem-touching helpers (saveManifest / regenerateMissingChunk) are intentionally not
 * exercised here — they write into the live .cache/verifier-batches dir the real batch uses.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyChunk,
  heartbeatStale,
  isSettled,
  humanizeAgo,
  nextAction,
  scanManifests,
  HEARTBEAT_FILE,
  type BatchManifest,
  type StallClass,
  type PollerHeartbeat,
} from '../../src/services/verifier-batch.js';

const mk = (over: Partial<BatchManifest> = {}): BatchManifest => ({
  chunkId: 'c1',
  inputFile: 'c1.jsonl',
  batchId: null,
  inputFileId: null,
  outputFileId: null,
  errorFileId: null,
  provider: 'openai',
  model: 'gpt-4o-mini',
  endpoint: '/v1/chat/completions',
  promptVersion: 'v3',
  schemaVersion: 1,
  maxTokens: 50,
  requestCount: 10,
  estTokens: 100,
  status: 'prepared',
  imported: false,
  createdAt: '2026-06-29T00:00:00.000Z',
  requests: {},
  ...over,
});

const ctx = (over: Partial<Parameters<typeof classifyChunk>[1]> = {}) => ({
  anyInFlight: false,
  pollerStale: false,
  progressStalled: false,
  ...over,
});

describe('classifyChunk — stall taxonomy', () => {
  it('imported chunk → imported', () => {
    expect(classifyChunk(mk({ imported: true, status: 'imported' }), ctx())).toBe('imported');
  });

  it('terminalReason set → terminal_failed', () => {
    expect(classifyChunk(mk({ batchId: 'b', status: 'failed', terminalReason: 'failed' }), ctx())).toBe('terminal_failed');
  });

  it('live status terminal-but-not-completed → terminal_failed even without a recorded terminalReason', () => {
    expect(classifyChunk(mk({ batchId: 'b', status: 'in_progress' }), ctx({ liveStatus: 'expired' }))).toBe('terminal_failed');
  });

  it('completed but not imported → ready_to_import', () => {
    expect(classifyChunk(mk({ batchId: 'b', status: 'in_progress' }), ctx({ liveStatus: 'completed' }))).toBe('ready_to_import');
  });

  it('in-flight + dead poller → local_poller_dead', () => {
    expect(classifyChunk(mk({ batchId: 'b', status: 'in_progress' }), ctx({ pollerStale: true }))).toBe('local_poller_dead');
  });

  it('in-flight + fresh poller + stalled counts → provider_tail_latency', () => {
    expect(classifyChunk(mk({ batchId: 'b', status: 'in_progress' }), ctx({ progressStalled: true }))).toBe('provider_tail_latency');
  });

  it('in-flight + fresh poller + moving counts → in_progress', () => {
    expect(classifyChunk(mk({ batchId: 'b', status: 'in_progress' }), ctx())).toBe('in_progress');
  });

  it('prepared + another chunk in flight → blocked_on_inflight', () => {
    expect(classifyChunk(mk(), ctx({ anyInFlight: true }))).toBe('blocked_on_inflight');
  });

  it('prepared + nothing in flight + dead poller → local_poller_dead', () => {
    expect(classifyChunk(mk(), ctx({ pollerStale: true }))).toBe('local_poller_dead');
  });

  it('prepared + nothing in flight + fresh poller → prepared_idle', () => {
    expect(classifyChunk(mk(), ctx())).toBe('prepared_idle');
  });

  it('imported wins even if poller looks dead (no false alarm on finished work)', () => {
    expect(classifyChunk(mk({ imported: true, batchId: 'b', status: 'imported' }), ctx({ pollerStale: true }))).toBe('imported');
  });
});

describe('heartbeatStale', () => {
  const now = Date.parse('2026-06-29T12:00:00.000Z');
  const hb = (lastTickAt: string): PollerHeartbeat => ({ pid: 1, runId: 'r', startedAt: lastTickAt, lastTickAt, currentChunk: null });

  it('missing heartbeat is stale', () => {
    expect(heartbeatStale(null, 30_000, now)).toBe(true);
  });

  it('a tick a few seconds ago is fresh', () => {
    expect(heartbeatStale(hb('2026-06-29T11:59:55.000Z'), 30_000, now)).toBe(false);
  });

  it('a tick 10 minutes ago is stale', () => {
    expect(heartbeatStale(hb('2026-06-29T11:50:00.000Z'), 30_000, now)).toBe(true);
  });

  it('threshold scales with poll interval (90s tick fresh under a 60s poll → 180s window)', () => {
    expect(heartbeatStale(hb('2026-06-29T11:58:30.000Z'), 60_000, now)).toBe(false);
  });

  it('an unparseable timestamp is treated as stale', () => {
    expect(heartbeatStale(hb('not-a-date'), 30_000, now)).toBe(true);
  });
});

describe('isSettled', () => {
  it('imported is settled', () => expect(isSettled(mk({ imported: true }))).toBe(true));
  it('terminally failed is settled', () => expect(isSettled(mk({ terminalReason: 'failed' }))).toBe(true));
  it('in-flight is not settled', () => expect(isSettled(mk({ batchId: 'b', status: 'in_progress' }))).toBe(false));
});

describe('humanizeAgo', () => {
  const now = Date.parse('2026-06-29T12:00:00.000Z');
  it('absent → never', () => expect(humanizeAgo(undefined, now)).toBe('never'));
  it('seconds', () => expect(humanizeAgo('2026-06-29T11:59:55.000Z', now)).toBe('5s ago'));
  it('minutes + seconds', () => expect(humanizeAgo('2026-06-29T11:57:55.000Z', now)).toBe('2m 5s ago'));
  it('hours + minutes', () => expect(humanizeAgo('2026-06-29T08:23:00.000Z', now)).toBe('3h 37m ago'));
});

describe('nextAction', () => {
  it('returns a non-empty instruction for every classification', () => {
    const classes: StallClass[] = [
      'imported',
      'terminal_failed',
      'ready_to_import',
      'local_poller_dead',
      'provider_tail_latency',
      'in_progress',
      'blocked_on_inflight',
      'prepared_idle',
    ];
    for (const c of classes) expect(nextAction(c).length).toBeGreaterThan(0);
  });

  it('terminal_failed points at recovery; local_poller_dead points at starting the poller', () => {
    expect(nextAction('terminal_failed')).toMatch(/recover/i);
    expect(nextAction('local_poller_dead')).toMatch(/poll/i);
  });
});

describe('scanManifests — corrupt files are reported, not silently dropped', () => {
  it('separates usable manifests from torn/empty/foreign files and ignores the heartbeat', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-scan-'));
    try {
      fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(mk({ chunkId: 'good-1' })));
      fs.writeFileSync(path.join(dir, 'torn.json'), '{ "chunkId": "x"'); // truncated — invalid JSON
      fs.writeFileSync(path.join(dir, 'empty.json'), ''); // 0 bytes — the exact crash that killed the old poller
      fs.writeFileSync(path.join(dir, 'nochunk.json'), '{"foo":1}'); // valid JSON, not a manifest
      fs.writeFileSync(path.join(dir, HEARTBEAT_FILE), JSON.stringify({ pid: 1 })); // must be ignored entirely
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'hi'); // non-json — ignored

      const { manifests, skipped } = scanManifests(dir);

      expect(manifests.map((m) => m.chunkId)).toEqual(['good-1']);
      const skippedFiles = skipped.map((s) => s.file).sort();
      expect(skippedFiles).toEqual(['empty.json', 'nochunk.json', 'torn.json']);
      // heartbeat + non-json are neither used nor flagged as corrupt
      expect(skippedFiles).not.toContain(HEARTBEAT_FILE);
      expect(skippedFiles).not.toContain('notes.txt');
      expect(skipped.find((s) => s.file === 'nochunk.json')?.reason).toMatch(/chunkId/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a missing directory yields empty results, not a throw', () => {
    const { manifests, skipped } = scanManifests(path.join(os.tmpdir(), 'batch-scan-does-not-exist-xyz'));
    expect(manifests).toEqual([]);
    expect(skipped).toEqual([]);
  });
});
