/**
 * Snapshot generator — freezes the live server's responses into web/public/snapshot/ so the SPA
 * can run as a static portfolio bundle (VITE_STATIC=true) with no backend, no DB, and no keys.
 *
 * Run AFTER the verification corpus is locked, with the local server running in LIVE mode:
 *   npm run dev:web            # (or otherwise start the Hono server on :3001 with real keys)
 *   npm run snapshot           # this script
 *
 * It is NOT part of the public build — the public build only READS the JSON this writes.
 * Read paths here mirror the static branches in web/src/api/client.ts (keys: `${platform}:${id}`).
 */

import fs from 'node:fs';
import path from 'node:path';

const SERVER = process.env.SNAPSHOT_SERVER ?? 'http://localhost:3001';
const OUT = 'web/public/snapshot';

async function getJson<T>(p: string): Promise<T> {
  const res = await fetch(`${SERVER}${p}`);
  if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
  return (await res.json()) as T;
}

/** Consume an SSE research stream to completion, returning the accumulated brief text. */
async function getBrief(platform: string, id: string): Promise<string> {
  const res = await fetch(`${SERVER}/api/markets/${encodeURIComponent(id)}/research?platform=${platform}`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]' || data.startsWith('[ERROR]')) return text;
      text += data;
    }
  }
  return text;
}

function write(file: string, data: unknown): void {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(data, null, 2));
  console.log(`  wrote ${file}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Snapshotting ${SERVER} → ${OUT}`);

  const feed = await getJson<{ items?: Array<{ platform: string; marketId: string }> }>('/api/opportunities/feed');
  write('feed.json', feed);

  const details: Record<string, unknown> = {};
  const briefs: Record<string, string> = {};
  const seen = new Set<string>();
  for (const item of feed.items ?? []) {
    const key = `${item.platform}:${item.marketId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      details[key] = await getJson(`/api/markets/${encodeURIComponent(item.marketId)}?platform=${item.platform}`);
    } catch (e) {
      console.warn(`  ! detail ${key}: ${(e as Error).message}`);
    }
    try {
      briefs[key] = await getBrief(item.platform, item.marketId);
    } catch (e) {
      console.warn(`  ! brief ${key}: ${(e as Error).message}`);
    }
  }
  write('market-details.json', details);
  write('briefs.json', briefs);

  write('calibration-stats.json', await getJson('/api/calibration/stats'));
  write('efficiency-study.json', await getJson('/api/lab/efficiency'));
  write('strict-survivors.json', await getJson('/api/lab/strict-survivors'));
  write('corrections.json', await getJson('/api/lab/corrections'));
  write('pairs.json', await getJson('/api/opportunities/pairs?includeStale=true&includeTopical=true&limit=6000'));

  write('snapshot-meta.json', {
    generatedAt: new Date().toISOString(),
    feedCount: feed.items?.length ?? 0,
    markets: seen.size,
  });
  console.log(`Snapshot complete — ${seen.size} markets.`);
}

main().catch((e) => {
  console.error('snapshot failed:', e);
  process.exit(1);
});
