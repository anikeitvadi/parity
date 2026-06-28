# Research-source cache

Cached, attributable sources for the AI research brief. Each file is
`<market-slug>.json` and is read by the Research Terminal ("Sources used") and fed
to the brief as context. The brief consumes these cached artifacts — it never
scrapes live at request time and never invents citations.

These `.json` files are a **local cache** (gitignored, like `markets.db`). They go
stale as markets and news move, so they're regenerated, not committed. This README
is the committed record of the format.

## How it's populated

Explicitly, by running the collector — never by a live scrape during a request:

```bash
npm run collect:context -- "<market question>"
npm run collect:context -- --platform polymarket --id <id>
```

See [`scripts/collect-market-context.ts`](../../../scripts/collect-market-context.ts).
The server and Terminal only ever **read** these files.

## Adapters

- **Built-in web** (implemented) — DuckDuckGo HTML search. No API key, no extra
  dependencies. Returns real titles, decoded URLs, and snippets.
- **Agent-Reach** (planned) — a richer source layer (RSS / GitHub / social / video).
  It's a separate **Python** CLI ([repo](https://github.com/Panniantong/agent-reach)),
  *not* an npm package; the collector detects whether it's on `PATH` and otherwise uses
  the built-in adapter. The app never requires it — an optional local ingestion adapter,
  not a production scraper.

## Schema

```jsonc
{
  "slug": "will-the-federal-reserve-cut-interest-rates-in-september-2026",
  "query": "Will the Federal Reserve cut interest rates in September 2026?",
  "market": { "platform": "polymarket", "id": "0x…", "question": "…" }, // optional
  "generatedAt": "2026-06-27T21:00:00.000Z",
  "sources": [
    {
      "platform": "web",                       // web | rss | github | social | video
      "query": "Will the Federal Reserve cut interest rates in September 2026?",
      "title": "What To Expect From The Fed In 2026",
      "url": "https://www.investopedia.com/what-to-expect-from-the-fed-in-2026-11875776",
      "excerpt": "…",
      "publishedAt": "2026-01-15T00:00:00.000Z", // optional, when known
      "fetchedAt": "2026-06-27T21:00:00.000Z",
      "retrievalMethod": "duckduckgo-html",      // or agent-reach:<adapter>
      "confidence": 0.7                          // 0..1, adapter's relevance estimate
    }
  ]
}
```

Every field is real or omitted — nothing is guessed. If no sources are found, no
file is written and the brief honestly reasons from base rates.
