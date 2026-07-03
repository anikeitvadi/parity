# Implementation Architecture and Strategic Deployment of an AI-Driven Prediction Market Aggregation System

> Reference document from Perplexity research. Use for architectural decisions and feature planning.

## Architectural Foundations and the AI-Augmented SDLC

The primary objective is to transition prediction market interfaces from mere "mirrors" of raw order book data into analytical "lenses" that provide deep, contextualized research. This requires cross-platform aggregation, real-time AI-generated research briefs, and the surfacing of non-native intelligence signals (superforecaster consensus from Metaculus, on-chain wallet positioning from blockchain ledgers).

### Tech Stack Alignment

- **Frontend:** React 19, Vite, Tailwind CSS v4 — responsive, modular UI for dense financial data streams
- **API:** Hono — lightweight, edge-compatible, native SSE for streaming AI research and real-time data
- **Core Engine:** Shared across server, CLI, and scheduler — API clients (Polymarket CLOB + Gamma, Kalshi, Metaculus), edge detectors, scoring engine
- **Persistence:** SQLite in WAL mode — rapid snapshots, matched markets, transient opportunity caching
- **Scheduler:** Bree — background fetch (15min) and detection (30min) intervals

### AI-Augmented SDLC Phases

| Phase | Objectives | Examples |
|-------|-----------|----------|
| **Inception** | Problem definition, requirement gathering, "Mob Elaboration" | AI-assisted Jira roadmaps, dependency mapping |
| **Data Acquisition** | Gathering, cleaning, transforming multimodal financial data | Semantic deduplication of news, order book normalization, missing value imputation |
| **Construction** | Iterative dev, "Mob Construction," parameter tuning | Training BERT models for financial text classification, fuzzy matching threshold tuning |
| **Testing** | Model performance on unseen data, drift safeguards | SAST in CI/CD, adversarial robustness, precision/recall at K |
| **Deployment** | Live production with oversight | Infrastructure as code, model version control, safe fallback mechanisms |

---

## High-Velocity Data Aggregation and Blockchain Integration

### Data Lifecycle
Six stages: collection → storage → processing → analysis → deployment → archiving.

### Polymarket (On-Chain, Decentralized)
- Operates on **Polygon PoS blockchain**
- Uses **Conditional Token Framework (CTF)** — ERC-1155 tokens
- Users split USDC collateral into YES/NO outcome tokens, redeem based on resolution
- **NegRisk structure** for multi-outcome events: holding NO in one market can be atomically converted to YES in all mutually exclusive alternatives
- Settlement via **UMA Optimistic Oracle** — programmatically verifiable
- Data providers like **Bitquery** supply GraphQL endpoints for tracking positions, splits, payouts
- Real-time streaming via **WebSocket + Kafka**

### Kalshi (Regulated, Centralized)
- CFTC-regulated
- Standard RESTful Events API for prices and categories

### Metaculus (Informational)
- Community/superforecaster predictions via /posts/ endpoint
- Purely informational — contrasted against financialized probabilities

### Latency Requirements
- Market data processing: **< 500ms**
- End-to-end delivery to React frontend: **< 2 seconds**
- Architecture: low-latency pipelines, redundant delivery, optimized Kafka consumers

### API Security

| Strategy | Mechanism | Objective |
|----------|-----------|-----------|
| Dynamic Rate Limiting | Granular constraints by user role + traffic patterns | Prevent API abuse, avoid upstream throttling |
| Multi-Factor Auth | Cryptographic token validation | Restrict high-compute aggregation queries |
| Data Serialization Optimization | CTF on-chain data → standard JSON | Reduce redundant queries, optimize caching |
| Anomaly Detection | Log monitoring for abnormal request patterns | Proactive circuit breaker |

---

## Advanced Semantic Matching and Cross-Platform Event Harmonization

### Why Keyword Matching Fails
- Deterministic, hard-coded rules
- Degrades when identifiers missing, nomenclature differs, structural inconsistencies exist
- **Critical example:** Polymarket temperature contract may use LaGuardia Airport sensor data, while textually identical Kalshi contract uses NOAA Central Park data — fundamentally different claims, naive matching sees them as arbitrage

### Hybrid Matching Methodology

**Layer 1: Fuzzy Matching (fast filter)**
- Levenshtein Distance — minimum character edits
- Jaro-Winkler — prefix-weighted similarity
- N-Grams — overlapping character chunks

**Layer 2: Vector Embeddings (deep semantic)**
- Embed market rules, resolution conditions, expiration dates, descriptions
- Generate high-dimensional "semantic fingerprints"
- Cosine similarity or Euclidean distance in vector hyperspace
- Identifies semantically identical markets even with entirely different phrasing

**Layer 3: Entity Resolution + Logical Implication**
- Agentic AI clusters markets into topical groups
- Identifies cross-platform dependencies (mutually exclusive outcomes, anti-correlated events)
- Research shows: agent-identified relationships achieve **60-70% accuracy**, trading strategies yield **~20% returns over week-long horizons**

### Vector Database Options

| Solution | Architecture | Best For |
|----------|-------------|----------|
| **Milvus/Zilliz** | Distributed | Enterprise-scale, billions of vectors |
| **Pinecone** | Managed serverless | Rapid prototyping |
| **Weaviate** | Open-source | Hybrid search (dense + sparse) |
| **pgvector** | PostgreSQL extension | Systems already on Postgres, <1M vectors |
| **sqlite-vec** | SQLite extension | Single-file, serverless, embedded |

### Recommended: sqlite-vec
- Aligns with existing SQLite/WAL architecture
- Relational data + vector embeddings in single unified transaction
- During Bree detection jobs: KNN search across localized vector space
- Eliminates external network latency during matching
- Embed using local models (Ollama) or OpenAI text-embedding variants

---

## Real-Time Intelligence Synthesis via RAG

### Why RAG
- LLMs have static training cutoffs, hallucinate confidently, lack temporal awareness
- RAG allows dynamic retrieval from external knowledge bases before generation

### Pipeline Architecture

**1. Ingestion & Preprocessing**
- NER models tag articles with entities (people, locations, corporations, tickers)
- Semantic deduplication removes syndicated/reprinted stories
- Reduces vector index bloat and retrieval latency

**2. Chunking & Indexing**
- Overlapping chunks preserve narrative context across boundaries
- Indexed using **HNSW graphs** — optimal speed/recall balance

**3. Parent Document Retrieval**
- Vector search finds the most relevant sub-chunk
- But LLM receives the full parent document for broader context
- **~25% improvement** in retrieval accuracy and generation quality

**4. Streaming Delivery (SSE)**
- Hono `streamSSE()` delivers tokens character-by-character
- Prevents UI blocking during autoregressive generation

### Citation Accuracy

- Commercial generative search engines average **~74% citation accuracy**
- OpenAI SSE stream emits `type: "url_citation"` with `start_index`, `end_index`, `url`, `title`
- **Post-processing verification:** cross-check LLM citations against retrieved parent documents using BERTScore
- Yields **>15% relative improvement** in citation accuracy

---

## Quantitative Analytics: Kelly Criterion

### Standard Kelly Formula

```
f* = (bp - q) / b
```

Where:
- `f*` = optimal bankroll fraction
- `b` = net odds (profit / wager)
- `p` = true probability (from model/superforecasters)
- `q` = 1 - p

### Worked Example
- Polymarket price: 0.60 (market says 60%)
- Model probability: 0.70 (superforecasters say 70%)
- Net odds: (1.00 - 0.60) / 0.60 = 0.67
- **f* = (0.67 × 0.70 - 0.30) / 0.67 ≈ 0.252 (25.2%)**
- Negative f* → zero allocation (no edge)

### Fractional Kelly (what we use)
- Full Kelly maximizes growth but has extreme short-term volatility
- Assumes zero error in probability estimation — unrealistic
- Apply fractional modifier α (typically 0.10-0.40)
- Calibrated by model's historical Brier score
- **Never exceeds 40% of Full Kelly** — protects against catastrophic drawdowns

---

## User Calibration and Brier Score

### Brier Score Formula

```
BS = (f - o)²
```

Where:
- `f` = forecasted probability (0.0 to 1.0)
- `o` = actual outcome (1 or 0)
- **0.0 = perfect prediction, 1.0 = worst possible**

### Penalty Properties
- 90% confident + correct: BS = 0.01 (excellent)
- 90% confident + wrong: BS = 0.81 (severe penalty)
- 50% hedge: BS = 0.25 always (uninformative)

### Calibration Coach
- Plot predicted probabilities vs observed frequencies
- Identify exact probability bands where user is systematically over/underconfident
- Continuous feedback loop for refining internal cognitive models

---

## On-Chain "Smart Money" Profiling

### Challenge: Infrastructure Wallet Filtering
- Polymarket uses infrastructure wallets for CTF splits, NegRisk collateral routing, fee distribution
- These wallets have massive volume but zero directional trading
- **Must be filtered out** before behavioral analysis

### Volume Decomposition
- Distinguish between: share minting, burning, conversion, conventional exchange trading
- Yield accurate: exchange-equivalent volume, net inflow, gross market activity
- Track microstructural indicators like **Kyle's λ** for market depth/liquidity resilience

### Wallet Archetypes

| Archetype | Characteristics | Signal Value |
|-----------|----------------|-------------|
| **Whales** | >$100K positions | Market-moving capital |
| **Snipers** | High win rate, low volume, precision timing | Strongest alpha signal |
| **Herd Followers** | Buy after price moves, momentum-driven | Contrarian indicator |
| **Contrarians** | Consistently bet against consensus | Potential deep value |
| **Fresh Whales** | Newly funded, instant massive positions | Potential insider knowledge |

### Smart Gap Formula
```
Smart Yes = (Yes Vol × Yes Win Rate) / ((Yes Vol × Yes Win Rate) + (No Vol × No Win Rate))
```

### Competitors in This Space
- Betmoar, Guru, Prediction Hunt, Oddpool — all fragmented
- Unifying these signals into one interface is the differentiation

---

## Regulatory Context

- CFTC and state gaming authorities competing for enforcement jurisdiction
- Recent federal appellate decisions classify event contracts as **swaps**
- Platform must include compliance/governance overlays in risk map
- Model explainability and transparency are non-negotiable for adoption
- RAG citations + Kelly derivation display transform AI from "black box" to auditable research assistant
