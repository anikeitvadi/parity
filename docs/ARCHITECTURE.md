# Architecture & Data Flow

How data moves from three external markets into a single research terminal. Diagrams are
Mermaid (render on GitHub). For the narrative version of the study see [PORTFOLIO.md](./PORTFOLIO.md).

## System overview

```mermaid
flowchart LR
    subgraph ext["External sources"]
        PM["Polymarket Gamma API (on-chain CLOB)"]
        KAL["Kalshi Events API (REST)"]
        MET["Metaculus posts API"]
        OAI["OpenAI / xAI (LLM + embeddings)"]
    end

    subgraph core["src/ — core engine"]
        SVC["Service clients: normalize to Market schema"]
        EMB["Semantic matcher: sqlite-vec embeddings"]
        DET["Detectors + scoring: Kelly, Brier"]
        DB[("SQLite + WAL: snapshots, matches, forecasts, embeddings")]
    end

    subgraph srv["server/ — Hono API :3001"]
        FEED["/feed: universe + divergence"]
        MKT["/markets/:id: enrichments"]
        RES["/research: SSE stream"]
        CAL["/calibration: log, resolve, stats"]
        LABE["/lab/efficiency: study artifact"]
    end

    subgraph web["web/ — React SPA :5173"]
        LIST["Market list"]
        PANE["Decision pane: evidence, brief, sources, your-call"]
        TRK["Track record"]
        LAB["Efficiency Lab: Observable Plot"]
    end

    PM & KAL --> SVC --> DB
    MET --> MKT
    SVC --> EMB
    OAI --> EMB
    EMB --> DB
    DB --> DET
    SVC --> FEED
    EMB --> FEED
    OAI --> RES
    FEED --> LIST --> PANE
    MKT --> PANE
    RES -. tokens .-> PANE
    PANE --> CAL --> TRK
    LABE --> LAB
```

## The core abstraction: one `Market` type

Three sources structure their data completely differently:

| Source | Shape | Prices | Volume unit |
|--------|-------|--------|-------------|
| Polymarket | on-chain CLOB, Gamma REST | decimal strings | **dollars** |
| Kalshi | events → markets, REST | cents → `_dollars` strings | **contracts** |
| Metaculus | community/recency-weighted posts | 0–1 floats | n/a |

Every client normalizes into one Zod-validated `Market` (`src/types/market.ts`): `id`,
`platform`, `question`, `outcomes`, `prices`, `closeDate`, `volume`, `liquidity`, `metadata`.
The hard part is semantic, not syntactic — e.g. Kalshi reports *contracts* while Polymarket
reports *dollars*, so Kalshi volume is converted to approximate USD (`volume_fp × price`)
to make the two sortable on one axis. Multi-outcome Kalshi events repeat the event title on
every market, so the actual option name is pulled from `yes_sub_title`.

## Two request lifecycles worth knowing

**1. The list (`GET /api/opportunities/feed`)** — the full universe plus server-computed
cross-platform divergence:

```mermaid
sequenceDiagram
    participant UI as React list
    participant API as Hono /feed
    participant SVC as Poly + Kalshi clients
    participant VEC as sqlite-vec matcher
    UI->>API: GET /feed
    API->>SVC: getActiveMarkets() (cached 60s)
    API->>VEC: embedMarkets() then findSemanticMatches()
    Note right of VEC: cosine ≥ 0.85 → cross-platform pairs<br/>pure in-memory, no API calls
    VEC-->>API: divergence map {platform:id → signal}
    API-->>UI: items[] (price, volume, type tag, signal, divergence)
```

Divergence is computed **once on the server** and attached to every market, so the list's
Signal/Gap columns are populated and sortable — not derived from per-row clicks. (It lights
up only when a real gap exists; right now there are ~0, which is the whole pivot story.)

**2. The AI brief (`GET /api/markets/:id/research`)** — streamed over Server-Sent Events:

```mermaid
sequenceDiagram
    participant UI as Decision pane
    participant API as Hono /research (SSE)
    participant CTX as Context builder
    participant LLM as xAI Grok / OpenAI GPT-4o
    UI->>API: open EventSource (on "Generate")
    API->>CTX: gather market + cached web sources + Metaculus + cross-platform
    CTX->>LLM: decision-first prompt
    loop token by token
        LLM-->>API: chunk
        API-->>UI: data: chunk
    end
    API-->>UI: done
```

Briefs are **on-demand** (a button, not auto-run) to avoid burning tokens on markets you
don't care about, and stream token-by-token so the pane fills as the model writes. Context
sources are **real and cached** (`docs/data/research-context/`, populated explicitly by
`npm run collect:context` — never scraped at request time) and shown in the pane under
"Sources used"; the prompt forbids invented citations or claimed live retrieval, and
`npm run eval:briefs` (promptfoo, offline) checks that.

## Three TypeScript projects

`src/` (engine), `server/` (API), `web/` (SPA) each have their own `tsconfig` and typecheck
independently — the engine has no React or HTTP dependency and is reused by the server, the
CLI dashboard, and the Bree scheduler. `npm run check` runs all three typechecks + the Vite
build + 408 tests.

## Persistence

SQLite (better-sqlite3, WAL mode) holds `market_snapshots` (price history), `matched_markets`,
`user_forecasts` (calibration), `market_embedding_meta` (1536-dim vectors via sqlite-vec), and
the study tables `study_runs` / `study_markets` / `study_pairs` (one set of rows per `npm run
study`, persisted so the finding is inspectable rather than a runtime vibe). Embedded SQLite is
the deliberate choice for a single-server project — no vector-DB infra, embeddings live in the
same file as the data. The Postgres + pgvector production-migration path and the full schema are
documented in [SCHEMA.md](./SCHEMA.md).
```

