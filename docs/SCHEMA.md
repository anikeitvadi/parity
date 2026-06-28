# Data & Matching Schema

How market data, embeddings, and the efficiency study are stored — and the planned
production swap to Postgres + pgvector.

## Storage at a glance

The app runs on **SQLite** (`better-sqlite3`, WAL mode) in a single file
(`markets.db`). Vector search uses **`sqlite-vec`**, loaded into the same
connection — so there is *no separate vector database* to stand up. That choice is
deliberate: the headline finding has to be **reproducible from one command on one
machine** (`npm run study`), and a single SQLite file makes that true with zero
infrastructure.

> Embeddings are persisted as `Float32` BLOBs. At the current universe size
> (~1,500 Polymarket × ~719 Kalshi), cross-platform matching is a brute-force
> cosine pass in JS — O(P×K), a few hundred thousand comparisons, sub-second.
> `sqlite-vec` is loaded for vector storage; an approximate-nearest-neighbor index
> only becomes worth it at a much larger universe (see [pgvector](#planned-production-migration--postgres--pgvector)).

## Live application tables (`src/database/schema.ts`)

| Table | Purpose | Key columns |
|---|---|---|
| `market_snapshots` | Time-series of raw market data per platform | `platform`, `market_id`, `timestamp`, `data` (JSON) |
| `matched_markets` | Cross-platform pairs found at runtime | `polymarket_id`, `kalshi_ticker`, `confidence`, `method` |
| `settlement_comparisons` | How alike two markets' settlement rules are | `question_similarity`, `criteria_similarity`, `safe_for_arbitrage` |
| `user_forecasts` | Personal probability calls for calibration | `forecast_probability`, `outcome`, `brier_score` |
| `opportunities` | Scored detector output | `type`, `net_edge`, `score` |

## Embeddings table (`src/services/semantic-matcher.ts`)

```sql
CREATE TABLE market_embedding_meta (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id   TEXT NOT NULL,
  platform    TEXT NOT NULL,
  question    TEXT NOT NULL,
  embedding   BLOB NOT NULL,        -- 1536 × float32 = 6144 bytes
  updated_at  INTEGER NOT NULL,     -- ms epoch; re-embedded if older than 24h
  UNIQUE(platform, market_id)
);
```

- **Model:** OpenAI `text-embedding-3-small` (1536 dimensions). The model name is
  recorded per study run (below) so a result is never ambiguous about how it was
  produced.
- **Freshness:** a market is re-embedded only if its row is older than 24h, so
  repeated study runs are cheap and deterministic on stable inputs.

## Study tables (`src/database/study-store.ts`)

`npm run study` is the reproducible experiment. Each run persists three tables so
the finding is **inspectable, not a runtime vibe** — a reviewer can open the DB and
see exactly why only a handful of markets matched. The *same records* are exported
to [`docs/data/efficiency-study.json`](./data/efficiency-study.json) and
[`gap-map.csv`](./data/gap-map.csv).

### `study_runs` — one self-describing row per run

```sql
CREATE TABLE study_runs (
  run_id               INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at         TEXT NOT NULL,   -- ISO 8601
  embedding_model      TEXT NOT NULL,   -- e.g. text-embedding-3-small
  similarity_threshold REAL NOT NULL,   -- cosine cutoff (0.85)
  round_trip_fees      REAL NOT NULL,   -- Polymarket 2% + Kalshi 7% = 9%
  universe_polymarket  INTEGER NOT NULL,
  universe_kalshi      INTEGER NOT NULL,
  universe_total       INTEGER NOT NULL,
  matched_pairs        INTEGER NOT NULL
);
```

This row carries the four things every result must state to be trustworthy:
**model, threshold, timestamp, and universe size.**

### `study_markets` — point-in-time universe snapshot

```sql
CREATE TABLE study_markets (
  run_id           INTEGER NOT NULL,
  market_id        TEXT NOT NULL,
  platform         TEXT NOT NULL,
  title            TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  close_date       TEXT,
  price            REAL,
  volume           REAL,
  fetched_at       TEXT NOT NULL,
  embedding_model  TEXT NOT NULL
);
```

Every market in the scanned universe at study time. Join to
`market_embedding_meta` on `(platform, market_id)` for the vector. This is what lets
you answer "how many of each platform's markets were even *candidates*?"

### `study_pairs` — the matched pairs and their gap math

```sql
CREATE TABLE study_pairs (
  run_id              INTEGER NOT NULL,
  generated_at        TEXT NOT NULL,
  polymarket_id       TEXT NOT NULL,
  kalshi_id           TEXT NOT NULL,
  polymarket_title    TEXT NOT NULL,
  kalshi_title        TEXT NOT NULL,
  cosine_similarity   REAL NOT NULL,
  polymarket_price    REAL NOT NULL,
  kalshi_price        REAL NOT NULL,
  price_gap           REAL NOT NULL,   -- |poly - kalshi|, gross
  fee_adjusted_gap    REAL NOT NULL,   -- gap - round-trip fees, floored at 0
  surfaced_3pp        INTEGER NOT NULL,-- 0/1 threshold flags
  beats_fees_9pp      INTEGER NOT NULL,
  meets_detector_19pp INTEGER NOT NULL,
  volume              REAL NOT NULL
);
```

Inspect why nothing was tradeable:

```sql
SELECT polymarket_title, cosine_similarity,
       round(price_gap*100,1)  AS gap_pp,
       beats_fees_9pp, meets_detector_19pp
FROM study_pairs
WHERE run_id = (SELECT max(run_id) FROM study_runs)
ORDER BY price_gap DESC;
```

## Reproducibility

`npm run study`:
1. fetches every live market from both public APIs (no auth),
2. embeds new/stale questions with `text-embedding-3-small` (needs `OPENAI_API_KEY`),
3. matches by cosine ≥ 0.85,
4. writes `study_runs` / `study_markets` / `study_pairs` **and** the JSON + CSV
   artifacts from the same in-memory records.

The JSON/CSV are committed so the Lab renders without re-running the study. Re-run
to regenerate from current live data; the artifact's `generatedAt` and
`embeddingModel` always say when and how.

## Planned production migration — Postgres + pgvector

`sqlite-vec` is the right call **now**: single-user, single file, zero-setup,
maximally reproducible for a portfolio reviewer. The moment this needs concurrent
writers, a multi-user calibration history, or a universe large enough that
brute-force cosine stops being instant, the swap is **Postgres + `pgvector`** —
storing embeddings as a real `vector` type with an ANN index instead of a BLOB +
JS loop.

This is documented, not implemented. The intended shape:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE market_embedding (
  market_id   text NOT NULL,
  platform    text NOT NULL,
  question    text NOT NULL,
  embedding   vector(1536) NOT NULL,   -- text-embedding-3-small
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, market_id)
);

-- Approximate-nearest-neighbor index for cosine distance.
CREATE INDEX ON market_embedding
  USING hnsw (embedding vector_cosine_ops);
```

Cross-platform matching then becomes a query instead of an in-memory scan:

```sql
-- Best Kalshi match for one Polymarket question, by cosine similarity.
SELECT k.market_id,
       1 - (k.embedding <=> p.embedding) AS cosine_similarity
FROM market_embedding p, market_embedding k
WHERE p.market_id = $1 AND p.platform = 'polymarket'
  AND k.platform = 'kalshi'
  AND 1 - (k.embedding <=> p.embedding) >= 0.85
ORDER BY k.embedding <=> p.embedding
LIMIT 1;
```

`study_runs` / `study_markets` / `study_pairs` port over unchanged (plain
relational tables). **What changes:** the `<=>` cosine-distance operator + HNSW
index replace the JS cosine loop, turning O(P×K) per run into an indexed lookup —
the only part of the pipeline that doesn't scale as-is.
