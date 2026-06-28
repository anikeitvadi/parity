/**
 * Optional offline source collector for research briefs.
 *
 * Produces real, attributable sources (title + URL + excerpt + provenance) and
 * caches them to docs/data/research-context/<slug>.json. The AI brief and the
 * Research Terminal read these cached artifacts — they never depend on a live
 * scrape at request time, and they never invent citations.
 *
 * Adapters:
 *   - built-in DuckDuckGo web search (no key, no extra deps) — the implemented collector.
 *   - Agent-Reach — a planned optional adapter for richer RSS/GitHub/social/video
 *     sources. It's a separate Python CLI (https://github.com/Panniantong/agent-reach),
 *     not an npm module; we only detect whether it's on PATH. The app never requires it.
 *
 * @module services/source-collector
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const collectorLogger = logger.child({ component: 'source-collector' });

export const RESEARCH_CONTEXT_DIR = join('docs', 'data', 'research-context');

/** A single attributable source. Every field is real or omitted — never guessed. */
export interface Source {
  platform: string; // 'web' | 'rss' | 'github' | 'social' | 'video' | ...
  query: string; // the query that surfaced it
  title: string;
  url: string;
  excerpt: string;
  publishedAt?: string; // ISO 8601, when known
  fetchedAt: string; // ISO 8601
  retrievalMethod: string; // e.g. 'duckduckgo-html', 'agent-reach:rss'
  confidence: number; // 0..1, the adapter's own confidence in relevance
}

/** Cached artifact written to docs/data/research-context/<slug>.json. */
export interface ResearchContextArtifact {
  slug: string;
  query: string;
  market?: { platform: string; id: string; question: string };
  generatedAt: string;
  sources: Source[];
}

/** URL-safe slug for a market question or free-text query. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'untitled';
}

/** DuckDuckGo's HTML results wrap the real URL in a `uddg` redirect param. */
function decodeDuckDuckGoUrl(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      /* fall through */
    }
  }
  return href.startsWith('//') ? `https:${href}` : href;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Built-in web adapter: DuckDuckGo HTML search. No API key. Returns real result
 * titles, decoded URLs, and snippets where available. Best-effort and lightweight.
 */
export async function collectWeb(query: string, limit = 5): Promise<Source[]> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'PredictionMarketResearch/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Snippets, in result order, paired with anchors by index (best-effort).
    const snippets: string[] = [];
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) !== null) snippets.push(decodeEntities(sm[1]));

    const sources: Source[] = [];
    const anchorRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let am: RegExpExecArray | null;
    let i = 0;
    while ((am = anchorRe.exec(html)) !== null && sources.length < limit) {
      const url = decodeDuckDuckGoUrl(am[1]);
      const title = decodeEntities(am[2]);
      if (!title || !url.startsWith('http')) continue;
      sources.push({
        platform: 'web',
        query,
        title,
        url,
        excerpt: snippets[i] ?? '',
        fetchedAt,
        retrievalMethod: 'duckduckgo-html',
        confidence: Math.max(0.3, 0.7 - i * 0.08),
      });
      i++;
    }
    return sources;
  } catch (err) {
    collectorLogger.debug({ err }, 'web source collection failed');
    return [];
  }
}

/**
 * Whether the Agent-Reach CLI is on PATH. Agent-Reach is a separate **Python**
 * tool (https://github.com/Panniantong/agent-reach), not an npm package — so we
 * detect the command instead of importing a module. Its source-collection output
 * isn't wired into this app yet; this only powers an honest "detected vs not
 * installed" message. The implemented collector is the built-in DuckDuckGo adapter
 * (`collectWeb`); richer RSS/GitHub/social/video sources via Agent-Reach are a
 * documented future adapter.
 */
export function agentReachCliAvailable(): boolean {
  try {
    const res = spawnSync('agent-reach', ['--version'], { timeout: 4000, stdio: 'ignore' });
    return !res.error; // res.error (ENOENT) is set when the command isn't found
  } catch {
    return false;
  }
}

/** Read a cached source artifact for a market slug, or null if none exists. */
export function readCachedSources(slug: string): ResearchContextArtifact | null {
  const path = join(RESEARCH_CONTEXT_DIR, `${slug}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ResearchContextArtifact;
  } catch {
    return null;
  }
}

/** Write a cached source artifact for a market slug. Returns the file path. */
export function writeCachedSources(artifact: ResearchContextArtifact): string {
  if (!existsSync(RESEARCH_CONTEXT_DIR)) mkdirSync(RESEARCH_CONTEXT_DIR, { recursive: true });
  const path = join(RESEARCH_CONTEXT_DIR, `${artifact.slug}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}
